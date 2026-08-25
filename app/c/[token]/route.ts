// Serves a published client chart at /c/<token>.
//
// The token is the only credential: the row lookup and the file read both run
// with the service role, the bucket is private, and RLS on client_charts has no
// policies, so nothing here is reachable with the anon key. A revoked or unknown
// token is a plain 404 — it must not reveal whether a token ever existed.
//
// The response is marked no-index and no-referrer so an accidentally shared link
// cannot end up in a search engine or leak through a referrer header.

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars are missing on the server");
  return createClient(url, key, { auth: { persistSession: false } });
}

const notFound = () =>
  new NextResponse("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
  });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) return notFound();

  const db = admin();
  const { data: row, error } = await db
    .from("client_charts")
    .select("storage_path, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !row || row.revoked_at) return notFound();

  const file = await db.storage.from("charts").download(row.storage_path);
  if (file.error || !file.data) return notFound();

  return new NextResponse(await file.data.arrayBuffer(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
    },
  });
}
