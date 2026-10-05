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
import { segmentLabel } from "@/lib/hd/time-accuracy";
import { AddChart, MakePrimary } from "./charts/manage";
import { claimChartsFor } from "@/lib/claim-charts";

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
  // A stored time on a chart whose owner does not know their birth time is the
  // middle of the part of the day they picked, not a time they gave. Printing
  // it as a clock time would read as an answer they never offered.
  if (accuracy === "unknown") {
    const seg = segmentLabel(hhmm);
    return seg ? `time unknown, ${seg}` : "time unknown";
  }
  return accuracy === "approximate" ? `about ${hhmm}` : hhmm;
}

export default async function PortalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Anything addressed to them and belonging to nobody becomes theirs, here,
  // the first time they look. This is what turns an email on a roster chart
  // into ownership without anybody retyping birth details, and it is how a
  // family arrives whole. Idempotent: a second visit claims nothing.
  if (user) await claimChartsFor(user.id, user.email);

  const { data: charts, error } = await supabase
    .from("charts")
    .select("id, person_name, birth_date, birth_time, birth_place, time_accuracy, tier, token, created_at")
    .order("created_at", { ascending: false });

  // Theirs first. An account can hold a whole family, so something has to be
  // at the top and it is the one they said is their own.
  const { data: me } = await supabase
    .from("profiles").select("primary_chart_id").eq("id", user?.id ?? "").maybeSingle();
  const primaryId = (me?.primary_chart_id as string | null) ?? null;
  const rows = [...(charts ?? [])].sort(
    (a, b) => Number(b.id === primaryId) - Number(a.id === primaryId));

  return (
    <main className="wrap">
      <h1>Your charts</h1>
      <p className="sub">
        Signed in as {user?.email}. Every chart on this account lives here, and the
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
                {c.tier === "purchased" && <span className="tier paid">Full reading</span>}
                {c.tier === "gift" && <span className="tier paid">A gift</span>}
              </a>
              <MakePrimary chartId={String(c.id)} isPrimary={c.id === primaryId} />
            </li>
          ))}
        </ul>
      )}

      <AddChart />

      <p className="know">Know thyself.</p>
    </main>
  );
}
