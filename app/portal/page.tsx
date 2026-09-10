/**
 * Everything this person has a chart for.
 *
 * The accounts have existed since the free chart went live: giving an email on
 * the form quietly creates one, so somebody's charts are already attached to
 * them by the time they first sign in. Until now there was nothing to sign in
 * to, and this is that page.
 *
 * The query asks for the signed-in person's charts and nothing else, but it is
 * not what keeps them private. Row level security on public.charts only ever
 * returns rows whose owner is the caller, so a mistake in this file cannot show
 * somebody another person's birth details.
 */

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Your charts — Delphi Human Design" };

const SITE = process.env.NEXT_PUBLIC_CHARTS_URL ?? "https://charts.delphihd.com";

/** "1983-06-17" -> "17 June 1983". A birth date is not a filename. */
function readableDate(iso: string): string {
  const [y, m, d] = (iso ?? "").split("-").map(Number);
  if (!y || !m || !d) return iso ?? "";
  const months = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  return `${d} ${months[m - 1]} ${y}`;
}

/** Postgres hands back a time as HH:MM:SS; nobody was born at a seconds-place. */
function readableTime(t: string | null, accuracy: string): string {
  if (!t) return "time unknown";
  const hhmm = t.slice(0, 5);
  return accuracy === "approximate" ? `about ${hhmm}` : hhmm;
}

export default async function PortalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: charts, error } = await supabase
    .from("charts")
    .select("id, person_name, birth_date, birth_time, birth_place, time_accuracy, tier, token, created_at")
    .order("created_at", { ascending: false });

  const rows = charts ?? [];

  return (
    <main className="wrap">
      <h1>Your charts</h1>
      <p className="sub">
        Signed in as {user?.email}. Every chart you have made lives here, and the
        links stay live.
      </p>

      {error && (
        <p className="warn">
          Your charts could not be read just now. Nothing is lost; try again in a
          moment.
        </p>
      )}

      {!error && rows.length === 0 && (
        <div className="empty">
          <p>No charts on this account yet.</p>
          <Link className="go" href="/chart">Make a chart</Link>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="list">
          {rows.map((c) => (
            <li key={c.id}>
              <a className="chart" href={`${SITE}/c/${c.token}`} target="_blank" rel="noreferrer">
                <span className="name">{c.person_name}</span>
                <span className="born">
                  {readableDate(c.birth_date)} &middot; {readableTime(c.birth_time, c.time_accuracy)}
                  <br />
                  {c.birth_place}
                </span>
                {c.tier === "free" && <span className="tier">Basic chart</span>}
                {c.tier === "purchased" && <span className="tier paid">Full reading</span>}
                {c.tier === "gift" && <span className="tier paid">A gift</span>}
              </a>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <p className="more">
          <Link href="/chart">Make another chart</Link>
        </p>
      )}

      <p className="know">Know thyself.</p>
    </main>
  );
}
