import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles both the magic-link redirect (?code=...) and the email-confirmation
// redirect from Supabase. Exchanges the code for a session cookie, then sends
// the user to ?next or /portal.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/portal";
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/portal";

  // A link can arrive two ways. The code is the usual one and needs the
  // verifier cookie this browser set when the link was asked for. A token hash
  // needs nothing kept: it verifies here, which is what makes a link opened on
  // another device, or from a mail app's own browser, work at all.
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") ?? "magiclink") as
    "magiclink" | "recovery" | "invite" | "signup" | "email_change";
  if (!code && tokenHash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
      );
    }
    return NextResponse.redirect(new URL(next, url.origin));
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=Missing+auth+code", url.origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(error.message)}`,
        url.origin,
      ),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
