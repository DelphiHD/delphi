/**
 * Turn the tokens a link hands the browser into a signed-in session.
 *
 * Kaycee, 2026-09-28, after every attempt bounced her back to the sign-in page:
 * Supabase returns the session in the fragment of the URL, after the "#", and a
 * server never receives that part. The callback page reads it and posts it
 * here, and this is where it becomes a cookie.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: { access_token?: string; refresh_token?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "no tokens" }, { status: 400 }); }

  const access_token = String(body.access_token ?? "");
  const refresh_token = String(body.refresh_token ?? "");
  if (!access_token || !refresh_token) {
    return NextResponse.json({ ok: false, error: "no tokens" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
