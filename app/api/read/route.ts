// The transit read for one client on one day, for their chart page.
//
// The chart is a baked file and the read is not baked into it any more, so this
// is how a client sees this morning's words without the chart being rebuilt.
//
// The chart token is the credential, the same as it is for viewing the chart at
// all: a read is only returned if the token names a live, unrevoked chart, and
// only that client's own read is returned. Someone holding one chart link
// cannot read anybody else's, and a revoked chart stops answering.

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const bad = (msg: string, code = 400) =>
  NextResponse.json({ ok: false, error: msg }, { status: code });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = params.get("token") ?? "";
  const date = params.get("date") ?? "";
  if (!/^[a-f0-9]{32}$/.test(token)) return bad("bad token");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("date must be YYYY-MM-DD");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("read: missing env");
    return bad("server not configured", 500);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: chart, error: chartErr } = await db
    .from("client_charts")
    .select("client_slug, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (chartErr || !chart || chart.revoked_at) return bad("unknown chart", 404);

  const { data, error } = await db
    .from("transit_reads")
    .select("date, written_at, paragraph, completions")
    .eq("client_slug", chart.client_slug)
    .eq("date", date)
    .maybeSingle();
  if (error) {
    console.error("read: lookup failed", chart.client_slug, date, error.message);
    return bad("could not look that up", 502);
  }
  // A day Kaycee has not written is ordinary, not an error: the chart shows the
  // sky for it and says there are no words yet.
  if (!data) return NextResponse.json({ ok: true, date, read: null });

  return NextResponse.json({
    ok: true,
    date,
    read: {
      date: data.date,
      writtenAt: data.written_at ?? "",
      paragraph: data.paragraph,
      completions: data.completions ?? [],
    },
    // Not cached. A read is small, fetched once per page load, and CAN change:
    // a parser fix on 2026-08-27 corrected 25 of them, and a five minute cache
    // meant Kaycee refreshed a corrected page and saw the old text anyway.
    // Freshness matters more than saving one small request.
  }, { headers: { "Cache-Control": "private, no-store" } });
}
