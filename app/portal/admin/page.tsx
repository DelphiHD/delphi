/**
 * The dashboard, online.
 *
 * Kaycee, 2026-09-28: "I WANT THE DASHBOARD THAT WE ARE CURRENTLY WORKING FROM
 * TO EXIST ONLINE. EVERY FUCKING PART OF IT."
 *
 * Tabs, sortable tables, working links, a find box. Everyone, New chart,
 * Status, Transits, Changes, Accounts, Decided and Launch. Status used to exist
 * only on her Mac; the 5 AM health check now publishes its answer to storage as
 * well, so it is readable from anywhere.
 *
 * New chart (2026-10-03) retires the three terminal scripts she used to reach
 * for: a chart of anyone, filed anywhere in the funnel, from her phone. Running
 * a report is the piece still to come, because it takes minutes and belongs on
 * the runner.
 *
 * Who gets in: public.delphi_admins, the same table the chart policies use.
 */

import { redirect } from "next/navigation";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import launchPlan from "@/docs/launch-plan.json";
import { SortableTable, Tabs, type Row } from "./table";
import { CreateChart } from "./create";

export const metadata = { title: "Dashboard — Delphi Human Design" };
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_CHARTS_URL ?? "https://charts.delphihd.com";

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

function fileAs(name: string): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length < 2 ? String(name ?? "") : `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(" ")}`;
}

const TIMING: Record<string, string> = {
  document: "Exact", told: "Told", astrodb: "Astrology database",
  approximate: "Rough", unknown: "Rough",
};

interface Plan { updated?: string; phases?: { title: string; target?: string; why?: string;
  items?: { title: string; status?: string; note?: string }[] }[]; decided?: { on: string; what: string }[] }

