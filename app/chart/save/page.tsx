/**
 * Saving one moment of a birth day as a chart of its own.
 *
 * Opened in its own window from the Variations panel. It asks one question,
 * because only one thing needs deciding: what to call it. Everything else
 * comes from the chart it was opened from. On Save the new chart opens here,
 * which is why this is a window rather than a box inside the panel.
 *
 * Kaycee, 2026-10-08: "could we use that as a default but allow the option for
 * it to be changed... when they click Save the new chart opens in the new
 * window."
 */

"use client";

import { useEffect, useState } from "react";

export default function SaveVariation() {
  const [name, setName] = useState("");
  const [born, setBorn] = useState("");
  const [place, setPlace] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("Reading that chart…");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const query = typeof window === "undefined" ? "" : window.location.search;

  useEffect(() => {
    fetch(`/api/variation-save${query}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j || !j.ok) {
          setNote(j && j.error === "sign in first"
            ? "Sign in to save this chart."
            : (j && j.error) || "That could not be read.");
          return;
        }
        setName(j.name);
        setBorn(j.born);
        setPlace(j.place);
        setTime(j.time);
        setNote("");
        setReady(true);
      })
      .catch(() => setNote("That could not be read."));
  }, [query]);

  const save = () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setNote("Drawing the chart…");
    fetch(`/api/variation-save${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!j || !j.ok) {
          setSaving(false);
          setNote((j && j.error) || "That chart could not be saved.");
          return;
        }
        // the new chart opens here, in the window this was started from
        window.location.href = j.url;
      })
      .catch(() => {
        setSaving(false);
        setNote("That chart could not be saved.");
      });
  };

  return (
    <main style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#f7f3f8", color: "#1c1a2e", padding: 24,
      fontFamily: "Montserrat, 'Helvetica Neue', Arial, sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 420, background: "#fff", borderRadius: 18,
        padding: "26px 26px 22px", boxShadow: "0 18px 50px rgba(60,40,80,.14)",
      }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 19, fontWeight: 600, color: "#845095" }}>
          Save this Variation
        </h1>
        {ready && (
          <p style={{ margin: "0 0 18px", fontSize: 12.5, lineHeight: 1.6, opacity: 0.7 }}>
            {born} at {time}, {place}
          </p>
        )}
        {ready && (
          <>
            <label htmlFor="vname" style={{
              display: "block", fontSize: 9.5, letterSpacing: ".18em", fontWeight: 600,
              textTransform: "uppercase", opacity: 0.62, marginBottom: 6,
            }}>Chart Name</label>
            <input
              id="vname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              style={{
                width: "100%", boxSizing: "border-box", font: "inherit", fontSize: 13,
                padding: "9px 11px", borderRadius: 9, border: "1px solid rgba(132,80,149,.28)",
                background: "#fff", color: "inherit", marginBottom: 14,
              }}
            />
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              style={{
                width: "100%", font: "inherit", fontSize: 13, padding: "10px 12px",
                borderRadius: 10, border: 0, cursor: saving ? "default" : "pointer",
                background: "#c9a227", color: "#fff", opacity: saving ? 0.7 : 1,
              }}
            >Save</button>
          </>
        )}
        {note && (
          <p style={{ margin: "14px 0 0", fontSize: 12.5, lineHeight: 1.6, opacity: 0.78 }}>
            {note === "Sign in to save this chart."
              ? <>Sign in to save this chart. <a href="/portal" style={{ color: "#845095" }}>Sign in</a></>
              : note}
          </p>
        )}
      </div>
    </main>
  );
}
