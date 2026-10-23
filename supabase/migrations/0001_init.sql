-- FindYourCodes – Datenbankschema
-- Im Supabase-Dashboard unter "SQL Editor" komplett einfügen und ausführen.

-- ---------------------------------------------------------------------------
-- Kanäle, die regelmäßig abgefragt werden
-- ---------------------------------------------------------------------------
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique,              -- z.B. "Tomatolix" (ohne @)
  youtube_channel_id text unique,           -- wird vom Worker automatisch ergänzt
  uploads_playlist_id text,
  title text,
  thumbnail_url text,
  active boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Videos
-- ---------------------------------------------------------------------------
create table if not exists public.videos (
  id text primary key,                      -- YouTube-Video-ID
  channel_id uuid not null references public.channels(id) on delete cascade,
  title text not null,
  description text,
  thumbnail_url text,
  published_at timestamptz not null,
  duration_seconds integer,
  -- Werbeblöcke laut SponsorBlock: [{"start": 91.9, "end": 160.1}, ...]
  sponsor_segments jsonb not null default '[]'::jsonb,
  description_analyzed_at timestamptz,
  -- 'pending' | 'done' | 'failed' | 'skipped'
  video_analysis_status text not null default 'pending',
  video_analysis_error text,
  video_analyzed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists videos_channel_idx on public.videos (channel_id, published_at desc);
create index if not exists videos_analysis_idx on public.videos (video_analysis_status, published_at desc);

-- ---------------------------------------------------------------------------
-- Gefundene Codes / Angebote
-- ---------------------------------------------------------------------------
create table if not exists public.codes (
  id uuid primary key default gen_random_uuid(),
  video_id text not null references public.videos(id) on delete cascade,
  brand text not null,                      -- Anzeigename, z.B. "NordVPN"
  brand_slug text not null,                 -- normalisiert, z.B. "nordvpn"
  code text,                                -- null, wenn es nur einen Link gibt
  code_key text not null default '',        -- für Duplikaterkennung (code in Großbuchstaben)
  offer text,                               -- z.B. "4 Monate gratis + 73 % Rabatt"
  url text,
  -- Woher stammt der Code? 'description' | 'transcript' | 'video'
  sources text[] not null default '{}',
  expires_at date,                          -- nur wenn explizit genannt
  expiry_note text,                         -- z.B. "nur bis Sonntag"
  -- Zeitpunkt im Video, an dem der Code gezeigt/genannt wird (Sekunden)
  video_timestamp integer,
  works_votes integer not null default 0,
  broken_votes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id, brand_slug, code_key)
);

create index if not exists codes_brand_idx on public.codes (brand_slug);
create index if not exists codes_created_idx on public.codes (created_at desc);

-- ---------------------------------------------------------------------------
-- Ansicht für die Web-App: Code + Video + Kanal in einer Zeile
-- ---------------------------------------------------------------------------
create or replace view public.code_feed
with (security_invoker = true) as
select
  c.id,
  c.brand,
  c.brand_slug,
  c.code,
  c.offer,
  c.url,
  c.sources,
  c.expires_at,
  c.expiry_note,
  c.video_timestamp,
  c.works_votes,
  c.broken_votes,
  c.created_at,
  v.id as video_id,
  v.title as video_title,
  v.thumbnail_url as video_thumbnail_url,
  v.published_at,
  ch.handle as channel_handle,
  ch.title as channel_title,
  ch.thumbnail_url as channel_thumbnail_url
from public.codes c
join public.videos v on v.id = c.video_id
join public.channels ch on ch.id = v.channel_id;

-- Marken mit Anzahl Codes (für die Filter-Chips)
create or replace view public.brand_counts
with (security_invoker = true) as
select brand_slug, min(brand) as brand, count(*)::int as code_count, max(v.published_at) as last_seen
from public.codes c
join public.videos v on v.id = c.video_id
group by brand_slug;

-- ---------------------------------------------------------------------------
-- Abstimmung "funktioniert / funktioniert nicht" (ohne Login)
-- ---------------------------------------------------------------------------
create or replace function public.vote_code(p_code_id uuid, p_works boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.codes
  set works_votes  = works_votes  + case when p_works then 1 else 0 end,
      broken_votes = broken_votes + case when p_works then 0 else 1 end,
      updated_at = now()
  where id = p_code_id;
$$;

revoke all on function public.vote_code(uuid, boolean) from public;
grant execute on function public.vote_code(uuid, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security: alle dürfen lesen, nur der Worker (Secret Key) schreibt
-- ---------------------------------------------------------------------------
alter table public.channels enable row level security;
alter table public.videos enable row level security;
alter table public.codes enable row level security;

drop policy if exists "public read channels" on public.channels;
create policy "public read channels" on public.channels for select using (true);

drop policy if exists "public read videos" on public.videos;
create policy "public read videos" on public.videos for select using (true);

drop policy if exists "public read codes" on public.codes;
create policy "public read codes" on public.codes for select using (true);

grant select on public.code_feed, public.brand_counts to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Start-Kanäle (weitere einfach per INSERT hinzufügen)
-- ---------------------------------------------------------------------------
insert into public.channels (handle) values
  ('Tomatolix'),
  ('AeroNewsGermany'),
  ('Simplicissimus'),
  ('MrWissen2go'),
  ('Doktorwhatson'),
  ('KurzgesagtDE'),
  ('BreakingLab'),
  ('ultralativ'),
  ('TheMorpheusTutorials'),
  ('Technikfaultier'),
  ('ct3003'),
  ('SemperVideo'),
  ('Galileo'),
  ('HandOfBlood'),
  ('FelixvonderLaden'),
  ('Dner'),
  ('Gronkh'),
  ('LeFloid'),
  ('Paluten'),
  ('OrangeMorangeTV'),
  ('survivalmattin'),
  ('MarcelScorpion'),
  ('Robbubble'),
  ('Unge'),
  ('iBlali'),
  ('DoktorFroid'),
  ('Spacefrogs')
on conflict (handle) do nothing;
