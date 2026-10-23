import { isConfigured, supabase } from "@/lib/codes";

export async function POST(request: Request) {
  if (!isConfigured()) return Response.json({ error: "Supabase ist nicht konfiguriert" }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { id?: unknown; works?: unknown } | null;
  if (!body || typeof body.id !== "string" || typeof body.works !== "boolean") {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const { error } = await supabase().rpc("vote_code", { p_code_id: body.id, p_works: body.works });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
