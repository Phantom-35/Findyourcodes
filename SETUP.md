# Einrichtung – Schritt für Schritt

Du brauchst 4 kostenlose bzw. günstige Konten: **Supabase** (Datenbank), **Google Cloud** (YouTube-API-Key),
**Anthropic** (Claude liest die Codes aus) und **Vercel** (Hosting der Web-App). GitHub hast du schon.

Dauer: ca. 30 Minuten.

---

## 1. Supabase-Projekt anlegen (Datenbank)

1. Auf <https://supabase.com> einloggen → **New project**.
2. Name z. B. `findyourcodes`, ein **Datenbank-Passwort** vergeben (gut aufheben), Region **Central EU (Frankfurt)**.
3. Warten, bis das Projekt fertig ist (1–2 Minuten).
4. Links im Menü **SQL Editor** öffnen → **New query**.
5. Den kompletten Inhalt der Datei [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) hineinkopieren → **Run**.
   Danach gibt es die Tabellen `channels`, `videos`, `codes`, und die Start-Kanäle (Tomatolix, AeroNewsGermany, Simplicissimus, …) sind eingetragen.
6. Links unten **Project Settings** → **API Keys**. Dort brauchst du drei Werte:
   - **Project URL** (steht unter *Project Settings → Data API*, Format `https://xxxx.supabase.co`)
   - **Publishable key** (`sb_publishable_…`) – darf öffentlich sein
   - **Secret key** (`sb_secret_…`, auf „Reveal“ klicken) – **geheim halten!**

   > Ältere Projekte zeigen stattdessen `anon` (= publishable) und `service_role` (= secret). Das funktioniert genauso.

> Weitere Kanäle hinzufügen: im **Table Editor** → Tabelle `channels` → **Insert row** → bei `handle` den YouTube-Handle **ohne @** eintragen (z. B. `Tomatolix`). Den Rest füllt der Worker automatisch aus.

## 2. YouTube-API-Key (Google Cloud)

1. <https://console.cloud.google.com> → oben **Projekt auswählen → Neues Projekt** (Name egal).
2. Menü **APIs & Dienste → Bibliothek** → nach **YouTube Data API v3** suchen → **Aktivieren**.
3. **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → API-Schlüssel**.
4. Den Schlüssel (`AIza…`) kopieren. Empfehlung: **Schlüssel bearbeiten → API-Einschränkungen → YouTube Data API v3** auswählen.

Kostenlos: 10.000 Einheiten pro Tag. Der Worker braucht pro Lauf ca. 2 Einheiten pro Kanal – also kein Problem.

## 3. Claude-API-Key (Anthropic)

1. <https://console.anthropic.com> → einloggen → **Billing**: etwas Guthaben aufladen (z. B. 5–10 $).
2. **API Keys → Create Key** → Schlüssel (`sk-ant-…`) kopieren.

**Kosten (grob):** Standardmäßig wird `claude-opus-5-5` benutzt.
- Nur Videobeschreibungen: ca. 1–2 Cent pro Video → bei ~27 Kanälen ungefähr **1–2 $ pro Woche**.
- Mit Video-Analyse (Transkript + Bilder): ca. 10–20 Cent pro Video → ungefähr **10 $ pro Woche**.

Deutlich günstiger (ca. 40× billiger, etwas ungenauer): `CLAUDE_MODEL=claude-haiku-5-5` setzen.

## 4. Lokal ausprobieren

