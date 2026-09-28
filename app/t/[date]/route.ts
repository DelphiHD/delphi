// A day's transit report, for Kaycee, from wherever she is.
//
// Kaycee, 2026-09-28: the report is generated in the cloud now, so it needs an
// address. /t/<date> serves what scripts/publish-transit.ts put in storage.
//
// This edition names her roster and reads their charts, so the link is hers
// alone: it asks for the key, refuses without it, and tells the robots to stay
// away. The public edition, the same day with no people in it, is a separate
// render and will have its own address.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const away = (code: number) => new NextResponse(
  code === 404 ? "No report for that day." : "That report is not available.",
  { status: code, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" } },
);

export async function GET(request: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return away(404);

  // The key rides in the link she keeps. Without it this is not readable, and a
  // link that leaks can be cut by changing one environment variable.
  const want = process.env.TRANSIT_LINK_KEY ?? "";
  const got = new URL(request.url).searchParams.get("k") ?? "";
  if (!want || got !== want) return away(404);

  const md = new URL(request.url).searchParams.get("md") === "1";
  const file = await admin().storage.from("charts").download(`transits/${date}${md ? ".md" : ".html"}`);
  if (file.error || !file.data) return away(404);

  return new NextResponse(await file.data.arrayBuffer(), {
    headers: {
      "Content-Type": md ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
    },
  });
}
