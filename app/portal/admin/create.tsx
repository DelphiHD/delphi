"use client";

/**
 * The chart creator, on the dashboard.
 *
 * Kaycee, 2026-10-03: "can you just make me a widget on the dashboard with a
 * chart creator so I don't have to deal with this kind of bullshit every
 * fucking time I need a chart? Please be sure to add selectors for the
 * different funnel columns."
 *
 * Every column the tables sort by is a selector here, so a chart arrives in the
 * right part of the funnel instead of being filed afterwards. Picking who it is
 * for sets the usual tier and visibility for that kind of person, and she can
 * override either.
 *
 * The place is a search, never a typed string: the provider's own lookup
 * returns the canonical name and the timezone together, and both go to the
 * builder exactly as given. A timezone guessed from a place name is where wrong
 * charts come from.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Place { value: string; timezone: string }

/** label, source value, and the tier and visibility that usually go with it */
const SOURCES: { label: string; value: string; tier: string; visibility: string }[] = [
  { label: "Roster", value: "", tier: "seed", visibility: "private" },
  { label: "Signed up", value: "signup", tier: "free", visibility: "private" },
  { label: "Public figure", value: "public-figure", tier: "free", visibility: "public" },
  { label: "Sandbox", value: "sandbox", tier: "free", visibility: "private" },
];

const ACCURACY = [
  { label: "From a document", value: "document" },
  { label: "Told, no document", value: "told" },
  { label: "Rough", value: "approximate" },
  { label: "Unknown", value: "unknown" },
];

const TIERS = [
  { label: "Roster", value: "seed" },
  { label: "Free", value: "free" },
  { label: "Purchased", value: "purchased" },
  { label: "Gift", value: "gift" },
];

const VISIBILITIES = [
  { label: "Private", value: "private" },
  { label: "Shared", value: "shared" },
  { label: "Public", value: "public" },
];

