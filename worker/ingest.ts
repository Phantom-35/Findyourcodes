// Sammelt neue Videos der eingetragenen Kanäle und extrahiert Rabattcodes.
//   npm run ingest
// Ablauf:
//   1. Kanäle aus Supabase laden, neue Videos über die YouTube Data API holen
//   2. Videobeschreibung mit Claude auswerten
//   3. (optional, ENABLE_VIDEO_ANALYSIS=true) Transkript + Einblendungen im Werbeblock auswerten

import { createClient } from "@supabase/supabase-js";
import { brandSlug } from "../lib/brand";
import { config } from "./config";
import { extractFromDescription, extractFromFrames, extractFromTranscript, mightContainDeal, type Offer } from "./extract";
import { extractFrames, fetchTranscript, withTempDir } from "./media";
import { sponsorSegments, type Segment } from "./sponsorblock";
import { latestVideoIds, resolveChannel, videoDetails } from "./youtube";

type Source = "description" | "transcript" | "video";

const db = createClient(config.supabaseUrl, config.supabaseSecretKey, {
  auth: { persistSession: false },
});

async function main() {
  const { data: channels, error } = await db.from("channels").select("*").eq("active", true).order("handle");
  if (error) throw error;
  console.log(`${channels.length} aktive Kanäle`);

  for (const channel of channels) {
    try {
      await processChannel(channel);
    } catch (err) {
      console.error(`Fehler bei @${channel.handle}:`, err instanceof Error ? err.message : err);
    }
  }

  if (config.videoAnalysis) {
    await analyzePendingVideos();
  } else {
    console.log("\nVideo-Analyse ist aus (ENABLE_VIDEO_ANALYSIS=false).");
  }
  console.log("\nFertig.");
}

async function processChannel(channel: {
  id: string;
  handle: string;
  uploads_playlist_id: string | null;
}) {
  console.log(`\n@${channel.handle}`);
  let uploads = channel.uploads_playlist_id;

  if (!uploads) {
    const info = await resolveChannel(channel.handle);
    if (!info) {
      console.warn(`  Kanal @${channel.handle} nicht gefunden – bitte Handle prüfen.`);
      return;
    }
    uploads = info.uploadsPlaylistId;
    await db
      .from("channels")
      .update({
        youtube_channel_id: info.youtubeChannelId,
        uploads_playlist_id: info.uploadsPlaylistId,
        title: info.title,
        thumbnail_url: info.thumbnailUrl,
      })
      .eq("id", channel.id);
  }

  const ids = await latestVideoIds(uploads, config.videosPerChannel);
  const { data: known } = await db.from("videos").select("id").in("id", ids);
  const knownIds = new Set((known ?? []).map((v) => v.id));
  const newIds = ids.filter((id) => !knownIds.has(id));
  console.log(`  ${newIds.length} neue Videos`);

  for (const video of await videoDetails(newIds)) {
    if (video.isLive) continue; // Livestreams später erneut versuchen
    const segments = await sponsorSegments(video.id);
    const { error } = await db.from("videos").insert({
      id: video.id,
      channel_id: channel.id,
      title: video.title,
      description: video.description,
      thumbnail_url: video.thumbnailUrl,
      published_at: video.publishedAt,
      duration_seconds: video.durationSeconds,
      sponsor_segments: segments,
    });
    if (error) {
      console.warn(`  Video ${video.id} konnte nicht gespeichert werden: ${error.message}`);
      continue;
    }

    let offers: Offer[] = [];
    if (mightContainDeal(video.description)) {
      offers = await extractFromDescription(video.title, video.description, video.publishedAt);
      // Ohne genauere Info zeigt der Link auf den Anfang des Werbeblocks.
      if (segments[0]) {
        for (const offer of offers) offer.timestamp_seconds ??= Math.floor(segments[0].start);
      }
    }
    await saveOffers(video.id, offers, "description");
    await db.from("videos").update({ description_analyzed_at: new Date().toISOString() }).eq("id", video.id);
    console.log(`  ✓ ${video.title.slice(0, 70)} – ${describe(offers)}`);
  }

  await db.from("channels").update({ last_checked_at: new Date().toISOString() }).eq("id", channel.id);
}

async function analyzePendingVideos() {
  const since = new Date(Date.now() - config.videoAnalysisMaxAgeDays * 86400_000).toISOString();
  const statuses = config.retryFailedVideos ? ["pending", "failed"] : ["pending"];
  const { data: videos, error } = await db
    .from("videos")
    .select("id, title, published_at, sponsor_segments, duration_seconds")
    .in("video_analysis_status", statuses)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(config.videoAnalysisLimit);
  if (error) throw error;

  console.log(`\nVideo-Analyse für ${videos.length} Videos`);
  for (const video of videos) {
    console.log(`  ▶ ${video.title.slice(0, 70)}`);
    try {
      const status = await analyzeVideo(video);
      await db
        .from("videos")
        .update({ video_analysis_status: status, video_analysis_error: null, video_analyzed_at: new Date().toISOString() })
        .eq("id", video.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`    fehlgeschlagen: ${message.split("\n").find((l) => l.includes("ERROR")) ?? message.slice(0, 200)}`);
      await db
        .from("videos")
        .update({ video_analysis_status: "failed", video_analysis_error: message.slice(0, 2000) })
        .eq("id", video.id);
    }
  }
}

