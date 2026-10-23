"use client";

import { useState } from "react";
import { ESTIMATED_VALIDITY_DAYS } from "@/lib/brand";
import type { CodeEntry } from "@/lib/codes";

const SOURCE_LABEL: Record<string, string> = {
  description: "Beschreibung",
  transcript: "Gesprochen",
  video: "Eingeblendet",
};

const DAY = 86_400_000;
const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

function validity(entry: CodeEntry, now: number) {
  const until = entry.expires_at
    ? new Date(`${entry.expires_at}T23:59:59`)
    : new Date(new Date(entry.published_at).getTime() + ESTIMATED_VALIDITY_DAYS * DAY);
  const daysLeft = Math.ceil((until.getTime() - now) / DAY);
  const estimated = !entry.expires_at;
  let label: string;
  if (daysLeft < 0) label = estimated ? "Wahrscheinlich abgelaufen" : "Abgelaufen";
  else if (daysLeft === 0) label = "Läuft heute ab";
  else label = `${estimated ? "ca. " : ""}noch ${daysLeft} ${daysLeft === 1 ? "Tag" : "Tage"}`;
  return { until, daysLeft, estimated, label };
}

export function CodeCard({ entry, now }: { entry: CodeEntry; now: number }) {
  const [copied, setCopied] = useState(false);
  const [votes, setVotes] = useState({ works: entry.works_votes, broken: entry.broken_votes });
  const [voted, setVoted] = useState(false);

  const v = validity(entry, now);
  const expired = v.daysLeft < 0;
  const videoUrl =
    `https://www.youtube.com/watch?v=${entry.video_id}` + (entry.video_timestamp ? `&t=${entry.video_timestamp}s` : "");

  async function copy() {
    if (!entry.code) return;
    await navigator.clipboard.writeText(entry.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function vote(works: boolean) {
    if (voted) return;
    setVoted(true);
    setVotes((prev) => (works ? { ...prev, works: prev.works + 1 } : { ...prev, broken: prev.broken + 1 }));
    await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, works }),
    }).catch(() => undefined);
  }

  return (
    <article
      className={`flex flex-col gap-3 rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900 ${
        expired ? "opacity-60" : ""
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{entry.brand}</h2>
          {entry.offer && <p className="text-sm text-neutral-600 dark:text-neutral-400">{entry.offer}</p>}
        </div>
        <span
          title={`${v.estimated ? "Geschätzt" : "Laut Video"} gültig bis ${dateFormat.format(v.until)}${
            entry.expiry_note ? ` (${entry.expiry_note})` : ""
          }`}
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            expired
              ? "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
              : v.daysLeft <= 7
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          }`}
        >
          {v.label}
        </span>
      </header>

      {entry.code ? (
        <button
          onClick={copy}
          className="flex items-center justify-between rounded-xl border-2 border-dashed border-violet-400 bg-violet-50 px-4 py-2.5 font-mono text-lg font-bold tracking-wide text-violet-900 transition hover:bg-violet-100 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-200"
        >
          <span className="truncate">{entry.code}</span>
          <span className="ml-3 shrink-0 font-sans text-xs font-medium">{copied ? "Kopiert ✓" : "Kopieren"}</span>
        </button>
      ) : (
        <p className="rounded-xl bg-neutral-100 px-4 py-2.5 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          Kein Code nötig – Angebot gilt über den Link.
        </p>
      )}

      {entry.url && (
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-sm text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
        >
          {entry.url.replace(/^https?:\/\//, "")}
        </a>
      )}

      <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="group flex gap-3">
        {entry.video_thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.video_thumbnail_url}
            alt=""
            className="aspect-video w-28 shrink-0 rounded-lg object-cover"
            loading="lazy"
          />
        )}
        <div className="min-w-0 text-sm">
          <p className="line-clamp-2 font-medium group-hover:underline">{entry.video_title}</p>
          <p className="text-neutral-500">
            {entry.channel_title ?? `@${entry.channel_handle}`} · gezeigt am{" "}
            {dateFormat.format(new Date(entry.published_at))}
          </p>
        </div>
      </a>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-black/5 pt-3 dark:border-white/10">
        <div className="flex flex-wrap gap-1">
          {entry.sources.map((source) => (
            <span
              key={source}
              className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            >
              {SOURCE_LABEL[source] ?? source}
            </span>
          ))}
        </div>
        <div className="flex gap-1 text-sm">
          <button
            onClick={() => vote(true)}
            disabled={voted}
            className="rounded-lg px-2 py-1 hover:bg-emerald-50 disabled:cursor-default dark:hover:bg-emerald-950"
            title="Code funktioniert"
          >
            👍 {votes.works}
          </button>
          <button
            onClick={() => vote(false)}
            disabled={voted}
            className="rounded-lg px-2 py-1 hover:bg-red-50 disabled:cursor-default dark:hover:bg-red-950"
            title="Code funktioniert nicht"
          >
            👎 {votes.broken}
          </button>
        </div>
      </footer>
    </article>
  );
}
