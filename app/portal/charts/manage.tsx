"use client";

/**
 * Storing charts: add one, and say which is yours.
 *
 * Kaycee, 2026-10-05: "there needs to be a way for people to store charts...
 * A parent might want to be able to easily toggle back and forth between
 * their kids charts without re-entering their birth info."
 *
 * The place is the provider's own lookup, the same control the public form
 * uses, so the timezone is never guessed from a typed string.
 */

import { useEffect, useRef, useState } from "react";
import { SortableTable, type Row } from "@/app/portal/admin/table";
import { useRouter } from "next/navigation";

interface Place { value: string; timezone: string }

const ACCURACY = [
  { label: "From a birth certificate", value: "document" },
  { label: "Told, no document", value: "told" },
  { label: "Roughly", value: "approximate" },
  { label: "Not known", value: "unknown" },
];

export function AddChart() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [placeText, setPlaceText] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [options, setOptions] = useState<Place[]>([]);
  const [accuracy, setAccuracy] = useState("told");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lookup = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const ready = !!name.trim() && !!birthDate && !!place && (!needsTime || !!birthTime);

  async function submit() {
    setError(""); setBusy(true);
    try {
      const r = await fetch("/api/portal/chart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), birthDate, birthTime: needsTime ? birthTime : "",
          place: place?.value, timezone: place?.timezone, timeAccuracy: accuracy,
        }),
      });
      const j = await r.json();
      if (!j.ok) { setError(j.error ?? "that did not work"); return; }
      setName(""); setBirthDate(""); setBirthTime(""); setPlaceText(""); setPlace(null);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "that did not work");
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <p className="more">
        <button className="linky" onClick={() => setOpen(true)}>Add a chart</button>
      </p>
    );
  }

  return (
    <div className="addbox">
      <label htmlFor="cn">Whose chart is this</label>
      <input id="cn" value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />

      <label htmlFor="cp">Place of birth</label>
      <input id="cp" value={placeText} autoComplete="off" placeholder="Start typing a city"
        onChange={(e) => { setPlaceText(e.target.value); setPlace(null); }} />
      {options.length > 0 && !place && (
        <ul className="places">
          {options.map((o) => (
            <li key={o.value}>
              <button type="button" onClick={() => { setPlace(o); setPlaceText(o.value); setOptions([]); }}>
                {o.value}
              </button>
            </li>
          ))}
        </ul>
      )}
      {place && <p className="fine">Using {place.value}</p>}

      <div className="two">
        <div>
          <label htmlFor="cd">Date of birth</label>
          <input id="cd" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ct">Time of birth</label>
          <input id="ct" type="time" value={birthTime} disabled={!needsTime}
            onChange={(e) => setBirthTime(e.target.value)} />
        </div>
      </div>

      <label htmlFor="ca">How well is the time known</label>
      <select id="ca" value={accuracy} onChange={(e) => setAccuracy(e.target.value)}>
        {ACCURACY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
      </select>

      <div className="row">
        <button className="go" disabled={!ready || busy} onClick={submit}>
          {busy ? "Drawing the chart…" : "Add this chart"}
        </button>
        <button className="linky" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <p className="warn">{error}</p>}
    </div>
  );
}

/**
 * The table of charts, with the one that is you chosen in it.
 *
 * It was a line of "X is mine" links under the table, one per chart, which on
 * Kaycee's account was eighty-one of them: "This will work, but this looks
 * terrible." She is right, and right about the fix too: "Can we just add a
 * button or radio in the table?" The choice belongs on the row it is about.
 *
 * Choosing asks first. On 2026-10-11 her own was found set to a chart called
 * "test", most likely one stray tap while scrolling eighty rows on a phone:
 * "we should probably make it a little more difficult to change My Chart."
 * The same day she folded it into Manage and took the radio column away: the
 * chart that is yours stays at the top of the list, in its own colour.
 *
 * Manage, on each row: archive (out of the list, link intact, undoable) or
 * delete (erased for good, after a window that says so and offers the chart's
 * data first). Kaycee, 2026-10-11.
 */
