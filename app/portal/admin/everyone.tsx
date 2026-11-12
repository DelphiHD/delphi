"use client";

/**
 * The Everyone list, with Fix and Delete on each chart.
 *
 * Kaycee, 2026-11-11, after a mistyped birth date on a chart she had just made
 * left her with no way to correct it and no way to make it again: "Can I just
 * have a system so I can do it myself? And fix problems/delete charts made in
 * error without having to write you a dissertation?"
 *
 * Fix uses the same edit the chart owners use from their portal
 * (/api/chart/edit): every change is kept in the chart's edit history, and the
 * chart is redrawn on the same link. Delete uses the portal's delete, which
 * removes the chart, its link and its files for good, so it asks once first.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SortableTable, type Column, type Row } from "./table";

interface Place { value: string; timezone: string }

const ACCURACY = [
  { label: "From a document", value: "document" },
  { label: "Told, no document", value: "told" },
  { label: "Rough", value: "approximate" },
  { label: "Unknown", value: "unknown" },
];

export function Everyone({ columns, rows }: { columns: Column[]; rows: Row[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Row | null>(null);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [accuracy, setAccuracy] = useState("told");
  const [placeText, setPlaceText] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [options, setOptions] = useState<Place[]>([]);
  const [busy, setBusy] = useState("");
  const [said, setSaid] = useState<{ text: string; bad?: boolean } | null>(null);
  const [sure, setSure] = useState(false);
  // gone from the list at once, rather than when the page next reloads
  const [gone, setGone] = useState<string[]>([]);
  const lookup = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  function start(id: string) {
    const r = rows.find((x) => String(x.id) === id);
    if (!r) return;
    setOpen(r); setSaid(null); setSure(false); setOptions([]);
    setName(String(r.fullName ?? ""));
    setBirthDate(String(r.birthDate ?? ""));
    setBirthTime(String(r.birthTime ?? "").slice(0, 5));
    setAccuracy(String(r.accuracy ?? "told"));
    const p = { value: String(r.birthPlace ?? ""), timezone: String(r.birthZone ?? "") };
    setPlace(p); setPlaceText(p.value);
    setTimeout(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  useEffect(() => {
    if (place && placeText === place.value) return;
    if (placeText.trim().length < 3) { setOptions([]); return; }
    if (lookup.current) clearTimeout(lookup.current);
    lookup.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(placeText)}`);
        const j = await r.json();
        setOptions(j.places ?? []);
      } catch { setOptions([]); }
    }, 300);
  }, [placeText, place]);

  const needsTime = accuracy !== "unknown";
  const ready = !!open && !!name.trim() && !!birthDate && !!place && (!needsTime || !!birthTime);

  async function save() {
    if (!open) return;
    setBusy("save"); setSaid(null);
    try {
      const r = await fetch("/api/chart/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token: open.id, name: name.trim(), birthDate,
          birthTime: needsTime ? birthTime : "",
          place: place?.value, timezone: place?.timezone, timeAccuracy: accuracy,
        }),
      });
      const j = await r.json();
      if (!j.ok) { setSaid({ text: j.error ?? "That did not save.", bad: true }); return; }
      if (!j.changed?.length) { setSaid({ text: "Nothing was different, so nothing changed." }); return; }
      setSaid(j.rebuilt
        ? { text: "Saved and redrawn. The link is the same. It can take a minute or two to show the change." }
        : { text: "Saved. The chart could not be redrawn just now; press Save again in a minute.", bad: true });
      router.refresh();
    } catch (e) {
      setSaid({ text: e instanceof Error ? e.message : "That did not save.", bad: true });
    } finally { setBusy(""); }
  }

  async function erase() {
    if (!open) return;
    setBusy("delete"); setSaid(null);
    try {
      const r = await fetch("/api/portal/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chartId: open.chartId }),
      });
      const j = await r.json();
      if (!j.ok) { setSaid({ text: j.error ?? "That did not delete.", bad: true }); return; }
      setGone((g) => [...g, String(open.id)]);
      setOpen(null);
      router.refresh();
    } catch (e) {
      setSaid({ text: e instanceof Error ? e.message : "That did not delete.", bad: true });
    } finally { setBusy(""); setSure(false); }
  }

  return (
    <>
      <style>{`
        .fix { background: #fff; border: 1px solid rgba(132,80,149,.25); border-radius: 13px; padding: 16px; margin: 0 0 14px; }
        .fix h3 { margin: 0 0 12px; font-size: 15px; color: var(--purple); }
        .fix label { display: block; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin: 0 0 4px; }
        .fix input, .fix select { width: 100%; font: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid rgba(132,80,149,.25); border-radius: 10px; background: #fff; color: var(--ink); }
        .fix .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 11px; }
        .fix .wide { grid-column: 1 / -1; }
        .fix .places { list-style: none; margin: 5px 0 0; padding: 0; border: 1px solid rgba(132,80,149,.2); border-radius: 10px; overflow: hidden; }
        .fix .places button { width: 100%; text-align: left; font: inherit; font-size: 13.5px; padding: 8px 11px; border: 0; background: #fff; cursor: pointer; }
        .fix .places button:hover { background: rgba(132,80,149,.08); }
        .fix .fine { font-size: 12px; color: var(--muted); margin: 5px 0 0; }
        .fix .row { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 14px; align-items: center; }
        .fix .go { font: inherit; font-weight: 600; font-size: 14px; padding: 10px 20px; border: 0; border-radius: 10px; background: var(--purple); color: #fff; cursor: pointer; }
        .fix .go[disabled] { opacity: .4; cursor: default; }
        .fix .plain { font: inherit; font-size: 14px; padding: 10px 16px; border-radius: 10px; border: 1px solid rgba(132,80,149,.3); background: #fff; color: var(--ink); cursor: pointer; }
        .fix .del { font: inherit; font-size: 14px; padding: 10px 16px; border-radius: 10px; border: 1px solid rgba(170,40,40,.45); background: #fff; color: #a32828; cursor: pointer; margin-left: auto; }
        .fix .del.sure { background: #a32828; color: #fff; }
        .fix .said { margin-top: 12px; padding: 10px 12px; border-radius: 10px; font-size: 13.5px; background: rgba(132,80,149,.08); }
        .fix .said.bad { background: rgba(170,40,40,.09); }
      `}</style>

      {open && (
        <div className="fix" ref={panel}>
          <h3>Fix {String(open.fullName ?? "")}</h3>
          <div className="grid">
            <div className="wide">
              <label htmlFor="fx-n">Name</label>
              <input id="fx-n" value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="wide">
              <label htmlFor="fx-p">Place of birth</label>
              <input id="fx-p" value={placeText} autoComplete="off"
                onChange={(e) => { setPlaceText(e.target.value); setPlace(null); }} />
              {options.length > 0 && !place && (
                <ul className="places">
                  {options.map((o) => (
                    <li key={o.value}>
                      <button type="button" onClick={() => { setPlace(o); setPlaceText(o.value); setOptions([]); }}>{o.value}</button>
                    </li>
                  ))}
                </ul>
              )}
              {!place && <p className="fine">Pick the place from the list.</p>}
            </div>
            <div>
              <label htmlFor="fx-d">Date of birth</label>
              <input id="fx-d" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="fx-t">Time of birth</label>
              <input id="fx-t" type="time" value={birthTime} disabled={!needsTime} onChange={(e) => setBirthTime(e.target.value)} />
            </div>
            <div>
              <label htmlFor="fx-a">Birth time</label>
              <select id="fx-a" value={accuracy} onChange={(e) => setAccuracy(e.target.value)}>
                {ACCURACY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            <button className="go" disabled={!ready || !!busy} onClick={save}>{busy === "save" ? "Saving…" : "Save"}</button>
            <button className="plain" disabled={!!busy} onClick={() => setOpen(null)}>Close</button>
            {open.chartId && (
              <button className={sure ? "del sure" : "del"} disabled={!!busy}
                onClick={() => (sure ? erase() : setSure(true))}>
                {busy === "delete" ? "Deleting…" : sure ? "Yes, Delete For Good" : "Delete"}
              </button>
            )}
          </div>
          {sure && !busy && <p className="said bad">This removes the chart and its link for good. It cannot be undone.</p>}
          {said && <p className={said.bad ? "said bad" : "said"}>{said.text}</p>}
        </div>
      )}

      <SortableTable
        initial={{ key: "since", dir: -1 }}
        columns={columns}
        rows={rows.filter((r) => !gone.includes(String(r.id)))}
        onAction={(id) => start(id)}
      />
    </>
  );
}
