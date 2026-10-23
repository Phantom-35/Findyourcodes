// Holt Transkript und Standbilder eines Videos über yt-dlp + ffmpeg.
// Hinweis: YouTube blockiert Downloads von Rechenzentrums-IPs (z.B. GitHub Actions)
// meist mit "Sign in to confirm you're not a bot". Am besten vom eigenen PC ausführen.

import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "./config";
import type { Segment } from "./sponsorblock";

const exec = promisify(execFile);

const FRAME_INTERVAL_SECONDS = 3;
const MAX_SEGMENT_SECONDS = 180;

async function ytDlp(args: string[], timeoutMs: number) {
  return exec(config.ytDlpPath, [...config.ytDlpExtraArgs, "--no-progress", "--no-warnings", ...args], {
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
  });
}

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "findyourcodes-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Liefert das Transkript als "[mm:ss] Text"-Zeilen oder null, wenn keins verfügbar ist. */
export async function fetchTranscript(videoId: string, dir: string): Promise<string | null> {
  await ytDlp(
    [
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "de,de-DE,de-orig,en,en-US,en-orig",
      "--sub-format",
      "vtt",
      "-o",
      path.join(dir, "subs.%(ext)s"),
      `https://www.youtube.com/watch?v=${videoId}`,
    ],
    120_000,
  );
  const files = (await readdir(dir)).filter((f) => f.startsWith("subs.") && f.endsWith(".vtt"));
  const pick =
    files.find((f) => /\.de(-DE)?\.vtt$/.test(f)) ??
    files.find((f) => f.includes(".de")) ??
    files.find((f) => f.includes(".en")) ??
    files[0];
  if (!pick) return null;
  return vttToText(await readFile(path.join(dir, pick), "utf8"));
}

/** Wandelt (Auto-)Untertitel in kompakte Zeilen mit Zeitstempel um, ca. alle 10 Sekunden. */
export function vttToText(vtt: string): string {
  const lines: string[] = [];
  let chunkStart = -1;
  let chunk: string[] = [];
  let lastLine = "";
  let cueStart = 0;

  const flush = () => {
    if (chunk.length > 0) lines.push(`[${formatTime(chunkStart)}] ${chunk.join(" ")}`);
    chunk = [];
    chunkStart = -1;
  };

  for (const raw of vtt.split(/\r?\n/)) {
    const time = /^(\d{2}):(\d{2}):(\d{2})\.\d{3}\s+-->/.exec(raw);
    if (time) {
      cueStart = Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]);
      continue;
    }
    if (!raw.trim() || raw.startsWith("WEBVTT") || /^(Kind|Language):/.test(raw)) continue;
    const text = raw
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    // Auto-Untertitel wiederholen die vorherige Zeile in jedem Cue.
    if (!text || text === lastLine) continue;
    lastLine = text;
    if (chunkStart < 0) chunkStart = cueStart;
    chunk.push(text);
    if (cueStart - chunkStart >= 10) flush();
  }
  flush();
  return lines.join("\n");
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

/** Lädt nur die Werbeblöcke herunter und zieht daraus Standbilder. */
export async function extractFrames(
  videoId: string,
  segments: Segment[],
  dir: string,
): Promise<{ seconds: number; jpegBase64: string }[]> {
  const frames: { seconds: number; file: string }[] = [];

  for (const [index, segment] of segments.slice(0, 2).entries()) {
    const start = Math.max(0, Math.floor(segment.start));
    const end = Math.min(Math.ceil(segment.end), start + MAX_SEGMENT_SECONDS);
    const base = `seg${index}`;

    await ytDlp(
      [
        "-f",
        "bv*[height<=720][ext=mp4]/bv*[height<=720]/b[height<=720]/b",
        "--download-sections",
        `*${start}-${end}`,
        "--ffmpeg-location",
        config.ffmpegPath,
        "-o",
        path.join(dir, `${base}.%(ext)s`),
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      300_000,
    );

    const video = (await readdir(dir)).find((f) => f.startsWith(`${base}.`) && !f.endsWith(".part"));
    if (!video) continue;

    await exec(
      config.ffmpegPath,
      [
        "-loglevel",
        "error",
        "-i",
        path.join(dir, video),
        "-vf",
        `fps=1/${FRAME_INTERVAL_SECONDS},scale='min(1280,iw)':-2`,
        "-q:v",
        "4",
        path.join(dir, `${base}_%03d.jpg`),
      ],
      { timeout: 120_000 },
    );

    const images = (await readdir(dir)).filter((f) => f.startsWith(`${base}_`) && f.endsWith(".jpg")).sort();
    images.forEach((file, i) => frames.push({ seconds: start + i * FRAME_INTERVAL_SECONDS, file }));
  }

  const picked = sampleEvenly(frames, config.maxFramesPerVideo);
  return Promise.all(
    picked.map(async (frame) => ({
      seconds: frame.seconds,
      jpegBase64: (await readFile(path.join(dir, frame.file))).toString("base64"),
    })),
  );
}

function sampleEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = items.length / max;
  return Array.from({ length: max }, (_, i) => items[Math.floor(i * step)]);
}
