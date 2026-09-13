// Serves a published client chart at /c/<token>.
//
// The token is the only credential: the row lookup and the file read both run
// with the service role, the bucket is private, and RLS on client_charts has no
// policies, so nothing here is reachable with the anon key. A revoked or unknown
// token gets the same page as a temporary failure — it must not reveal whether a
// token ever existed.
//
// The response is marked no-index and no-referrer so an accidentally shared link
// cannot end up in a search engine or leak through a referrer header.
//
// A momentary database or storage hiccup used to come back as a bare "Not found"
// on a perfectly good link, with nothing logged. On 2026-09-13 that happened to
// two live links during a check. Now a failed read is retried, a failure that
// survives the retries is logged with its real reason, and the reader sees a
// soft message rather than "Not found". Kaycee, 2026-09-13: "I would prefer a
// softer message than Not Found."

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars are missing on the server");
  return createClient(url, key, { auth: { persistSession: false } });
}

// The only words a reader sees here, kept as plain strings so the copy check
// reads them.
const HEADLINE = "Chart could not be opened.";
const NEXT_STEP = "Please try again.";

// Brand purple and Montserrat, the same as the charts themselves.
const unavailable = (status: number) =>
  new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex,nofollow">` +
      `<title>Delphi Human Design</title>` +
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600&display=swap">` +
      `<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;` +
      `font-family:Montserrat,'Helvetica Neue',Arial,sans-serif;background:#f7f3f8;color:#1c1a2e}` +
      `p{font-size:17px;text-align:center;padding:0 24px;line-height:1.6}b{color:#845095;font-weight:600}</style>` +
      `</head><body><p><b>${HEADLINE}</b><br>${NEXT_STEP}</p></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
        "Referrer-Policy": "no-referrer",
      },
    },
  );

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Up to three tries, a short pause between them. Returns the last result. */
async function withRetry<T extends { error: unknown }>(read: () => PromiseLike<T>): Promise<T> {
  let last = await read();
  for (let i = 0; i < 2 && last.error; i++) {
    await sleep(250 * (i + 1));
    last = await read();
  }
  return last;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) return unavailable(404);

  const db = admin();
  const { data: row, error } = await withRetry(() =>
    db.from("client_charts").select("storage_path, revoked_at").eq("token", token).maybeSingle(),
  );

  if (error) {
    console.error(`chart link ${token.slice(0, 6)}: record read failed after retries: ${error.message}`);
    return unavailable(503);
  }
  if (!row || row.revoked_at) return unavailable(404);

  const file = await withRetry(() => db.storage.from("charts").download(row.storage_path));
  if (file.error || !file.data) {
    console.error(`chart link ${token.slice(0, 6)}: file read failed after retries: ${file.error?.message ?? "no data"}`);
    return unavailable(503);
  }

  return new NextResponse(await file.data.arrayBuffer(), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
    },
  });
}
