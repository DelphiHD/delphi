// The Variations view for one chart: every version of the chart across the
// person's birth day (lib/hd/variations.ts).
//
// Kaycee, 2026-09-14/15 (docs/CHART_VARIATIONS_PLAN.md): cast when the view is
// first opened, then kept, so the website form and republishing stay as fast as
// they are. The kept copy lives beside the charts in storage and is recast only
// if the birth date or place behind the chart changes.
//
// The chart token is the credential, the same as for viewing the chart: a page
// can only ever ask about its own owner.

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { castVariations } from "@/lib/hd/variations";
import { windowFor, type Accuracy } from "@/lib/hd/time-accuracy";
import { getTimezoneForLocation } from "@/lib/mybodygraph";
import { CLIENTS } from "@/scripts/client-roster";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bad = (msg: string, code = 400) => NextResponse.json({ ok: false, error: msg }, { status: code });

export async function GET(request: Request) {
  const token = (new URL(request.url).searchParams.get("token") ?? "").trim();
  if (!/^[a-f0-9]{32}$/.test(token)) return bad("a chart token is required");

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } });

  const { data: link } = await db.from("client_charts").select("client_slug, revoked_at").eq("token", token).maybeSingle();
  if (!link || link.revoked_at) return bad("that chart link is not active", 404);

  // Who the chart belongs to: a chart record for website, event and sandbox
  // charts, the roster for Kaycee's own clients.
  let birthDate = "", birthTime = "", timezone = "", accuracy: Accuracy = "document";
  const { data: rec } = await db.from("charts")
    .select("birth_date, birth_time, birth_timezone, time_accuracy").eq("token", token).maybeSingle();
  if (rec) {
    birthDate = String(rec.birth_date); birthTime = String(rec.birth_time ?? "").slice(0, 5);
    timezone = String(rec.birth_timezone ?? ""); accuracy = (rec.time_accuracy ?? "document") as Accuracy;
  } else {
    const me = CLIENTS[link.client_slug];
    if (!me) return bad("that chart is no longer on the roster", 404);
    birthDate = me.birthDate; birthTime = me.birthTime;
    timezone = await getTimezoneForLocation(me.birthPlace);
    accuracy = (me.timeAccuracy ?? "document") as Accuracy;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !timezone) return bad("this chart has no birth day to read", 404);

  const exact = windowFor(accuracy, birthTime || null) === null;
  // "v2" because a kept copy from before the placements were recorded has no
  // tables to show; bumping it recasts once rather than serving a half answer.
  const basis = `v2|${birthDate}|${timezone}|${exact ? birthTime : "open"}`;
  const path = `variations/${token}.json`;

  const kept = await db.storage.from("charts").download(path);
  if (kept.data) {
    try {
      const saved = JSON.parse(await kept.data.text());
      if (saved.basis === basis) return NextResponse.json({ ok: true, ...saved });
    } catch {
      // an unreadable copy is simply cast again
    }
  }

  try {
    const variations = await castVariations({ birthDate, timezone }, { recordedTime: birthTime, exact });
    const body = { basis, birthDate, exact, variations, castAt: new Date().toISOString() };
    await db.storage.from("charts").upload(path, Buffer.from(JSON.stringify(body), "utf8"),
      { contentType: "application/json", upsert: true });
    return NextResponse.json({ ok: true, ...body });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "the birth day could not be cast", 502);
  }
}
