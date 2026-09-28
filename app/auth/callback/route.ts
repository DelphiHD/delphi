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

  // Nothing in the query means the session is in the fragment, after the "#",
  // which the browser keeps to itself. This page hands it back.
  if (!code) {
    const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Signing you in</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1c1a2e;background:#fff}
p{color:#6f6880}</style></head><body><div><h1 style="font-size:20px;margin:0 0 6px">Signing you in</h1>
<p id="say">One moment.</p></div><script>
(function () {
  var next = ${JSON.stringify(next)};
  var h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  var a = h.get("access_token"), r = h.get("refresh_token"), err = h.get("error_description") || h.get("error");
  var say = document.getElementById("say");
  if (err) { say.textContent = err; return; }
  if (!a || !r) { location.replace("/login?error=" + encodeURIComponent("That link has already been used or has expired.")); return; }
  fetch("/auth/session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: a, refresh_token: r }),
  }).then(function (res) { return res.json(); }).then(function (j) {
    if (j && j.ok) { location.replace(next); }
    else { say.textContent = (j && j.error) || "That did not work."; }
  }).catch(function () { say.textContent = "That did not work."; });
})();
</script></body></html>`;
    return new NextResponse(page, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
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
