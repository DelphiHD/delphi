/**
 * The workshop worksheet: a printable page for reading a chart by hand, in Delphi's
 * look. Kaycee, 2026-09-14, from a classic Human Design worksheet: a blank
 * bodygraph, Design and Personality columns, Type, Authority, Definition and
 * Profile, and every channel to tick.
 *
 * The bodygraph is the chart builder's own drawing, taken from a chart already in
 * the workshop folder and blanked with styles, so it is the same bodygraph people
 * see on their charts. Channel names and circuits come from her library.
 *
 * Run: npx tsx scripts/workshop-worksheet.ts            (writes into the demo folder)
 *      npx tsx scripts/workshop-worksheet.ts --event bfki
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadLibraryChunks } from "@/lib/hd/chunks-source";

const args = process.argv.slice(2);
const ev = args.includes("--event") ? args[args.indexOf("--event") + 1] : "";
const EDU = join(process.env.HOME ?? "", "Desktop", "Mandala Renderer Output", "Educational");
const OUT = join(EDU, ev ? `${ev.toUpperCase()} Workshop` : "Workshop (demo)");
const BRAND = join(process.cwd(), "assets", "brand");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The plain bodygraph canvas from a built chart page, nested svgs and all. */
function bodygraphFrom(html: string): string {
  const start = html.indexOf('<svg class="canvas plain"');
  if (start < 0) return "";
  let depth = 0, i = start;
  while (i < html.length) {
    const open = html.indexOf("<svg", i), close = html.indexOf("</svg>", i);
    if (close < 0) return "";
    if (open > -1 && open < close) { depth++; i = open + 4; }
    else { depth--; i = close + 6; if (depth === 0) return html.slice(start, i); }
  }
  return "";
}

