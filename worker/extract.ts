import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "./config";

const client = new Anthropic();

const OfferSchema = z.object({
  brand: z.string().describe("Name of the sponsor/brand as commonly written, e.g. 'NordVPN', 'HelloFresh'"),
  code: z.string().nullable().describe("The discount/voucher code exactly as written, or null if there is none"),
  offer: z
    .string()
    .nullable()
    .describe("Short German description of the deal, e.g. '4 Monate gratis + 73 % Rabatt'"),
  url: z.string().nullable().describe("The sponsor/affiliate link for this deal, if given"),
  expires_at: z.string().nullable().describe("Expiry date as YYYY-MM-DD, only if explicitly stated or clearly derivable"),
  expiry_note: z.string().nullable().describe("Expiry wording as stated, e.g. 'nur bis Sonntag', or null"),
  timestamp_seconds: z
    .number()
    .nullable()
    .describe("Second in the video where the deal is shown or mentioned, if known"),
});

export type Offer = z.infer<typeof OfferSchema>;

const OffersResult = z.object({ offers: z.array(OfferSchema) });

const TranscriptResult = z.object({
  offers: z.array(OfferSchema),
  sponsor_ranges: z
    .array(z.object({ start: z.number(), end: z.number() }))
    .describe("Time ranges (seconds) of sponsored/ad segments in the video"),
});

const SYSTEM = `You extract sponsor deals from German and English YouTube content.

A deal is a promotion by a paying sponsor/advertising partner where viewers get a benefit:
a discount code, voucher, free trial/free weeks/months, bonus, or a special affiliate link with an offer.

Rules:
- Only include deals from sponsors/advertising partners (including affiliate deals).
- Do NOT include: plain social media links, Patreon/Steady/channel memberships, the creator's own merch without a discount, equipment lists without a deal, generic Amazon affiliate links without an offer.
- Copy codes exactly (case-sensitive). Never invent a code. If only a link is given, set code to null.
- If the same brand appears several times, merge it into one entry.
- Write 'offer' in short German.
- Return an empty list if there is no deal.`;

async function run<T extends z.ZodType>(
  schema: T,
  content: Anthropic.ContentBlockParam[],
): Promise<z.infer<T> | null> {
  try {
    const response = await client.messages.parse({
      model: config.claudeModel,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { effort: "low", format: zodOutputFormat(schema) },
    });
    if (response.stop_reason === "refusal") {
      console.warn("    Claude hat die Anfrage abgelehnt:", response.stop_details?.category);
      return null;
    }
    return response.parsed_output ?? null;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      console.warn("    Claude Rate-Limit erreicht – übersprungen");
    } else if (error instanceof Anthropic.APIError) {
      console.warn(`    Claude API-Fehler ${error.status}: ${error.message}`);
    } else {
      throw error;
    }
    return null;
  }
}

// Günstiger Vorfilter, damit nicht jede Beschreibung an Claude geht.
const DEAL_HINT =
  /(code|gutschein|rabatt|discount|gratis|kostenlos|free|sponsor|gesponsert|werbung|anzeige|partner|deal|angebot|promo|prozent|monate|wochen|trial|testen)|\d\s?%/i;

export function mightContainDeal(text: string): boolean {
  return DEAL_HINT.test(text);
}

export async function extractFromDescription(title: string, description: string, publishedAt: string) {
  const result = await run(OffersResult, [
    {
      type: "text",
      text: `Video title: ${title}\nPublished: ${publishedAt}\n\nVideo description:\n${description}`,
    },
  ]);
  return result?.offers ?? [];
}

export async function extractFromTranscript(title: string, publishedAt: string, transcript: string) {
  return run(TranscriptResult, [
    {
      type: "text",
      text:
        `Video title: ${title}\nPublished: ${publishedAt}\n\n` +
        `Below is the auto-generated transcript with timestamps [mm:ss]. ` +
        `Spoken codes may be misspelled by speech recognition – only include a code if it is clearly spelled out or obvious. ` +
        `Also return the time ranges of sponsored segments.\n\n${transcript}`,
    },
  ]);
}

export async function extractFromFrames(
  title: string,
  publishedAt: string,
  frames: { seconds: number; jpegBase64: string }[],
) {
  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text:
        `Video title: ${title}\nPublished: ${publishedAt}\n\n` +
        `These are frames from the sponsored segment of the video. ` +
        `Read any discount code, link or offer that is shown on screen (overlays, banners, lower thirds). ` +
        `Each frame is preceded by its timestamp in seconds.`,
    },
  ];
  for (const frame of frames) {
    content.push({ type: "text", text: `Frame at ${Math.round(frame.seconds)}s:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: frame.jpegBase64 },
    });
  }
  const result = await run(OffersResult, content);
  return result?.offers ?? [];
}
