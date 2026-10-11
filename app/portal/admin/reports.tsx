"use client";

/**
 * Problem reports from the chart pages, worked like a ticket list: what they
 * wrote, the picture, what the page knew, and our status, notes and
 * resolution. Kaycee, 2026-10-11: "add columns for notes and resolution, put
 * your project and account manager hat on."
 */
import { useState } from "react";

export interface Report {
  id: string; when: string; person: string; chartHref: string; what: string;
  where: string; device: string; errors: string[]; picture: string;
  status: string; notes: string; resolution: string;
}

const STATUS: [string, string][] = [
  ["new", "New"], ["looking", "Looking Into It"], ["fixed", "Fixed"], ["not-a-bug", "Not A Bug"], ["duplicate", "Duplicate"],
];

export function Reports({ reports }: { reports: Report[] }) {
  const [rows, setRows] = useState(reports);
  const [showClosed, setShowClosed] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const open = (r: Report) => r.status === "new" || r.status === "looking";
  const shown = rows.filter((r) => showClosed || open(r));

  async function save(r: Report) {
    setSaving(r.id);
    try {
      await fetch("/api/admin/report", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: r.id, status: r.status, notes: r.notes, resolution: r.resolution }),
      });
    } finally { setSaving(null); }
  }
  const edit = (id: string, k: keyof Report, v: string) => setRows((all) => all.map((r) => (r.id === id ? { ...r, [k]: v } : r)));

  return (
    <div>
      <p className="sub">
        {rows.filter(open).length} open of {rows.length}.{" "}
        <button className="perm" onClick={() => setShowClosed((v) => !v)}>{showClosed ? "Hide Closed" : "Show Closed"}</button>
      </p>
      {shown.length === 0 && <p className="sub">Nothing open.</p>}
      <div style={{ display: "grid", gap: 12 }}>
        {shown.map((r) => (
          <div key={r.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <b style={{ fontSize: 15, color: "var(--ink)" }}>{r.person}</b>{" "}
                <a href={r.chartHref} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>chart</a>
                <div className="dim" style={{ fontSize: 12 }}>{r.when} UTC{r.where ? ` · ${r.where}` : ""}{r.device ? ` · ${r.device}` : ""}</div>
              </div>
              <select value={r.status} onChange={(e) => { edit(r.id, "status", e.target.value); save({ ...r, status: e.target.value }); }}
                style={{ font: "inherit", fontSize: 13, padding: "4px 8px", borderRadius: 8 }}>
                {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <p style={{ whiteSpace: "pre-wrap", margin: "10px 0" }}>{r.what}</p>
            {r.picture && <a href={r.picture} target="_blank" rel="noreferrer"><img src={r.picture} alt="" style={{ maxWidth: 360, width: "100%", borderRadius: 8, border: "1px solid rgba(132,80,149,.2)" }} /></a>}
            {r.errors.length > 0 && <details style={{ marginTop: 8 }}><summary className="dim" style={{ fontSize: 12 }}>Page errors ({r.errors.length})</summary>
              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{r.errors.join("\n")}</pre></details>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
              <label style={{ fontSize: 11 }} className="dim">Notes
                <textarea value={r.notes} onChange={(e) => edit(r.id, "notes", e.target.value)} onBlur={() => save(r)} rows={3}
                  style={{ width: "100%", font: "inherit", fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid rgba(132,80,149,.25)" }} />
              </label>
              <label style={{ fontSize: 11 }} className="dim">Resolution
                <textarea value={r.resolution} onChange={(e) => edit(r.id, "resolution", e.target.value)} onBlur={() => save(r)} rows={3}
                  style={{ width: "100%", font: "inherit", fontSize: 13, padding: 8, borderRadius: 8, border: "1px solid rgba(132,80,149,.25)" }} />
              </label>
            </div>
            {saving === r.id && <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>Saving…</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
