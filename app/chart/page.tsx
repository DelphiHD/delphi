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
  document: "It's On My Birth Certificate",
  told: "I Was Told The Time",
  approximate: "I Know Roughly",
  unknown: "I Don't Know It",
};

const PART_OF_DAY: { key: string; label: string; time: string }[] = [
  { key: "early", label: "Small Hours", time: "03:00" },
  { key: "morning", label: "Morning", time: "09:00" },
  { key: "afternoon", label: "Afternoon", time: "15:00" },
  { key: "evening", label: "Evening", time: "21:00" },
];

export default function ChartPage() {
  // Embedded in her home page this form has to live inside a hero, next to a
  // heading, on a laptop screen. On its own page it can breathe. Same form,
  // two amounts of room. Detected rather than configured, so the Wix embed
  // needs no special URL and cannot be pasted in wrong.
  const [, setCompact] = useState(false);
  useEffect(() => {
    let inFrame = false;
    try {
      inFrame = window.self !== window.top || new URLSearchParams(location.search).has("embed");
    } catch {
      inFrame = true;     // blocked from reading the parent means we are in one
    }
    setCompact(inFrame);
    document.body.classList.toggle("compact", inFrame);
  }, []);

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
  const [result, setResult] = useState<
    { url: string; account?: boolean; emailed?: boolean } | null>(null);
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
      setResult({ url: j.url, account: j.account, emailed: j.emailed });
    } catch (e) {
      setError(e instanceof Error ? e.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <h1>View Your Birth Chart</h1>

      {result ? (
        <section className="card done">
          <h2>Your chart is ready.</h2>
          <p>
            This link is yours. It works on any device and it stays live, so
            save it somewhere you will find it again.
          </p>
          <a className="go" href={result.url}>Open My Chart</a>
          <p className="fine">
            {result.emailed
              ? `Sent to ${email} as well, so you have it twice.`
              : result.account
                ? `Saved to ${email}, so you can find it again later.`
                : "Save the link: it is the only way back to this chart."}
          </p>
        </section>
      ) : (
        <section className="card">
          {/* Side by side rather than stacked. Embedded in a hero there is
              width going spare and no height at all, and every stacked field
              is another seventy pixels the section has to find.
              Kaycee, 2026-09-10: "It feels like there is plenty of room to be
              wider, but not taller." */}
          <div className="pair">
            <div>
              <label htmlFor="name">Your name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)}
                autoComplete="name" />
            </div>
            <div>
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} autoComplete="email"
                onChange={(e) => setEmail(e.target.value)} />
              {/* Under the email, not under the name. Side by side it was
                  sitting beneath the wrong field and reading as a note about
                  what her name would be used for. */}
              <p className="fine">So we can send you the link. Nothing else.</p>
            </div>
          </div>

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

          <div className="pair">
            <div>
              <label htmlFor="date">Date of birth</label>
              <input id="date" type="date" value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)} />
            </div>

          {/* The time comes before the question about it: people know the time
              or they do not, and asking how sure they are before they have
              typed anything is backwards. It was also easy to miss underneath
              four buttons, especially on a phone. */}
            {needsTime && (
              <div>
                <label htmlFor="time">Time of birth</label>
                <input id="time" className="boxed" type="time" value={birthTime}
                  onChange={(e) => setBirthTime(e.target.value)} />
              </div>
            )}
          </div>

          <label>{needsTime ? "How sure is that time?" : "Birth time"}</label>
          <div className="chips">
            {(Object.keys(ACCURACY_LABEL) as Accuracy[]).map((a) => (
              <button type="button" key={a}
                className={a === accuracy ? "chip on" : "chip"}
                onClick={() => setAccuracy(a)}>{ACCURACY_LABEL[a]}</button>
            ))}
          </div>

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
                <a href="https://cal.com/delphihumandesign/birth-time-rectification" target="_blank" rel="noreferrer">
                  Book A Rectification Session
                </a>{" "}
                if you would rather work it out from your life than from paperwork.
              </p>
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <button className="go" disabled={!ready || busy} onClick={submit}>
            {busy ? "Casting Your Chart…" : "Create My Chart"}
          </button>
        </section>
      )}

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap");
        :root {
          --purple: #845095;
          --purple-light: #b89ac2;
          --ink: #1c1a2e;
          --muted: #6f6880;
          --gold: #f1c232;
        }
        * { box-sizing: border-box; }
        body {
          /* The white box is the page; the form inside it carries the night sky.
             The other way round put a dark slab on top of her own hero image. */
          margin: 0;
          background: #fff;
          font-family: Montserrat, "Helvetica Neue", Arial, sans-serif;
          color: var(--ink);
          -webkit-font-smoothing: antialiased;
        }
        /* The card fills its box with an even white margin all round, rather than
           sitting narrow in a wide white field. Embedded in her home page the box
           is about 800 wide, so the white reads as a thin frame that makes the
           card pop instead of a broad border down two sides only.
           Kaycee, 2026-09-10: "it would be nice if the white border was the same
           all the way around and it fit on one page... just enough to make it pop." */
        .wrap { width: 100%; max-width: 900px; margin: 0 auto; padding: 22px; }
        /* Inside her page the hero says "Know Thyself." right above this, so
           the page's own title is said twice and costs height that the section
           does not have. */
        body.compact h1 { display: none; }
        /* Embedded, the card IS the box. The white was this page's own
           background showing around a card that sat inside it, which is why it
           read as a border of its own rather than part of her page. The widget
           it replaces had no white at all: the form filled its frame.
           Kaycee, 2026-09-10: "The dimensions of the bodygraph widget were
           great, this looks funny."
           min-height 100vh so the card fills whatever height the section is
           given, instead of leaving a strip of page underneath it. */
        /* A slim white frame, even on all four sides, so the card lifts off the
           starfield behind it the way the widget it replaces did. Not a field of
           white: the card fills everything inside the frame, whatever height the
           section is given, so there is never a dead strip underneath.
           Kaycee, 2026-09-10: "there was a slight white border around the
           bodygraph widget so it stood out from the hero image, but it wasn't
           half a page of white space." */
        body.compact .wrap { padding: 14px; max-width: none; }
        body.compact .card {
          min-height: calc(100vh - 28px);
          padding: 24px 26px 26px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        h1 {
          font-weight: 400;
          font-size: clamp(21px, 4vw, 27px);
          letter-spacing: 0.02em;
          color: var(--ink);
          text-align: center;
          margin: 0 0 14px;
          text-wrap: balance;
        }
        .card {
          background:
            radial-gradient(760px 420px at 20% -10%, rgba(132, 80, 149, 0.55), transparent 62%),
            radial-gradient(620px 380px at 88% 6%, rgba(58, 78, 140, 0.45), transparent 58%),
            #0b0913;
          border-radius: 20px;
          padding: 30px 28px 32px;
          box-shadow: 0 18px 46px rgba(28, 26, 46, 0.22);
        }
        label {
          display: block;
          color: rgba(255, 255, 255, 0.62);
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
          /* 16px exactly. Safari zooms the whole page in when a field smaller
             than this takes focus, which on a phone throws the layout sideways
             mid-form. */
          font-size: 16px;
          padding: 11px 2px;
          border: 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.28);
          border-radius: 0;
          background: transparent;
          color: #fff;
        }
        input::placeholder { color: rgba(255, 255, 255, 0.42); }
        input:focus { outline: none; border-bottom-color: var(--purple-light); }
        /* A time field is a handful of characters in a wide empty row, which
           reads as nothing at all on a phone. This one gets an edge. */
        input.boxed {
          border: 1px solid rgba(255, 255, 255, 0.34);
          border-radius: 12px;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.06);
        }
        input.boxed:focus { border-color: var(--purple-light); background: rgba(255, 255, 255, 0.1); }
        /* The date and time pickers draw their own controls; without this they
           come out as dark glyphs on a dark field and look broken. */
        input[type="date"], input[type="time"] { color-scheme: dark; }
        .fine { color: rgba(255, 255, 255, 0.6); font-size: 12px; margin: 7px 0 0; line-height: 1.55; }
        .fine.ok { color: var(--purple-light); font-weight: 500; }
        .error {
          background: rgba(224, 102, 102, 0.16); color: #ffd9d5; border-radius: 12px;
          padding: 11px 14px; font-size: 13px; margin: 16px 0 0; line-height: 1.5;
        }
        .places {
          list-style: none; margin: 4px 0 0; padding: 4px;
          background: rgba(255, 255, 255, 0.07); border-radius: 12px;
        }
        .places button {
          display: block; width: 100%; text-align: left; font: inherit; font-size: 14px;
          padding: 9px 11px; border: 0; border-radius: 8px; background: transparent;
          cursor: pointer; color: #fff;
        }
        .places button:hover { background: rgba(255, 255, 255, 0.12); }
        /* Two fields to a row wherever there is room for two, one where there
           is not. A phone falls back to stacked on its own. */
        .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; }
        .pair > div:only-child { grid-column: 1 / -1; }
        @media (max-width: 520px) { .pair { grid-template-columns: 1fr; gap: 0; } }
        /* Inside a pair the first label must not push its row down, or the two
           columns start at different heights. */
        .pair label { margin-top: 16px; }
        /* The note lives inside a column now, so it must not crowd the label of
           the row beneath it. */
        .pair .fine { margin-bottom: 0; }
        .chips { display: flex; flex-wrap: wrap; gap: 7px; }
        .chip {
          font: inherit; font-size: 12.5px; padding: 8px 15px; border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.3); background: transparent;
          color: rgba(255, 255, 255, 0.8); cursor: pointer;
        }
        .chip:hover { border-color: #fff; color: #fff; }
        .chip.on { background: #fff; border-color: #fff; color: var(--ink); font-weight: 600; }
        .note {
          background: rgba(255, 255, 255, 0.08); border-radius: 14px;
          padding: 16px 18px; margin-top: 20px; font-size: 13px; line-height: 1.65;
          color: rgba(255, 255, 255, 0.86);
        }
        .note p { margin: 0 0 11px; }
        .note p:last-child { margin-bottom: 0; }
        .note strong { color: #fff; }
        .note a { color: var(--gold); font-weight: 600; }
        .go {
          display: block; width: 100%; margin-top: 26px; font: inherit; font-weight: 600;
          font-size: 15px; letter-spacing: 0.02em; padding: 15px; border-radius: 999px; border: 0;
          background: #fff; color: var(--ink); cursor: pointer; text-align: center;
          text-decoration: none;
        }
        /* Gold is the action colour across Delphi: it is what the Reset button
           on her dashboard wears. The pale throat yellow means "defined" on a
           chart, which is a state rather than an invitation. */
        .go:hover { background: var(--gold); color: var(--ink); }
        .go:disabled { opacity: 0.32; cursor: default; }
        .card.done h2 { font-weight: 300; font-size: 27px; color: #fff; margin: 0 0 12px; }
        .card.done p { color: rgba(255, 255, 255, 0.86); font-size: 14.5px; line-height: 1.65; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>
    </main>
  );
}
