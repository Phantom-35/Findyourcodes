import Link from "next/link";
import { Suspense } from "react";
import { getBrands, getCodes, isConfigured } from "@/lib/codes";
import { CodeCard } from "./code-card";

export default function Home(props: PageProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-3xl font-bold tracking-tight">
          Find<span className="text-violet-600">Your</span>Codes
        </Link>
        <p className="text-neutral-600 dark:text-neutral-400">
          Rabattcodes und Gratis-Angebote aus YouTube-Videos – automatisch gesammelt.
        </p>
      </header>

      <Suspense fallback={<p className="text-neutral-500">Lade Codes …</p>}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

// Die Seite wird pro Anfrage gerendert (searchParams), daher ist die aktuelle Uhrzeit hier stabil.
function requestTime(): number {
  return Date.now();
}

function first(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() || null;
}

async function Results({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  const brand = first(params.brand);
  const query = first(params.q);
  const [codes, brands] = await Promise.all([getCodes(brand, query), getBrands()]);
  const now = requestTime();

  return (
    <>
      <form action="/" className="flex gap-2">
        {brand && <input type="hidden" name="brand" value={brand} />}
        <input
          name="q"
          defaultValue={query ?? ""}
          placeholder="Suche nach Marke, Code oder Creator – z. B. NordVPN"
          className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-4 py-2.5 outline-none focus:border-violet-500 dark:border-white/15 dark:bg-neutral-900"
        />
        <button className="rounded-xl bg-violet-600 px-5 py-2.5 font-medium text-white hover:bg-violet-700">
          Suchen
        </button>
      </form>

      {brands.length > 0 && (
        <nav className="flex flex-wrap gap-2" aria-label="Nach Marke filtern">
          <BrandChip href={query ? `/?q=${encodeURIComponent(query)}` : "/"} active={!brand} label="Alle" />
          {brands.map((b) => (
            <BrandChip
              key={b.brand_slug}
              href={`/?brand=${b.brand_slug}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              active={brand === b.brand_slug}
              label={`${b.brand} (${b.code_count})`}
            />
          ))}
        </nav>
      )}

      {!isConfigured() ? (
        <Notice>
          Supabase ist noch nicht verbunden. Trage <code>NEXT_PUBLIC_SUPABASE_URL</code> und{" "}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env.local</code> ein (siehe SETUP.md).
        </Notice>
      ) : codes.length === 0 ? (
        <Notice>Keine Codes gefunden{brand || query ? " – versuch einen anderen Filter." : " – der Worker hat noch nichts gesammelt."}</Notice>
      ) : (
        <>
          <p className="text-sm text-neutral-500">{codes.length} Codes</p>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {codes.map((entry) => (
              <CodeCard key={entry.id} entry={entry} now={now} />
            ))}
          </section>
        </>
      )}
    </>
  );
}

function BrandChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-sm transition ${
        active
          ? "border-violet-600 bg-violet-600 text-white"
          : "border-black/10 bg-white hover:border-violet-400 dark:border-white/15 dark:bg-neutral-900"
      }`}
    >
      {label}
    </Link>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-black/15 p-8 text-center text-neutral-600 dark:border-white/15 dark:text-neutral-400">
      {children}
    </p>
  );
}
