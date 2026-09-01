// Birth places, from the chart provider's own list.
//
// A client typing a place freehand will eventually type one the provider cannot
// resolve, and the chart then fails for a reason that looks like our fault. So
// the field offers only places the provider already knows, and the page sends
// back the canonical value it was given rather than whatever was typed.
//
// The same list the chart call itself resolves against, so a place that appears
// here always works there.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HOST = "https://api.bodygraphchart.com";
const PATH = "/v210502/locations";

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, places: [] });

  const key = process.env.MYBODYGRAPH_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "no provider key" }, { status: 500 });

  try {
    const u = new URL(HOST + PATH);
    u.searchParams.set("api_key", key);
    u.searchParams.set("query", q.slice(0, 80));
    const res = await fetch(u);
    if (!res.ok) return NextResponse.json({ ok: false, error: `provider ${res.status}` }, { status: 502 });
    const raw = (await res.json()) as { value?: string; timezone?: string }[];
    const places = (Array.isArray(raw) ? raw : [])
      .filter((r) => r.value)
      .slice(0, 8)
      .map((r) => ({ value: r.value as string, timezone: r.timezone ?? "" }));
    return NextResponse.json({ ok: true, places },
      // A place is a fixed fact; the same query twice is one call to the provider.
      { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
