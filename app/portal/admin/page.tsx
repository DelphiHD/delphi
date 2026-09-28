/**
 * The dashboard, online and read-only.
 *
 * Kaycee, 2026-09-28: "would it be possible to move the dashboard to an online
 * location as well? I'd like to be able to check it from my phone sometimes",
 * and "I think we set it all up before I was paying for supabase and didn't have
 * anywhere to host anything online... we shouldn't need to store anything on my
 * laptop anymore."
 *
 * This is the first pass: everything that only reads. The room in numbers,
 * everyone with a chart, and the daily transit reports with their links. Adding
 * a client and running a report stay on her Mac until the long jobs can be
 * handed to GitHub and reported back.
 *
 * Who gets in: public.delphi_admins, the same table the chart policies use. The
 * page checks it before reading anything, and only then uses the service role to
 * gather what row level security would otherwise hand back per-caller.
 */

import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const metadata = { title: "Dashboard — Delphi Human Design" };
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_CHARTS_URL ?? "https://charts.delphihd.com";

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

/** "Vandenberg, Kaycee", the way a list of people is read. */
function fileAs(name: string): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return String(name ?? "");
  return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
}

const TIMING: Record<string, string> = {
  document: "Exact", told: "Told", approximate: "Rough", unknown: "Rough",
};

export default async function AdminPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/portal/admin");

  const db = admin();
  const { data: isAdmin } = await db.from("delphi_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!isAdmin) redirect("/portal");

  const [{ data: charts }, { data: links }, { data: profiles }, transits] = await Promise.all([
    db.from("charts").select("person_name, source, tier, time_accuracy, token, created_at").order("created_at", { ascending: false }),
    db.from("client_charts").select("token, client_name, revoked_at"),
    db.from("profiles").select("email, account_type, created_at"),
    db.storage.from("charts").list("transits", { limit: 60, sortBy: { column: "name", order: "desc" } }),
  ]);

  const rows = charts ?? [];
  const live = new Set((links ?? []).filter((l) => !l.revoked_at).map((l) => l.token));
  const sandbox = rows.filter((r) => r.source === "sandbox").length;
  const figures = rows.filter((r) => r.source === "public-figure").length;
  const people = rows.filter((r) => r.source !== "sandbox" && r.source !== "public-figure");
  const signups = people.filter((r) => r.source !== "roster" && r.tier !== "seed").length;
  const key = process.env.TRANSIT_LINK_KEY ?? "";
  const days = (transits.data ?? [])
    .filter((f) => f.name.endsWith(".html"))
    .map((f) => ({ date: f.name.replace(/\.html$/, ""), at: (f.updated_at ?? f.created_at ?? "") as string }));

  const cards: [string, number | string, string][] = [
    ["People", people.length, "charts that belong to somebody"],
    ["Signed up", signups, "came through the website or an event"],
    ["Accounts", (profiles ?? []).length, "can sign in"],
    ["Live links", live.size, "charts anyone can open"],
    ["Public figures", figures, "teaching charts"],
    ["Sandbox", sandbox, "not people"],
  ];

  return (
    <main className="wrap">
      <style>{`
        .wrap { max-width: 980px; margin: 0 auto; padding: 24px 16px 56px; }
        h1 { font-size: 24px; margin: 0 0 2px; }
        .sub { color: var(--muted); font-size: 13px; margin: 0 0 18px; }
        h2 { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--purple); margin: 26px 0 8px; }
        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
        .card { border: 1px solid rgba(132,80,149,.18); border-radius: 14px; padding: 12px 14px; background: #fff; }
        .card b { display: block; font-size: 28px; color: var(--purple); line-height: 1.1; }
        .card span { font-size: 12px; }
        .card em { display: block; font-style: normal; font-size: 11px; color: var(--muted); }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { text-align: left; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 600; padding: 6px 8px; }
        td { padding: 6px 8px; border-top: 1px solid rgba(132,80,149,.10); }
        td a { color: var(--purple); }
        .tbl { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .tag { font-size: 11px; border-radius: 8px; padding: 1px 7px; background: rgba(132,80,149,.10); color: var(--purple); }
        @media (max-width: 560px) { .hide-sm { display: none; } }
      `}</style>

      <h1>Dashboard</h1>
      <p className="sub">Read-only, and current every time you open it. Adding a client and running a report still happen on the Mac.</p>

      <div className="cards">
        {cards.map(([label, n, note]) => (
          <div className="card" key={label}>
            <b>{n}</b><span>{label}</span><em>{note}</em>
          </div>
        ))}
      </div>

      <h2>Daily transit reports</h2>
      <div className="tbl">
        <table>
          <thead><tr><th>Day</th><th>Report</th><th className="hide-sm">Published</th></tr></thead>
          <tbody>
            {days.length === 0 && <tr><td colSpan={3}>None published yet.</td></tr>}
            {days.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{key ? <a href={`${SITE}/t/${d.date}?k=${key}`} target="_blank" rel="noreferrer">open</a> : "—"}</td>
                <td className="hide-sm">{String(d.at).slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Everyone</h2>
      <div className="tbl">
        <table>
          <thead>
            <tr><th>Name</th><th>Chart</th><th className="hide-sm">How they got here</th><th className="hide-sm">Birth time</th><th className="hide-sm">Since</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.token}>
                <td>{fileAs(String(r.person_name))}</td>
                <td>{live.has(String(r.token))
                  ? <a href={`${SITE}/c/${r.token}`} target="_blank" rel="noreferrer">open</a>
                  : <span className="sub">—</span>}</td>
                <td className="hide-sm">
                  {r.source === "sandbox" ? <span className="tag">Sandbox</span>
                    : r.source === "public-figure" ? <span className="tag">Public Figure</span>
                    : r.source === "roster" || r.tier === "seed" ? "Roster"
                    : r.source === "signup" ? "Signed up" : String(r.source ?? "")}
                </td>
                <td className="hide-sm">
                  {r.source === "public-figure" && r.time_accuracy !== "unknown"
                    ? "Astrology database"
                    : TIMING[String(r.time_accuracy)] ?? "Exact"}
                </td>
                <td className="hide-sm">{String(r.created_at ?? "").slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