async function analyzeVideo(video: {
  id: string;
  title: string;
  published_at: string;
  sponsor_segments: Segment[];
}): Promise<"done" | "skipped"> {
  return withTempDir(async (dir) => {
    // SponsorBlock nochmal fragen – oft werden Segmente erst nach ein paar Stunden eingetragen.
    let segments = await sponsorSegments(video.id);
    if (segments.length === 0) segments = video.sponsor_segments ?? [];

    const transcript = await fetchTranscript(video.id, dir).catch((err) => {
      console.warn(`    kein Transkript: ${String(err).slice(0, 120)}`);
      return null;
    });

    if (transcript && mightContainDeal(transcript)) {
      const result = await extractFromTranscript(video.title, video.published_at, transcript);
      if (result) {
        await saveOffers(video.id, result.offers, "transcript");
        console.log(`    Transkript: ${describe(result.offers)}`);
        if (segments.length === 0) segments = result.sponsor_ranges;
      }
    }

    if (segments.length === 0) {
      console.log("    kein Werbeblock gefunden");
      return transcript ? "done" : "skipped";
    }

    await db.from("videos").update({ sponsor_segments: segments }).eq("id", video.id);
    const frames = await extractFrames(video.id, segments, dir);
    if (frames.length > 0) {
      const offers = await extractFromFrames(video.title, video.published_at, frames);
      await saveOffers(video.id, offers, "video");
      console.log(`    Einblendungen (${frames.length} Bilder): ${describe(offers)}`);
    }
    return "done";
  });
}

type CodeRow = {
  id?: string;
  video_id: string;
  brand: string;
  brand_slug: string;
  code: string | null;
  code_key: string;
  offer: string | null;
  url: string | null;
  sources: string[];
  expires_at: string | null;
  expiry_note: string | null;
  video_timestamp: number | null;
};

/** Führt neue Funde mit bereits gespeicherten Codes desselben Videos zusammen. */
async function saveOffers(videoId: string, offers: Offer[], source: Source) {
  if (offers.length === 0) return;
  const { data: existing, error } = await db.from("codes").select("*").eq("video_id", videoId);
  if (error) throw error;
  const rows: CodeRow[] = existing ?? [];
  const touched = new Set<CodeRow>();

  for (const offer of offers) {
    const slug = brandSlug(offer.brand);
    if (!slug) continue;
    const code = offer.code?.trim() || null;
    const codeKey = code?.toUpperCase() ?? "";
    const sameBrand = rows.filter((r) => r.brand_slug === slug);

    let row =
      sameBrand.find((r) => r.code_key === codeKey) ??
      (code ? sameBrand.find((r) => r.code_key === "") : sameBrand[0]);

    if (!row) {
      row = {
        video_id: videoId,
        brand: offer.brand.trim(),
        brand_slug: slug,
        code: null,
        code_key: "",
        offer: null,
        url: null,
        sources: [],
        expires_at: null,
        expiry_note: null,
        video_timestamp: null,
      };
      rows.push(row);
    }

    if (code && !row.code) {
      row.code = code;
      row.code_key = codeKey;
    }
    row.offer ??= offer.offer;
    row.url ??= offer.url;
    row.expires_at ??= validDate(offer.expires_at);
    row.expiry_note ??= offer.expiry_note;
    // Zeitstempel aus dem Video selbst sind genauer als der Beginn des Werbeblocks.
    if (offer.timestamp_seconds != null && (source !== "description" || row.video_timestamp == null)) {
      row.video_timestamp = Math.max(0, Math.floor(offer.timestamp_seconds));
    }
    if (!row.sources.includes(source)) row.sources = [...row.sources, source];
    touched.add(row);
  }

  for (const row of touched) {
    // Nur eigene Felder schreiben – Abstimmungen etc. bleiben unangetastet.
    const { id, video_id, brand, brand_slug, code, code_key, offer, url, sources, expires_at, expiry_note, video_timestamp } = row;
    const values = { video_id, brand, brand_slug, code, code_key, offer, url, sources, expires_at, expiry_note, video_timestamp };
    const result = id
      ? await db.from("codes").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id)
      : await db.from("codes").upsert(values, { onConflict: "video_id,brand_slug,code_key" });
    if (result.error) console.warn(`    Speichern fehlgeschlagen (${row.brand}): ${result.error.message}`);
  }
}

function validDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}

function describe(offers: Offer[]): string {
  if (offers.length === 0) return "keine Codes";
  return offers.map((o) => (o.code ? `${o.brand}: ${o.code}` : o.brand)).join(", ");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
