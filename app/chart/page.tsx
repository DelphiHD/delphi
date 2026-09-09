/**
 * The free chart, self-serve.
 *
 * This replaces the widget on the Wix site, which came from the chart provider,
 * cannot be edited, and looks like somebody else's product. Delphi's own: her
 * purple, Montserrat throughout, the starfield built from colour rather than
 * borrowed as an image.
 *
 * What changes underneath matters more. The place is chosen from the provider's
 * own lookup rather than typed, so the timezone comes from the same authority
 * that casts the chart. And the birth time is asked about honestly rather than
 * demanded, because a guessed time produces a confident chart that is wrong.
 */

"use client";

import { useEffect, useRef, useState } from "react";

type Accuracy = "document" | "told" | "approximate" | "unknown";

interface Place { value: string; timezone: string }

const ACCURACY_LABEL: Record<Accuracy, string> = {
  document: "It's on my birth certificate",
  told: "I was told the time",
  approximate: "I know roughly",
  unknown: "I don't know it",
};

const PART_OF_DAY: { key: string; label: string; time: string }[] = [
  { key: "early", label: "Small hours", time: "03:00" },
  { key: "morning", label: "Morning", time: "09:00" },
  { key: "afternoon", label: "Afternoon", time: "15:00" },
  { key: "evening", label: "Evening", time: "21:00" },
];

