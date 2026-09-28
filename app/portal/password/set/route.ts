/**
 * Set the signed-in person's password.
 *
 * Kaycee, 2026-09-28, after several rounds of "invalid login credentials":
 * proved on a throwaway account that the browser's own updateUser never
 * actually saved a password on this project. Whatever the reason at Supabase's
 * end, the account was left exactly as it was while the page said otherwise.
 *
 * So the session is verified here and the password is written with the
 * project's own rights, which cannot be refused. The password is read from the
 * request and passed straight to Supabase: it is never logged, echoed, or
 * stored anywhere else.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  let body: { password?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "No password given." }, { status: 400 }); }

  const password = String(body.password ?? "");
  if (password.length < 12) {
    return NextResponse.json({ ok: false, error: "A password needs at least twelve characters." }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, email: user.email });
}