Voraussetzung: [Node.js 22](https://nodejs.org) ist installiert.

```bash
git clone https://github.com/phantom-35/findyourcodes.git
cd findyourcodes
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
```

Jetzt `.env.local` öffnen und die Werte aus Schritt 1–3 eintragen. Dann:

```bash
npm run ingest   # sammelt Codes (erster Lauf dauert ein paar Minuten)
npm run dev      # startet die Web-App auf http://localhost:3000
```

## 5. Automatisch sammeln lassen (GitHub Actions)

Der Workflow [`.github/workflows/ingest.yml`](.github/workflows/ingest.yml) läuft alle 3 Stunden und wertet die **Videobeschreibungen** aus.

1. Auf GitHub im Repo: **Settings → Secrets and variables → Actions → New repository secret**.
2. Diese vier Secrets anlegen (gleiche Werte wie in `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `YOUTUBE_API_KEY`
   - `ANTHROPIC_API_KEY`
3. Optional unter dem Tab **Variables**: `CLAUDE_MODEL` = `claude-haiku-5-5` (wenn du sparen willst).
4. Testen: **Actions** → „Codes sammeln“ → **Run workflow**.

## 6. Web-App online stellen (Vercel)

1. <https://vercel.com> → mit GitHub einloggen → **Add New → Project** → Repo `findyourcodes` importieren.
2. Unter **Environment Variables** genau diese zwei eintragen (**nicht** den Secret Key!):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. **Deploy**. Danach bekommst du eine URL wie `findyourcodes.vercel.app`.

## 7. Codes aus dem Video selbst (Einblendungen + Gesprochenes)

Das ist der aufwendigere Teil. Für jedes Video passiert dann Folgendes:

1. **SponsorBlock** (Community-Datenbank) liefert, wo im Video der Werbeblock ist.
2. Die **Untertitel** werden geladen und von Claude nach gesprochenen Codes durchsucht.
   Gibt es keinen SponsorBlock-Eintrag, findet Claude den Werbeblock über das Transkript.
3. **Nur der Werbeblock** wird in 720p heruntergeladen, alle 3 Sekunden wird ein Standbild gemacht.
   Claude liest die eingeblendeten Codes von den Bildern ab.

**Wichtig:** YouTube blockt solche Downloads von Cloud-Servern (GitHub Actions, Vercel, …).
Deshalb läuft das **auf deinem eigenen PC**. Außerdem ist das Herunterladen laut YouTube-Nutzungsbedingungen
eigentlich nicht erlaubt – für ein privates Projekt in kleinem Rahmen ist das eine Grauzone, für ein großes
öffentliches Angebot solltest du das im Hinterkopf behalten.

### Programme installieren

**Windows** (PowerShell):
```powershell
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
winget install DenoLand.Deno
```

**macOS**:
```bash
brew install yt-dlp ffmpeg deno
```

(`deno` braucht yt-dlp inzwischen, um YouTube auslesen zu können.) Danach das Terminal neu öffnen.

### Ausführen

In `.env.local`:
```
ENABLE_VIDEO_ANALYSIS=true
```

Dann:
```bash
npm run ingest
```

Der Worker holt neue Videos und analysiert anschließend alle noch nicht analysierten Videos der letzten 30 Tage
(max. 20 pro Lauf, einstellbar über `VIDEO_ANALYSIS_LIMIT`). Die Videos, die GitHub Actions schon gesammelt hat,
werden dabei mit analysiert – beide Wege ergänzen sich.

Falls trotzdem „Sign in to confirm you're not a bot“ kommt: in `.env.local`
`YTDLP_EXTRA_ARGS=--cookies-from-browser firefox` setzen (oder `chrome`/`edge`, je nachdem, wo du bei YouTube eingeloggt bist),
und mit `RETRY_FAILED_VIDEOS=true` die fehlgeschlagenen Videos erneut versuchen.

**Regelmäßig automatisch:** Unter Windows kannst du mit der **Aufgabenplanung** z. B. täglich
`cmd /c "cd C:\Pfad\zu\findyourcodes && npm run ingest"` starten lassen.

---

## Wie lange ist ein Code gültig?

- Nennt der Creator ein Datum („nur bis Sonntag“), wird das angezeigt.
- Sonst wird geschätzt: **60 Tage ab Video-Upload** (änderbar in `lib/brand.ts`, `ESTIMATED_VALIDITY_DAYS`). Die Schätzung ist mit „ca.“ gekennzeichnet.
- Besucher können mit 👍/👎 abstimmen, ob der Code noch funktioniert.