async function main() {
  const chartDir = join(OUT, "charts");
  const any = existsSync(chartDir) ? readdirSync(chartDir).find((f) => f.endsWith(".html")) : undefined;
  if (!any) throw new Error(`no chart in ${chartDir} to take the bodygraph from; build the workshop folder first`);
  const body = bodygraphFrom(readFileSync(join(chartDir, any), "utf8"))
    .replace('class="canvas plain"', 'class="wsbody"');

  const chunks = await loadLibraryChunks();
  const byCircuit = new Map<string, { gates: string; name: string }[]>();
  for (const c of chunks.filter((x) => x.source_kind === "channel")) {
    const m = (c.metadata ?? {}) as Record<string, string>;
    const title = String(c.title ?? "").trim();
    const gates = (title.match(/(\d{1,2})\s*-\s*(\d{1,2})/) ?? []).slice(1, 3).map(Number).sort((a, b) => a - b).join("-");
    const bare = title.replace(/^\s*\d{1,2}\s*-\s*\d{1,2}\s*:?\s*/, "").replace(/^The Channel of\s+/i, "").replace(/"/g, "").trim();
    const name = bare.charAt(0).toUpperCase() + bare.slice(1);
    const circuit = String(m.Circuit ?? "").trim() || "Other";
    if (!byCircuit.has(circuit)) byCircuit.set(circuit, []);
    byCircuit.get(circuit)!.push({ gates, name });
  }
  const ORDER = ["Individual: Knowing", "Individual: Centering", "Collective: Understanding (Logic)",
    "Collective: Sensing (Abstract)", "Tribal: Ego", "Tribal: Defense", "Integration"];
  const circuits = [...byCircuit.keys()].sort((a, b) => (ORDER.indexOf(a) + 99) % 99 - (ORDER.indexOf(b) + 99) % 99);

  const logo = existsSync(join(BRAND, "Delphi Logo.svg"))
    ? `data:image/svg+xml;base64,${readFileSync(join(BRAND, "Delphi Logo.svg")).toString("base64")}` : "";
  const PLANETS: [string, string][] = [["Sun", "☉"], ["Earth", "⊕"], ["North Node", "☊"], ["South Node", "☋"], ["Moon", "☽"],
    ["Mercury", "☿"], ["Venus", "♀"], ["Mars", "♂"], ["Jupiter", "♃"], ["Saturn", "♄"], ["Uranus", "♅"], ["Neptune", "♆"], ["Pluto", "♇"]];
  const box = (label: string) => `<label><span class="bx"></span>${esc(label)}</label>`;
  const col = (title: string, cls: string) => `<div class="pcol ${cls}"><div class="ph">${title}</div>` +
    PLANETS.map(([n, g]) => `<div class="pr"><span class="pg" title="${n}">${g}</span><span class="blank"></span></div>`).join("") + `</div>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Delphi Human Design · Chart Worksheet</title>
<style>
@page { size: letter portrait; margin: 0.4in; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #1c1a2e; font-family: Montserrat, 'Helvetica Neue', Arial, sans-serif; }
.sheet { width: 7.7in; height: 10.2in; margin: 0 auto; display: grid; grid-template-rows: auto auto 1fr auto; gap: 0.12in; }
.top { display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid #845095; padding-bottom: 6px; }
.top img { height: 34px; }
.top .t { font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: #845095; }
.who { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 14px; font-size: 10px; }
.who div { border-bottom: 1px solid #b9a6c8; padding: 12px 0 2px; color: #6b6478; text-transform: uppercase; letter-spacing: .1em; }
.mid { display: grid; grid-template-columns: 0.95in 1fr 0.95in; gap: 0.1in; min-height: 0; }
.pcol { border: 1px solid #d9cfe0; border-radius: 8px; padding: 6px; }
.ph { font-size: 9px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; text-align: center; margin-bottom: 4px; }
.design .ph, .design .pg { color: #e06666; }
.pr { display: flex; align-items: center; gap: 5px; height: 0.37in; }
.pg { width: 16px; text-align: center; font-size: 14px; color: #1c1a2e; }
.blank { flex: 1; border-bottom: 1px solid #b9a6c8; height: 16px; }
.bg { display: flex; align-items: center; justify-content: center; min-height: 0; }
.wsbody { width: 100%; height: 100%; max-height: 5.7in; }
/* the chart builder's bodygraph, blanked: outlines, gate numbers and centers only */
.wsbody .ptable, .wsbody .halos, .wsbody .varrows, .wsbody .bridges, .wsbody .flows .beam, .wsbody .arrow,
.wsbody .gdisc, .wsbody .hl-ring, .wsbody .hl-fill, .wsbody > text, .wsbody .labels { display: none !important; }
.wsbody .pleg { fill: none !important; }
.wsbody .pnum { fill: #1c1a2e !important; }
.wsbody .cshape { fill: #ffffff !important; stroke: #1c1a2e !important; }
.low { display: grid; grid-template-columns: 1.15fr 1fr; gap: 0.14in; font-size: 9.5px; }
.card { border: 1px solid #d9cfe0; border-radius: 8px; padding: 6px 8px; }
.k { font-size: 8.5px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #845095; margin: 2px 0 4px; }
.opts { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 8px; margin-bottom: 5px; }
label { display: flex; align-items: center; gap: 5px; line-height: 1.55; }
.bx { width: 9px; height: 9px; border: 1px solid #1c1a2e; border-radius: 2px; display: inline-block; flex: none; }
.line { display: flex; gap: 6px; align-items: flex-end; margin: 5px 0; }
.line span:first-child { color: #6b6478; text-transform: uppercase; letter-spacing: .08em; font-size: 8.5px; white-space: nowrap; }
.line span.blank { height: 12px; }
.chans { columns: 2; column-gap: 12px; }
.circ { break-inside: avoid; margin-bottom: 4px; }
.circ .k { margin: 0 0 1px; }
.circ label { line-height: 1.4; }
.circ .g { color: #6b6478; min-width: 34px; display: inline-block; }
.foot { text-align: center; font-size: 8px; letter-spacing: .3em; text-transform: uppercase; color: #9a93a8; }
@media screen { body { background: #f3eff5; padding: 20px 0; } .sheet { background: #fff; padding: 0.4in; width: 8.5in; height: 11in; box-shadow: 0 10px 30px rgba(60,40,80,.15); } }
</style></head><body>
<div class="sheet">
  <div class="top">${logo ? `<img src="${logo}" alt="Delphi Human Design">` : "<b>Delphi Human Design</b>"}<span class="t">Chart Worksheet</span></div>
  <div class="who"><div>Name</div><div>Type</div><div>Profile</div></div>
  <div class="mid">
    ${col("Design", "design")}
    <div class="bg">${body}</div>
    ${col("Personality", "personality")}
  </div>
  <div class="low">
    <div class="card">
      <div class="k">Type</div>
      <div class="opts">${["Manifestor", "Generator", "Manifesting Generator", "Projector", "Reflector"].map(box).join("")}</div>
      <div class="k">Authority</div>
      <div class="opts">${["Emotional", "Sacral", "Splenic", "Ego Manifested", "Ego Projected", "Self Projected", "Environment", "Lunar"].map(box).join("")}</div>
      <div class="k">Definition</div>
      <div class="opts">${["No Definition", "Single", "Simple Split", "Wide Split", "Triple Split", "Quadruple Split"].map(box).join("")}</div>
      <div class="line"><span>Strategy</span><span class="blank"></span></div>
      <div class="line"><span>Signature / Not-Self</span><span class="blank"></span></div>
      <div class="line"><span>Incarnation Cross</span><span class="blank"></span></div>
    </div>
    <div class="card">
      <div class="k">Channels</div>
      <div class="chans">${circuits.map((c) => `<div class="circ"><div class="k">${esc(c)}</div>` +
        byCircuit.get(c)!.sort((a, b) => a.gates.localeCompare(b.gates, undefined, { numeric: true }))
          .map((ch) => `<label><span class="bx"></span><span class="g">${ch.gates}</span>${esc(ch.name)}</label>`).join("") + `</div>`).join("")}</div>
    </div>
  </div>
  <div class="foot">Know Thyself</div>
</div>
</body></html>`;
  const file = join(OUT, "Worksheet.html");
  writeFileSync(file, html);
  console.log(`✓ ${file}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
