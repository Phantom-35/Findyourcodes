import dotenv from "dotenv";

// Gleiche Datei wie die Web-App: erst .env.local, dann .env
dotenv.config({ path: [".env.local", ".env"], quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Fehlende Umgebungsvariable: ${name} (siehe .env.example)`);
    process.exit(1);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "ja"].includes(value.toLowerCase());
}

function int(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  youtubeApiKey: required("YOUTUBE_API_KEY"),
  // ANTHROPIC_API_KEY wird vom SDK direkt aus der Umgebung gelesen.
  claudeModel: process.env.CLAUDE_MODEL || "claude-opus-5-5",

  /** Wie viele der neuesten Videos pro Kanal geprüft werden. */
  videosPerChannel: int("VIDEOS_PER_CHANNEL", 10),

  /** Video-Analyse (Transkript + Einblendungen). Braucht yt-dlp, ffmpeg und deno. */
  videoAnalysis: bool("ENABLE_VIDEO_ANALYSIS", false),
  videoAnalysisLimit: int("VIDEO_ANALYSIS_LIMIT", 20),
  videoAnalysisMaxAgeDays: int("VIDEO_ANALYSIS_MAX_AGE_DAYS", 30),
  retryFailedVideos: bool("RETRY_FAILED_VIDEOS", false),
  ytDlpPath: process.env.YTDLP_PATH || "yt-dlp",
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  /** z.B. "--cookies-from-browser firefox" */
  ytDlpExtraArgs: (process.env.YTDLP_EXTRA_ARGS || "").split(" ").filter(Boolean),
  maxFramesPerVideo: int("MAX_FRAMES_PER_VIDEO", 16),
};