export default async function AdminPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/portal/admin");

  const db = admin();
  const { data: isAdmin } = await db.from("delphi_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!isAdmin) redirect("/portal");

  const [{ data: charts }, { data: links }, { data: profiles }, transits] = await Promise.all([
    db.from("charts").select("person_name, source, tier, time_accuracy, token, created_at, for_email").order("created_at", { ascending: false }),
    db.from("client_charts").select("token, client_name, revoked_at"),
    db.from("profiles").select("email, account_type, created_at"),
    db.storage.from("charts").list("transits", { limit: 90, sortBy: { column: "name", order: "desc" } }),
  ]);

  // The 5 AM health check publishes its answer here, so Status is not a thing
  // that only exists on her Mac (Kaycee, 2026-09-28).
  let health: { at?: string; allGreen?: boolean; checks?: { name: string; pass: boolean; detail: string; fix?: string | null }[] } = {};
  try {
    const f = await db.storage.from("charts").download("status/health.json");
    if (f.data) health = JSON.parse(await f.data.text());
  } catch { /* the tab says when it has nothing */ }

  // The chart change log travels with the code, so it can be read here.
  let changes: Row[] = [];
  try {
    const path = join(process.cwd(), "docs", "CHART_CHANGELOG.md");
    if (existsSync(path)) {
      changes = readFileSync(path, "utf8").split("\n")
        .filter((l) => l.startsWith("| 20"))
        .map((l) => l.split("|").map((c) => c.trim()))
        .map((c, i) => ({ id: `c${i}`, when: c[1], who: c[2], what: c[3], rollback: c[4] }))
        .reverse();
    }
  } catch { /* the tab says when it has nothing */ }

  const rows = charts ?? [];
  const live = new Set((links ?? []).filter((l) => !l.revoked_at).map((l) => l.token));
  const sandbox = rows.filter((r) => r.source === "sandbox");
  const figures = rows.filter((r) => r.source === "public-figure");
  const people = rows.filter((r) => r.source !== "sandbox" && r.source !== "public-figure");
  const signups = people.filter((r) => r.tier !== "seed" && r.source !== "roster");
  const key = process.env.TRANSIT_LINK_KEY ?? "";
  // Every event already in the funnel, so a second chart for one lands beside
  // the first instead of starting a near-miss spelling of it.
  const events = [...new Set(rows.map((r) => String(r.source ?? ""))
    .filter((s) => s && s !== "sandbox" && s !== "public-figure" && s !== "signup" && s !== "roster"))].sort();
  const plan = launchPlan as Plan;

  const everyone: Row[] = rows.map((r) => ({
    id: String(r.token),
    name: fileAs(String(r.person_name)),
    chart: live.has(String(r.token)) ? "open" : "",
    chartHref: live.has(String(r.token)) ? `${SITE}/c/${r.token}` : "",
    how: r.source === "sandbox" ? "Sandbox"
      : r.source === "public-figure" ? "Public Figure"
      : r.tier === "seed" || r.source === "roster" ? "Roster"
      : r.source === "signup" ? "Signed up" : String(r.source ?? ""),
    time: r.source === "public-figure" && r.time_accuracy !== "unknown"
      ? "Astrology database" : TIMING[String(r.time_accuracy)] ?? "Exact",
    email: String(r.for_email ?? ""),
    since: String(r.created_at ?? "").slice(0, 10),
  }));

  const accounts: Row[] = (profiles ?? []).map((p, i) => ({
    id: `a${i}`, email: String(p.email ?? ""), kind: String(p.account_type ?? ""),
    since: String(p.created_at ?? "").slice(0, 10),
  }));

  const days: Row[] = (transits.data ?? []).filter((f) => f.name.endsWith(".html")).map((f) => {
    const date = f.name.replace(/\.html$/, "");
    return {
      id: date, date,
      report: key ? "open" : "", reportHref: key ? `${SITE}/t/${date}?k=${key}` : "",
      markdown: key ? "markdown" : "", markdownHref: key ? `${SITE}/t/${date}?k=${key}&md=1` : "",
      published: String(f.updated_at ?? f.created_at ?? "").slice(0, 16).replace("T", " "),
    };
  });

  const decided: Row[] = [...(plan.decided ?? [])].reverse().map((d, i) => ({
    id: `d${i}`, on: d.on, what: d.what,
  }));

  const items: Row[] = (plan.phases ?? []).flatMap((ph) =>
    (ph.items ?? []).map((it, i) => ({
      id: `${ph.title}-${i}`, phase: ph.title.replace(/^Phase \d+ — /, ""),
      item: it.title, status: it.status ?? "", note: (it.note ?? "").slice(0, 160),
    })));

  const statusRows: Row[] = (health.checks ?? []).map((c, i) => ({
    id: `s${i}`, check: c.name, state: c.pass ? "pass" : "FAIL", detail: c.detail, fix: c.fix ?? "",
  }));

  const cards: [string, number, string][] = [
    ["People", people.length, "charts that belong to somebody"],
    ["Signed up", signups.length, "through the website or an event"],
    ["Accounts", accounts.length, "can sign in"],
    ["Live links", live.size, "charts anyone can open"],
    ["Public figures", figures.length, "teaching charts"],
    ["Sandbox", sandbox.length, "not people"],
  ];

  return (
    <main className="wrap">
      <style>{`
        .wrap { max-width: 1040px; margin: 0 auto; padding: 20px 14px 56px; }
        h1 { font-size: 23px; margin: 0 0 2px; }
        .sub { color: var(--muted); font-size: 13px; margin: 0 0 16px; }
        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 9px; margin-bottom: 18px; }
        .card { border: 1px solid rgba(132,80,149,.18); border-radius: 13px; padding: 10px 12px; background: #fff; }
        .card b { display: block; font-size: 26px; color: var(--purple); line-height: 1.1; }
        .card span { font-size: 12px; }
        .card em { display: block; font-style: normal; font-size: 11px; color: var(--muted); }
        .tabs { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 10px; -webkit-overflow-scrolling: touch; }
        .tab { font: inherit; font-size: 13px; white-space: nowrap; padding: 7px 13px; border-radius: 999px; border: 1px solid rgba(132,80,149,.28); background: #fff; color: var(--ink); cursor: pointer; }
        .tab.on { background: var(--purple); border-color: var(--purple); color: #fff; font-weight: 600; }
        .find { width: 100%; font: inherit; font-size: 14px; padding: 9px 12px; margin-bottom: 10px; border: 1px solid rgba(132,80,149,.25); border-radius: 10px; }
        .tbl { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid rgba(132,80,149,.14); border-radius: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
        th { text-align: left; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 600; padding: 9px 10px; cursor: pointer; white-space: nowrap; user-select: none; }
        th.on { color: var(--purple); }
        td { padding: 8px 10px; border-top: 1px solid rgba(132,80,149,.10); vertical-align: top; }
        td a { color: var(--purple); font-weight: 600; }
        .dim { color: var(--muted); }
        .count { font-size: 11px; color: var(--muted); margin: 8px 2px 0; }
        .note { font-size: 13px; color: var(--muted); background: rgba(132,80,149,.06); border-radius: 12px; padding: 12px 14px; }
        @media (max-width: 620px) { .hide-sm { display: none; } }
      `}</style>

      <h1>Dashboard</h1>
      <p className="sub">Everything here is live from the database. Tap a heading to sort.</p>

      <div className="cards">
        {cards.map(([label, n, note]) => (
          <div className="card" key={label}><b>{n}</b><span>{label}</span><em>{note}</em></div>
        ))}
      </div>

      <Tabs names={["Everyone", "New chart", "Status", "Transits", "Changes", "Accounts", "Decided", "Launch"]}>
        <SortableTable
          initial={{ key: "since", dir: -1 }}
          columns={[
            { key: "name", label: "Name" },
            { key: "chart", label: "Chart", link: "chartHref" },
            { key: "how", label: "How they got here", small: true },
            { key: "time", label: "Birth time", small: true },
            { key: "email", label: "Email", small: true },
            { key: "since", label: "Since" },
          ]}
          rows={everyone}
        />
        <CreateChart events={events} />
        <div>
          <p className="sub">
            {health.at
              ? `Checked ${String(health.at).slice(0, 16).replace("T", " ")} UTC. ${health.allGreen ? "All green." : `${statusRows.filter((r) => r.state === "FAIL").length} failing.`}`
              : "No check has published yet. It publishes at 5 AM, or whenever the check is run."}
          </p>
          <SortableTable
            initial={{ key: "state", dir: 1 }}
            columns={[
              { key: "check", label: "Check" },
              { key: "state", label: "State" },
              { key: "detail", label: "Detail" },
              { key: "fix", label: "Fix", small: true },
            ]}
            rows={statusRows}
            empty="Nothing published yet."
          />
        </div>
        <SortableTable
          initial={{ key: "date", dir: -1 }}
          columns={[
            { key: "date", label: "Day" },
            { key: "report", label: "Report", link: "reportHref" },
            { key: "markdown", label: "Markdown", link: "markdownHref", small: true },
            { key: "published", label: "Published", small: true },
          ]}
          rows={days}
          empty="No reports published yet."
        />
        <SortableTable
          initial={{ key: "when", dir: -1 }}
          columns={[
            { key: "when", label: "When (UTC)" },
            { key: "who", label: "Chart" },
            { key: "what", label: "What changed", small: true },
            { key: "rollback", label: "Rollback", small: true },
          ]}
          rows={changes}
          empty="No chart publishes recorded."
        />
        <SortableTable
          initial={{ key: "since", dir: -1 }}
          columns={[
            { key: "email", label: "Email" },
            { key: "kind", label: "Kind", small: true },
            { key: "since", label: "Since" },
          ]}
          rows={accounts}
        />
        <SortableTable
          initial={{ key: "on", dir: -1 }}
          columns={[{ key: "on", label: "When" }, { key: "what", label: "What was decided" }]}
          rows={decided}
        />
        <SortableTable
          initial={{ key: "phase", dir: 1 }}
          columns={[
            { key: "phase", label: "Phase" },
            { key: "item", label: "Item" },
            { key: "status", label: "Status" },
            { key: "note", label: "Note", small: true },
          ]}
          rows={items}
        />

      </Tabs>
    </main>
  );
}
