/**
 * Set a password on your own account.
 *
 * The portal has always accepted one; there was no page to set it, so the magic
 * link was the only way in (Kaycee, 2026-09-28). Nothing typed here is logged,
 * echoed back, or visible to anyone but Supabase's own hashing.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "./form";

export const metadata = { title: "Your password — Delphi Human Design" };
export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/portal/password");

  return (
    <main className="wrap">
      <style>{`
        .wrap { max-width: 460px; margin: 0 auto; padding: 32px 18px 56px; }
        h1 { font-size: 22px; margin: 0 0 6px; }
        .sub { color: var(--muted); font-size: 13px; margin: 0 0 20px; }
        label { display: block; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 14px 0 5px; }
        input { width: 100%; font: inherit; padding: 10px 12px; border: 1px solid rgba(132,80,149,.28); border-radius: 10px; background: #fff; }
        input:focus { outline: 2px solid rgba(132,80,149,.35); outline-offset: 1px; }
        button { margin-top: 18px; width: 100%; font: inherit; font-weight: 600; padding: 11px 14px; border: 0; border-radius: 10px; background: var(--purple); color: #fff; cursor: pointer; }
        .said { margin: 0 0 16px; padding: 10px 12px; border-radius: 10px; background: rgba(132,80,149,.08); font-size: 13px; }
      `}</style>

      <h1>Your password</h1>
      <p className="sub">Signed in as {user.email}. Setting one here does not switch off the email link; either will let you in.</p>

      <PasswordForm />
    </main>
  );
}
