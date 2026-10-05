/**
 * Everything this person has a chart for.
 *
 * One account holds several charts: their own, their family's, anyone they
 * have made. So this is a table rather than a list of cards. Kaycee,
 * 2026-10-05: "Can we put all of the charts in a table like they are in the
 * Dashboard funnel? Let's make the column headers profile, type, authority,
 * definition, personality Sun." It is literally the dashboard's table, the
 * same component, so the two never drift apart.
 *
 * Those five facts are not on the chart row. They are written there by the
 * publish that drew the page, so this list costs no casts and can never
 * disagree with the chart it links to.
 *
 * The query asks for the signed-in person's charts and nothing else, but it is
 * not what keeps them private. Row level security on public.charts only ever
 * returns rows whose owner is the caller, so a mistake in this file cannot show
 * somebody another person's birth details.
 */

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { claimChartsFor } from "@/lib/claim-charts";
import { SortableTable, type Row } from "@/app/portal/admin/table";
import { AddChart, MakePrimary } from "./charts/manage";

export const metadata = { title: "Your charts — Delphi Human Design" };
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_CHARTS_URL ?? "https://charts.delphihd.com";

/**
 * The birth data, as one sortable cell. Kaycee, 2026-10-05: "the birth data
 * should also be a column."
 *
 * The date stays in year-month-day order on purpose. A column sorts on the
 * text it shows, and "17 June 1983" sorted alphabetically puts April before
 * January; this way the column sorts chronologically, which is the only
 * reason to be able to sort it.
 *
 * A time nobody knows is never printed as a clock time, because a clock time
 * reads as an answer somebody gave.
 */
function birthData(date: string, time: string | null, accuracy: string, place: string): string {
  const clock = !time || accuracy === "unknown"
    ? "time unknown"
    : accuracy === "approximate" ? `about ${String(time).slice(0, 5)}` : String(time).slice(0, 5);
  return `${date} \u00b7 ${clock} \u00b7 ${place}`;
}

interface Summary {
  profile?: string; type?: string; authority?: string;
  definition?: string; personalitySun?: string;
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
    .select("id, person_name, birth_date, birth_time, birth_place, time_accuracy, tier, token, summary, created_at")
    .order("person_name");

  const { data: me } = await supabase
    .from("profiles").select("primary_chart_id").eq("id", user?.id ?? "").maybeSingle();
  const primaryId = (me?.primary_chart_id as string | null) ?? null;

  const all = charts ?? [];
  const rows: Row[] = all.map((c) => {
    const s = (c.summary ?? {}) as Summary;
    return {
      id: String(c.id),
      name: String(c.person_name ?? ""),
      chart: "open",
      chartHref: `${SITE}/c/${c.token}`,
      profile: s.profile ?? "",
      type: s.type ?? "",
      authority: s.authority ?? "",
      definition: s.definition ?? "",
      sun: s.personalitySun ?? "",
      born: birthData(String(c.birth_date), c.birth_time as string | null,
        String(c.time_accuracy ?? ""), String(c.birth_place ?? "")),
    };
  });

  // Theirs first, whatever the table is sorted by when it opens.
  const mine = all.find((c) => c.id === primaryId);

  return (
    <main className="wrap wide">
      <h1>Your charts</h1>

      <AddChart />

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
        <SortableTable
          initial={{ key: "name", dir: 1 }}
          columns={[
            { key: "name", label: "Name" },
            { key: "chart", label: "Chart", link: "chartHref" },
            { key: "profile", label: "Profile" },
            { key: "type", label: "Type" },
            { key: "authority", label: "Authority", small: true },
            { key: "definition", label: "Definition", small: true },
            { key: "sun", label: "Personality Sun", small: true },
            { key: "born", label: "Birth data", small: true },
          ]}
          rows={rows}
          empty="No charts on this account yet."
        />
      )}

      {rows.length > 0 && (
        <div className="mineline">
          {mine
            ? <span className="tier">{String(mine.person_name)} is your chart</span>
            : <span className="fine">None of these is marked as yours yet.</span>}
          <div className="minepick">
            {all.filter((c) => c.id !== primaryId).map((c) => (
              <MakePrimary key={String(c.id)} chartId={String(c.id)} isPrimary={false}
                name={String(c.person_name)} />
            ))}
          </div>
        </div>
      )}

      <p className="know">Know thyself.</p>
    </main>
  );
}
