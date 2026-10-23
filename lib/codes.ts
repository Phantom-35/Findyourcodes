import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cacheLife } from "next/cache";

export type CodeEntry = {
  id: string;
  brand: string;
  brand_slug: string;
  code: string | null;
  offer: string | null;
  url: string | null;
  sources: ("description" | "transcript" | "video")[];
  expires_at: string | null;
  expiry_note: string | null;
  video_timestamp: number | null;
  works_votes: number;
  broken_votes: number;
  created_at: string;
  video_id: string;
  video_title: string;
  video_thumbnail_url: string | null;
  published_at: string;
  channel_handle: string;
  channel_title: string | null;
  channel_thumbnail_url: string | null;
};

export type BrandCount = { brand_slug: string; brand: string; code_count: number };

let client: SupabaseClient | null = null;

export function isConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function supabase(): SupabaseClient {
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });
  return client;
}

export async function getCodes(brand: string | null, query: string | null): Promise<CodeEntry[]> {
  "use cache";
  cacheLife("minutes");
  if (!isConfigured()) return [];

  let request = supabase().from("code_feed").select("*").order("published_at", { ascending: false }).limit(150);
  if (brand) request = request.eq("brand_slug", brand);
  if (query) {
    const q = query.replace(/[%,()]/g, " ").trim();
    if (q) {
      request = request.or(
        `brand.ilike.%${q}%,code.ilike.%${q}%,offer.ilike.%${q}%,channel_title.ilike.%${q}%,channel_handle.ilike.%${q}%`,
      );
    }
  }
  const { data, error } = await request;
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data as CodeEntry[];
}

export async function getBrands(): Promise<BrandCount[]> {
  "use cache";
  cacheLife("minutes");
  if (!isConfigured()) return [];

  const { data, error } = await supabase()
    .from("brand_counts")
    .select("brand_slug, brand, code_count")
    .order("code_count", { ascending: false })
    .limit(40);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data as BrandCount[];
}
