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
 */
export function ChartTable(
  { rows, picked }: { rows: Row[]; picked: string | null },
) {
  const router = useRouter();
  const [choice, setChoice] = useState(picked);

  async function pick(id: string) {
    setChoice(id);
    try {
      await fetch("/api/portal/primary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chartId: id }),
      });
      router.refresh();
    } catch { setChoice(picked); }
  }

  return (
    <SortableTable
      initial={{ key: "name", dir: 1 }}
      picked={choice}
      onPick={pick}
      pickName="whoami"
      columns={[
        { key: "mine", label: "You", radio: true },
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
  );
}
