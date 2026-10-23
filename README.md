# FindYourCodes

Web-App, die Rabattcodes und Gratis-Angebote aus YouTube-Videos sammelt (z. B. NordVPN-Codes von Tomatolix,
Simplicissimus, AeroNewsGermany, …) und nach Marke filterbar macht – mit Datum, wann der Code gezeigt wurde,
und wie lange er noch gültig ist.

**➡️ Einrichtung: siehe [SETUP.md](SETUP.md)**

## Wie es funktioniert

```
GitHub Actions (alle 3 h)            Dein PC (optional)
        │                                   │
        ▼                                   ▼
  worker/ingest.ts  ── YouTube Data API ──► neue Videos + Beschreibungen
        │           ── SponsorBlock ──────► wo ist der Werbeblock?
        │           ── yt-dlp + ffmpeg ───► Untertitel + Standbilder vom Werbeblock (nur lokal)
        │           ── Claude ────────────► Marke, Code, Angebot, Ablaufdatum
        ▼
     Supabase (channels, videos, codes)
        ▲
        │
  Next.js-Web-App (Vercel) – Suche, Marken-Filter, 👍/👎
```

| Ordner | Inhalt |
| --- | --- |
| `app/` | Web-App (Next.js) |
| `lib/` | Datenbankabfragen, Hilfsfunktionen |
| `worker/` | Sammel-Skript (`npm run ingest`) |
| `supabase/migrations/` | Datenbankschema + Start-Kanäle |
| `.github/workflows/` | Automatischer Lauf alle 3 Stunden |

## Befehle

```bash
npm run dev        # Web-App lokal starten
npm run ingest     # Codes sammeln
npm run build      # Produktions-Build
npm run lint
npm run typecheck
```
