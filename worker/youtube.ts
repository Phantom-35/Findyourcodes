import { config } from "./config";

const API = "https://www.googleapis.com/youtube/v3";

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("key", config.youtubeApiKey);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube API ${path}: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

type Thumbnails = Record<string, { url: string } | undefined>;

function bestThumbnail(thumbnails: Thumbnails | undefined): string | null {
  if (!thumbnails) return null;
  return (thumbnails.maxres ?? thumbnails.high ?? thumbnails.medium ?? thumbnails.default)?.url ?? null;
}

export type ChannelInfo = {
  youtubeChannelId: string;
  uploadsPlaylistId: string;
  title: string;
  thumbnailUrl: string | null;
};

export async function resolveChannel(handle: string): Promise<ChannelInfo | null> {
  const data = await get<{
    items?: {
      id: string;
      snippet: { title: string; thumbnails?: Thumbnails };
      contentDetails: { relatedPlaylists: { uploads: string } };
    }[];
  }>("channels", { part: "snippet,contentDetails", forHandle: `@${handle}` });
  const item = data.items?.[0];
  if (!item) return null;
  return {
    youtubeChannelId: item.id,
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    title: item.snippet.title,
    thumbnailUrl: bestThumbnail(item.snippet.thumbnails),
  };
}

export async function latestVideoIds(uploadsPlaylistId: string, max: number): Promise<string[]> {
  const data = await get<{ items?: { contentDetails: { videoId: string } }[] }>("playlistItems", {
    part: "contentDetails",
    playlistId: uploadsPlaylistId,
    maxResults: String(Math.min(max, 50)),
  });
  return (data.items ?? []).map((item) => item.contentDetails.videoId);
}

export type VideoInfo = {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  isLive: boolean;
};

export async function videoDetails(ids: string[]): Promise<VideoInfo[]> {
  if (ids.length === 0) return [];
  const data = await get<{
    items?: {
      id: string;
      snippet: {
        title: string;
        description: string;
        publishedAt: string;
        thumbnails?: Thumbnails;
        liveBroadcastContent?: string;
      };
      contentDetails: { duration?: string };
    }[];
  }>("videos", { part: "snippet,contentDetails", id: ids.join(",") });
  return (data.items ?? []).map((item) => ({
    id: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    publishedAt: item.snippet.publishedAt,
    thumbnailUrl: bestThumbnail(item.snippet.thumbnails),
    durationSeconds: parseIsoDuration(item.contentDetails.duration),
    isLive: item.snippet.liveBroadcastContent === "live" || item.snippet.liveBroadcastContent === "upcoming",
  }));
}

/** "PT1H2M3S" -> 3723 */
export function parseIsoDuration(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return null;
  const [, d, h, m, s] = match.map((part) => Number(part ?? 0));
  return d * 86400 + h * 3600 + m * 60 + s;
}
