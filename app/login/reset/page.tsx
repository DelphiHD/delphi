/**
 * Forgot your password.
 *
 * Kaycee, 2026-09-28: "I JUST WANT TO BE ABLE TO ACCESS MY ADMIN PAGE WHEN I AM
 * TRAVELING. I DONT WANT TO FUCKING ASK FOR IT EVERY TIME." Right. Email and
 * password, on any device, and if the password is ever forgotten this page
 * sends the way back without anybody being asked for anything.
 */

import Link from "next/link";
import { sendReset } from "./actions";

export const metadata = { title: "Reset your password — Delphi Human Design" };
export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ said?: string }> }) {
  const { said } = await searchParams;
  return (
    <main className="wrap">
      <style>{`
        .wrap { max-width: 460px; margin: 0 auto; padding: 32px 18px 56px; }
        h1 { font-size: 22px; margin: 0 0 6px; }
        .sub { color: var(--muted, #6f6880); font-size: 13px; margin: 0 0 20px; }
        label { display: block; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted, #6f6880); margin: 14px 0 5px; }
        input { width: 100%; font: inherit; padding: 10px 12px; border: 1px solid rgba(132,80,149,.28); border-radius: 10px; background: #fff; }
        button { margin-top: 18px; width: 100%; font: inherit; font-weight: 600; padding: 11px 14px; border: 0; border-radius: 10px; background: #845095; color: #fff; cursor: pointer; }
        .said { margin: 0 0 16px; padding: 10px 12px; border-radius: 10px; background: rgba(132,80,149,.08); font-size: 13px; }
        .back { display: inline-block; margin-top: 18px; font-size: 13px; color: #845095; }
      `}</style>
      <h1>Reset your password</h1>
      <p className="sub">We email you a link. It opens the page where you set a new one.</p>
      {said && <p className="said">{said}</p>}
      <form action={sendReset}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <button type="submit">Email me a reset link</button>
      </form>
      <Link className="back" href="/login">Back to sign in</Link>
    </main>
  );
}