export default function ChartPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [accuracy, setAccuracy] = useState<Accuracy>("told");
  const [partOfDay, setPartOfDay] = useState<string>("");
  const [placeText, setPlaceText] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [options, setOptions] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string } | null>(null);
  const lookup = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The place is never taken on trust: what the person types is only a search,
  // and what is submitted is whatever the provider called it, with the timezone
  // the provider gave for it.
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
  const showsPartOfDay = accuracy === "approximate" || accuracy === "unknown";
  const ready = name.trim() && email.trim() && birthDate && place
    && (!needsTime || birthTime);

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const chosen = PART_OF_DAY.find((p) => p.key === partOfDay);
      const r = await fetch("/api/chart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          forEmail: email.trim(),
          birthDate,
          // An unknown time still gets the best window the person can give:
          // "morning" is a far smaller haystack than a whole day.
          birthTime: needsTime ? birthTime : chosen?.time ?? "",
          timeAccuracy: accuracy,
          place: place!.value,
          timezone: place!.timezone,
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "something went wrong");
      setResult({ url: j.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <h1>Know Thyself.</h1>
      <p className="sub">Your Human Design chart, cast from your birth details and yours to keep.</p>

      {result ? (
        <section className="card done">
          <h2>Your chart is ready.</h2>
          <p>
            This is yours to keep. The link works on any device, and it stays
            live, so save it somewhere you will find it again.
          </p>
          <a className="go" href={result.url}>Open my chart</a>
          <p className="fine">We have also sent it to {email}.</p>
        </section>
      ) : (
        <section className="card">
          <label htmlFor="name">Your name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)}
            autoComplete="name" />

          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} />
          <p className="fine">So we can send you the link. Nothing else.</p>

          <label htmlFor="place">Place of birth</label>
          <input id="place" value={placeText} autoComplete="off"
            placeholder="Start typing a city"
            onChange={(e) => { setPlaceText(e.target.value); setPlace(null); }} />
          {options.length > 0 && !place && (
            <ul className="places">
              {options.map((o) => (
                <li key={o.value}>
                  <button type="button" onClick={() => {
                    setPlace(o); setPlaceText(o.value); setOptions([]);
                  }}>{o.value}</button>
                </li>
              ))}
            </ul>
          )}
          {place && <p className="fine ok">Using {place.value} · {place.timezone}</p>}

          <label htmlFor="date">Date of birth</label>
          <input id="date" type="date" value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)} />

          <label>Birth time</label>
          <div className="chips">
            {(Object.keys(ACCURACY_LABEL) as Accuracy[]).map((a) => (
              <button type="button" key={a}
                className={a === accuracy ? "chip on" : "chip"}
                onClick={() => setAccuracy(a)}>{ACCURACY_LABEL[a]}</button>
            ))}
          </div>

          {needsTime && (
            <input id="time" type="time" value={birthTime}
              onChange={(e) => setBirthTime(e.target.value)} />
          )}

          {showsPartOfDay && (
            <>
              <p className="fine">
                {accuracy === "unknown"
                  ? "If you know roughly when, say so. A six hour window tells us far more than a whole day."
                  : "Which part of the day?"}
              </p>
              <div className="chips">
                {PART_OF_DAY.map((p) => (
                  <button type="button" key={p.key}
                    className={p.key === partOfDay ? "chip on" : "chip"}
                    onClick={() => setPartOfDay(p.key)}>{p.label}</button>
                ))}
              </div>
            </>
          )}

          {(accuracy === "unknown" || accuracy === "approximate") && (
            <div className="note">
              <p>
                <strong>Your birth time is probably findable.</strong> The short
                birth certificate most people keep does not carry it, but the
                long form does, and nearly anyone can request one from the
                office of vital records in the state or country they were born
                in. Ask for the <em>long form</em>, sometimes called the vault
                copy or the certified copy of the original certificate of live
                birth.
              </p>
              <p>
                Without a time, your Type and Authority are usually still
                reliable, but your Profile, your Ascendant and all four of your
                variables may not be. Your chart will say which is which rather
                than guess.
              </p>
              <p>
                <a href="https://cal.com/DelphiHumanDesign" target="_blank" rel="noreferrer">
                  Book a rectification session
                </a>{" "}
                if you would rather work it out from your life than from paperwork.
              </p>
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <button className="go" disabled={!ready || busy} onClick={submit}>
            {busy ? "Casting your chart…" : "Create my chart"}
          </button>
          <p className="fine">Takes about ten seconds.</p>
        </section>
      )}

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap");
        :root {
          --purple: #845095;
          --purple-deep: #5d3569;
          --ink: #1c1a2e;
          --muted: #6f6880;
          --line: rgba(132, 80, 149, 0.18);
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          /* The site opens on a starfield. This is that feeling built from
             colour rather than borrowing an image that belongs to the page it
             sits in front of. */
          background:
            radial-gradient(1100px 620px at 22% -8%, rgba(132, 80, 149, 0.5), transparent 62%),
            radial-gradient(900px 520px at 84% 8%, rgba(58, 78, 140, 0.42), transparent 58%),
            #0b0913;
          background-attachment: fixed;
          font-family: Montserrat, "Helvetica Neue", Arial, sans-serif;
          color: var(--ink);
          -webkit-font-smoothing: antialiased;
        }
        .wrap { max-width: 560px; margin: 0 auto; padding: 64px 20px 90px; }
        h1 {
          font-weight: 300;
          font-size: clamp(34px, 7vw, 52px);
          letter-spacing: 0.02em;
          color: #fff;
          text-align: center;
          margin: 0 0 8px;
          text-wrap: balance;
        }
        .sub {
          text-align: center;
          color: rgba(255, 255, 255, 0.66);
          font-size: 14.5px;
          font-weight: 400;
          margin: 0 0 34px;
          line-height: 1.6;
        }
        .card {
          background: #fff;
          border-radius: 20px;
          padding: 30px 28px 32px;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.4);
        }
        label {
          display: block;
          color: var(--muted);
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.13em;
          text-transform: uppercase;
          margin: 22px 0 7px;
        }
        label:first-of-type { margin-top: 0; }
        input {
          width: 100%;
          font: inherit;
          font-size: 15.5px;
          padding: 11px 2px;
          border: 0;
          border-bottom: 1px solid var(--line);
          border-radius: 0;
          background: transparent;
          color: var(--ink);
        }
        input:focus { outline: none; border-bottom-color: var(--purple); }
        input:focus-visible { outline: none; }
        .fine { color: var(--muted); font-size: 12px; margin: 7px 0 0; line-height: 1.55; }
        .fine.ok { color: var(--purple); font-weight: 500; }
        .error {
          background: #fdf3f2; color: #a8443a; border-radius: 12px;
          padding: 11px 14px; font-size: 13px; margin: 16px 0 0; line-height: 1.5;
        }
        .places {
          list-style: none; margin: 4px 0 0; padding: 4px;
          border: 1px solid var(--line); border-radius: 12px;
        }
        .places button {
          display: block; width: 100%; text-align: left; font: inherit; font-size: 14px;
          padding: 9px 11px; border: 0; border-radius: 8px; background: transparent; cursor: pointer;
          color: var(--ink);
        }
        .places button:hover { background: #f6f1f8; }
        .chips { display: flex; flex-wrap: wrap; gap: 7px; }
        .chip {
          font: inherit; font-size: 12.5px; padding: 8px 15px; border-radius: 999px;
          border: 1px solid var(--line); background: #fff; color: var(--muted); cursor: pointer;
        }
        .chip:hover { border-color: var(--purple); color: var(--purple); }
        .chip.on { background: var(--purple); border-color: var(--purple); color: #fff; font-weight: 600; }
        .note {
          background: #faf7fb; border: 1px solid var(--line); border-radius: 14px;
          padding: 16px 18px; margin-top: 20px; font-size: 13px; line-height: 1.65; color: var(--ink);
        }
        .note p { margin: 0 0 11px; }
        .note p:last-child { margin-bottom: 0; }
        .note strong { color: var(--purple); }
        .note a { color: var(--purple); font-weight: 600; }
        .go {
          display: block; width: 100%; margin-top: 26px; font: inherit; font-weight: 600;
          font-size: 15px; letter-spacing: 0.02em; padding: 15px; border-radius: 999px; border: 0;
          background: var(--purple); color: #fff; cursor: pointer; text-align: center;
          text-decoration: none;
        }
        .go:hover { background: var(--purple-deep); }
        .go:disabled { opacity: 0.4; cursor: default; }
        .card.done h2 {
          font-weight: 300; font-size: 27px; color: var(--purple); margin: 0 0 12px;
        }
        .card.done p { color: var(--ink); font-size: 14.5px; line-height: 1.65; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>
    </main>
  );
}
