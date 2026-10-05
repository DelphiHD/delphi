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

export function MakePrimary(
  { chartId, isPrimary, name }: { chartId: string; isPrimary: boolean; name?: string },
) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (isPrimary) return <span className="tier">Your chart</span>;
  return (
    <button
      className="linky small"
      disabled={busy}
      onClick={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await fetch("/api/portal/primary", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chartId }),
          });
          router.refresh();
        } finally { setBusy(false); }
      }}
    >
      {name ? `${name} is mine` : "This one is mine"}
    </button>
  );
}
