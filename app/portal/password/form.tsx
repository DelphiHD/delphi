"use client";

/**
 * Setting a password, in the browser.
 *
 * Kaycee, 2026-09-28: "Now it's telling me that my login credentials are
 * invalid." Reproduced on a test account: saving from a server action changed
 * the password, which issues a new pair of tokens, and the redirect threw the
 * updated cookie away. The next request looked signed out and the new password
 * appeared not to exist.
 *
 * The browser client keeps its own cookies in step, so the session survives the
 * change and the next page load is still signed in.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaid("");
    if (password.length < 12) { setSaid("A password needs at least twelve characters."); return; }
    if (password !== again) { setSaid("Those two did not match."); return; }
    setBusy(true);
    const supabase = createClient();
    // Whose account this is, before the change: Supabase ends the session when
    // a password is set, which is why this page used to bounce to the sign-in
    // screen and the new password looked wrong (Kaycee, 2026-09-28).
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email ?? "";

    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setBusy(false); setSaid(error.message); return; }

    // Signed out by that change, so sign back in with what she just chose.
    const back = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (back.error) {
      setSaid("Your password is set. Sign in with it now.");
      router.push("/login");
      return;
    }
    setSaid("Saved. Taking you to the dashboard.");
    router.refresh();
    router.push("/portal/admin");
  }

  return (
    <form onSubmit={save}>
      {said && <p className="said">{said}</p>}
      <label htmlFor="password">New password</label>
      <input id="password" type="password" autoComplete="new-password" minLength={12} required
        value={password} onChange={(e) => setPassword(e.target.value)} />
      <label htmlFor="again">Type it again</label>
      <input id="again" type="password" autoComplete="new-password" minLength={12} required
        value={again} onChange={(e) => setAgain(e.target.value)} />
      <button type="submit" disabled={busy}>{busy ? "Saving" : "Save this password"}</button>
    </form>
  );
}