export function CreateChart({ events }: { events: string[] }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [placeText, setPlaceText] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [options, setOptions] = useState<Place[]>([]);

  // The funnel columns.
  const [source, setSource] = useState("");
  const [newEvent, setNewEvent] = useState("");
  const [accuracy, setAccuracy] = useState("document");
  const [tier, setTier] = useState("seed");
  const [visibility, setVisibility] = useState("private");
  const [email, setEmail] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<{ url: string; name: string } | null>(null);
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

  /** Picking who it is for moves tier and visibility with it, until she moves them. */
  function pickSource(value: string) {
    setSource(value);
    const known = SOURCES.find((s) => s.value === value);
    if (known) { setTier(known.tier); setVisibility(known.visibility); }
    else { setTier("free"); setVisibility("private"); }
  }

  const isNewEvent = source === "__new__";
  const slug = isNewEvent ? newEvent.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") : source;
  const needsTime = accuracy !== "unknown";
  const ready = !!name.trim() && !!birthDate && !!place && (!needsTime || !!birthTime)
    && (!isNewEvent || slug.length > 1);

  async function submit() {
    setError(""); setMade(null); setBusy(true);
    try {
      const r = await fetch("/api/admin/chart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          birthDate,
          birthTime: needsTime ? birthTime : "",
          place: place?.value,
          timezone: place?.timezone,
          timeAccuracy: accuracy,
          source: slug,
          tier,
          visibility,
          forEmail: email.trim(),
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        setError(j.error ?? "that did not work");
        if (j.url) setMade({ url: j.url, name: name.trim() });
        return;
      }
      setMade({ url: j.url, name: name.trim() });
      setName(""); setBirthDate(""); setBirthTime("");
      setPlaceText(""); setPlace(null); setEmail("");
      // So the tables below count the new chart without a reload.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "that did not work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="make">
      <style>{`
        .make { background: #fff; border: 1px solid rgba(132,80,149,.18); border-radius: 13px; padding: 16px 16px 18px; }
        .make label { display: block; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 600; margin: 0 0 4px; }
        .make input, .make select { width: 100%; font: inherit; font-size: 14px; padding: 9px 11px; border: 1px solid rgba(132,80,149,.25); border-radius: 10px; background: #fff; color: var(--ink); }
        .make input:focus, .make select:focus { outline: 2px solid rgba(132,80,149,.3); outline-offset: 1px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 11px; }
        .field { min-width: 0; }
        .wide { grid-column: 1 / -1; }
        .places { list-style: none; margin: 5px 0 0; padding: 0; border: 1px solid rgba(132,80,149,.2); border-radius: 10px; overflow: hidden; }
        .places button { width: 100%; text-align: left; font: inherit; font-size: 13.5px; padding: 8px 11px; border: 0; background: #fff; color: var(--ink); cursor: pointer; }
        .places button:hover { background: rgba(132,80,149,.08); }
        .fine { font-size: 12px; color: var(--muted); margin: 5px 0 0; }
        .fine.ok { color: var(--purple); }
        .go { margin-top: 14px; font: inherit; font-weight: 600; font-size: 14px; padding: 10px 20px; border: 0; border-radius: 10px; background: var(--purple); color: #fff; cursor: pointer; }
        .go[disabled] { opacity: .4; cursor: default; }
        .said { margin-top: 13px; padding: 11px 13px; border-radius: 11px; font-size: 13.5px; background: rgba(132,80,149,.08); }
        .said.bad { background: rgba(170,40,40,.09); }
        .said a { color: var(--purple); font-weight: 600; }
        .divider { grid-column: 1 / -1; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 600; border-top: 1px solid rgba(132,80,149,.14); padding-top: 12px; margin-top: 2px; }
      `}</style>

      <div className="grid">
        <div className="field wide">
          <label htmlFor="n">Name</label>
          <input id="n" value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field wide">
          <label htmlFor="p">Place of birth</label>
          <input id="p" value={placeText} autoComplete="off" placeholder="Start typing a city"
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
          {place && <p className="fine ok">Using {place.value} · {place.timezone}</p>}
          {!place && placeText.trim().length > 2 && options.length === 0 && (
            <p className="fine">No match yet. The chart can only be cast from a place on this list.</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="d">Date of birth</label>
          <input id="d" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="t">Time of birth</label>
          <input id="t" type="time" value={birthTime} disabled={!needsTime}
            onChange={(e) => setBirthTime(e.target.value)} />
          {!needsTime && <p className="fine">Cast across the whole day.</p>}
        </div>

        <div className="divider">Funnel</div>

        <div className="field">
          <label htmlFor="s">How they got here</label>
          <select id="s" value={source} onChange={(e) => pickSource(e.target.value)}>
            {SOURCES.map((s) => <option key={s.label} value={s.value}>{s.label}</option>)}
            {events.map((e) => <option key={e} value={e}>Event: {e}</option>)}
            <option value="__new__">A new event…</option>
          </select>
          {isNewEvent && (
            <input style={{ marginTop: 7 }} value={newEvent} placeholder="Event name"
              onChange={(e) => setNewEvent(e.target.value)} />
          )}
          {isNewEvent && slug.length > 1 && <p className="fine">Filed as {slug}.</p>}
        </div>

        <div className="field">
          <label htmlFor="a">Birth time</label>
          <select id="a" value={accuracy} onChange={(e) => setAccuracy(e.target.value)}>
            {ACCURACY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="ti">Tier</label>
          <select id="ti" value={tier} onChange={(e) => setTier(e.target.value)}>
            {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="v">Who can see it</label>
          <select id="v" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            {VISIBILITIES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>

        <div className="field wide">
          <label htmlFor="e">Email, if there is one</label>
          <input id="e" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} />
          <p className="fine">Recorded against the chart. Nothing is sent from here.</p>
        </div>
      </div>

      <button className="go" disabled={!ready || busy} onClick={submit}>
        {busy ? "Casting…" : "Make the chart"}
      </button>
      {busy && <p className="fine">About fifteen seconds. Leaving this tab is fine, the chart finishes either way.</p>}

      {error && (
        <p className="said bad">
          {error}
          {made && <> <a href={made.url} target="_blank" rel="noreferrer">Open the one that exists</a>.</>}
        </p>
      )}
      {!error && made && (
        <p className="said">
          {made.name} is made. <a href={made.url} target="_blank" rel="noreferrer">Open the chart</a>
          <br /><span className="fine">{made.url}</span>
        </p>
      )}
    </div>
  );
}