type Asking =
  | { kind: "mine"; id: string; name: string }
  | { kind: "manage"; id: string; name: string; archived: boolean; href: string }
  | { kind: "delete"; id: string; name: string; href: string };

export function ChartTable(
  { rows, picked }: { rows: Row[]; picked: string | null },
) {
  const router = useRouter();
  const [choice, setChoice] = useState(picked);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const archivedCount = rows.filter((r) => r.archived === "yes").length;
  const shown = rows.filter((r) => (r.archived === "yes") === showArchived);
  const close = () => { setAsking(null); setError(""); setBusy(false); };

  async function post(url: string, body: object): Promise<boolean> {
    setBusy(true); setError("");
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({ ok: false }));
      if (!j.ok) { setError("That did not work. Please try again."); setBusy(false); return false; }
      router.refresh();
      return true;
    } catch {
      setError("That did not work. Please try again."); setBusy(false); return false;
    }
  }

  async function makeMine(id: string) {
    if (await post("/api/portal/primary", { chartId: id })) { setChoice(id); close(); }
  }
  async function archive(id: string, archived: boolean) {
    if (await post("/api/portal/archive", { chartId: id, archived })) close();
  }
  async function erase(id: string) {
    if (await post("/api/portal/delete", { chartId: id })) close();
  }

  return (
    <>
      {archivedCount > 0 && (
        <div className="shelf">
          <button className="linky" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Hide Archived" : `Show Archived (${archivedCount})`}
          </button>
        </div>
      )}
      <SortableTable
        initial={{ key: "name", dir: 1 }}
        pinned={choice}
        onAction={(id) => {
          const r = rows.find((x) => String(x.id) === id);
          if (r) setAsking({ kind: "manage", id, name: String(r.name), archived: r.archived === "yes", href: String(r.chartHref) });
        }}
        columns={[
          { key: "name", label: "Name" },
          { key: "chart", label: "Chart", link: "chartHref" },
          { key: "profile", label: "Profile" },
          { key: "type", label: "Type" },
          { key: "authority", label: "Authority", small: true },
          { key: "definition", label: "Definition", small: true },
          { key: "sun", label: "Personality Sun", small: true },
          { key: "born", label: "Birth data", small: true },
          { key: "manage", label: "", action: true },
        ]}
        rows={shown}
        empty="No charts on this account yet."
      />

      {asking && (
        <div className="veil" onClick={(e) => { if (e.target === e.currentTarget && !busy) close(); }}>
          <div className="ask" role="dialog" aria-modal="true">
            {asking.kind === "mine" && (<>
              <h2>Make {asking.name} your chart?</h2>
              <div className="btns">
                <button className="yes" disabled={busy} onClick={() => makeMine(asking.id)}>Yes</button>
                <button disabled={busy} onClick={close}>Cancel</button>
              </div>
            </>)}
            {asking.kind === "manage" && (<>
              <h2>{asking.name}</h2>
              <div className="btns">
                {asking.id !== choice && (
                  <button disabled={busy} onClick={() => setAsking({ kind: "mine", id: asking.id, name: asking.name })}>Make This My Chart</button>
                )}
                <button disabled={busy} onClick={() => archive(asking.id, !asking.archived)}>
                  {asking.archived ? "Restore" : "Archive"}
                </button>
                <button disabled={busy} onClick={() => setAsking({ kind: "delete", id: asking.id, name: asking.name, href: asking.href })}>Delete</button>
                <button disabled={busy} onClick={close}>Close</button>
              </div>
            </>)}
            {asking.kind === "delete" && (<>
              <h2>Delete {asking.name}&rsquo;s chart?</h2>
              <p>
                This erases the chart, its link and everything saved with it. It
                cannot be undone. Download the chart data first if you want to keep it.
              </p>
              <div className="btns">
                <a className="btn" href={`${asking.href}?export=data`} target="_blank" rel="noreferrer">Download Chart Data</a>
                <button className="gone" disabled={busy} onClick={() => erase(asking.id)}>Delete Forever</button>
                <button disabled={busy} onClick={close}>Cancel</button>
              </div>
            </>)}
            {error && <p className="err">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
