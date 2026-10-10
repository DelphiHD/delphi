/**
 * A first look at astro-cartography, as a standalone page on the Desktop.
 *
 * Not wired into the chart. Personality and design maps from one chart, the
 * thirteen bodies with toggles, parans, and two coastline detail levels side
 * by side so Kaycee can choose. See docs/ASTROCARTOGRAPHY_PLAN.md.
 *
 *   npx tsx scripts/astrocartography-preview.ts "Kaycee Vandenberg" .cache/world-atlas
 *
 * <geo-dir> holds land-110m.json and land-50m.json from world-atlas@2.0.2.
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { getChart } from "../lib/mybodygraph";
import { locate } from "../lib/astro";
import { mapFor, paransFor, HD_BODIES } from "../lib/astrocartography";
import { GLYPH } from "./astro-wheel";

const [, , personName, geoDir] = process.argv;
if (!personName || !geoDir) throw new Error("usage: astrocartography-preview.ts <person> <geo-dir>");

// The map shows latitudes TOP down to BOTTOM; the far south is open ocean.
const TOP = 80, BOTTOM = -60, W = 1440;
const H = (W / 360) * (TOP - BOTTOM);
const x = (lon: number) => ((lon + 180) / 360) * W;
const y = (lat: number) => ((TOP - lat) / (TOP - BOTTOM)) * H;
const f = (n: number) => n.toFixed(1);

/** TopoJSON land to one SVG path, stitched from its delta-encoded arcs. */
function landPath(file: string): string {
  const topo = JSON.parse(readFileSync(file, "utf8"));
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  const arcs: [number, number][][] = topo.arcs.map((arc: number[][]) => {
    let ax = 0, ay = 0;
    return arc.map(([dx, dy]) => { ax += dx; ay += dy; return [ax * sx + tx, ay * sy + ty] as [number, number]; });
  });
  const ring = (ids: number[]) => {
    const pts: [number, number][] = [];
    for (const id of ids) {
      const a = id < 0 ? [...arcs[~id]].reverse() : arcs[id];
      pts.push(...(pts.length ? a.slice(1) : a));
    }
    // Land that straddles the 180 meridian (Fiji, Chukotka) would otherwise
    // be drawn the long way round the map. Unwrap it into one continuous
    // shape and draw it again a world over; the frame clips both copies.
    for (let i = 1; i < pts.length; i++) {
      const d = pts[i][0] - pts[i - 1][0];
      if (d > 180) pts[i] = [pts[i][0] - 360, pts[i][1]];
      else if (d < -180) pts[i] = [pts[i][0] + 360, pts[i][1]];
    }
    const draw = (shift: number) =>
      "M" + pts.map(([lon, lat]) => `${f(x(lon + shift))},${f(y(lat))}`).join("L") + "Z";
    const lons = pts.map((p) => p[0]);
    if (Math.max(...lons) > 180) return draw(0) + draw(-360);
    if (Math.min(...lons) < -180) return draw(0) + draw(360);
    return draw(0);
  };
  const out: string[] = [];
  for (const g of topo.objects.land.geometries) {
    const polys = g.type === "Polygon" ? [g.arcs] : g.arcs;
    for (const poly of polys) for (const r of poly) out.push(ring(r));
  }
  return out.join("");
}

function linePath(runs: [number, number][][]): string {
  return runs.map((run) => "M" + run.map(([lon, lat]) => `${f(x(lon))},${f(y(lat))}`).join("L")).join("");
}

(async () => {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await s.from("charts")
    .select("person_name, birth_date, birth_time, birth_place, birth_timezone, time_accuracy")
    .eq("person_name", personName).limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error(`no chart for ${personName}`);

  const chart = await getChart({
    birthDate: String(row.birth_date),
    birthTime: String(row.birth_time).slice(0, 5),
    timezone: String(row.birth_timezone),
  });
  const place = await locate(String(row.birth_place));
  const sides = {
    personality: new Date(chart.birth.utcDate),
    design: new Date(chart.birth.designUtcDate),
  };

  // Every mark carries person, side, body and angle on the element itself.
  const lines: string[] = [];
  const parans: string[] = [];
  for (const [side, when] of Object.entries(sides)) {
    for (const b of mapFor(when)) {
      for (const [angle, runs] of Object.entries(b.lines)) {
        lines.push(`<path class="ln ${side} ${angle}" data-person="${personName}" data-side="${side}" ` +
          `data-body="${b.body}" data-angle="${angle}" d="${linePath(runs)}"/>`);
        // MC and IC are named at the top; the horizon curves where they leave the map.
        const ends = runs.flat().filter(([, lat]) => lat <= TOP - 4 && lat >= BOTTOM + 2);
        const tip = angle === "MC" || angle === "IC"
          ? [runs[0][0][0], TOP - 4]
          : ends.reduce((a, p) => (p[1] > a[1] ? p : a), ends[0] ?? [0, 0]);
        if (ends.length || angle === "MC" || angle === "IC") {
          lines.push(`<text class="lbl ${side}" data-person="${personName}" data-side="${side}" ` +
            `data-body="${b.body}" data-angle="${angle}" x="${f(x(tip[0]))}" y="${f(y(tip[1]) - 4)}">` +
            `${GLYPH[b.body] ?? (b.body === "North Node" ? "☊" : "☋")}<tspan>${angle}</tspan></text>`);
        }
      }
    }
    for (const p of paransFor(when)) {
      if (p.lat > TOP || p.lat < BOTTOM) continue;
      parans.push(`<g class="pr ${side}" data-person="${personName}" data-side="${side}" data-body="${p.a}" ` +
        `data-angle="${p.angleA}" data-body2="${p.b}" data-angle2="${p.angleB}" data-lat="${p.lat.toFixed(2)}">` +
        `<line x1="0" x2="${W}" y1="${f(y(p.lat))}" y2="${f(y(p.lat))}"/>` +
        `<circle cx="${f(x(p.lon))}" cy="${f(y(p.lat))}" r="3.5"/></g>`);
    }
  }

  const graticule: string[] = [];
  for (let lon = -150; lon <= 150; lon += 30) graticule.push(`M${f(x(lon))},0V${f(H)}`);
  for (let lat = -60; lat <= 60; lat += 30) graticule.push(`M0,${f(y(lat))}H${W}`);

  const chips = HD_BODIES.map((b) =>
    `<button class="chip on" data-chip="${b}" title="${b}">` +
    `<span>${GLYPH[b] ?? (b === "North Node" ? "☊" : "☋")}</span>${b}</button>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${personName} Astrocartography</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--ink:#2f2a33;--design:#e06666;--purple:#845095;--land:#efe8f3;--sea:#ffffff;--grid:#ece7ef;--muted:#6b6790}
body{margin:0;font-family:'Montserrat',-apple-system,sans-serif;color:var(--ink);background:#faf8fb}
header{padding:20px 24px 8px}
h1{margin:0;font-weight:600;font-size:22px;color:var(--purple)}
.sub{color:var(--muted);font-size:13px;margin-top:4px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 24px}
.grp{display:flex;gap:4px;margin-right:16px}
.pill,.chip{font:inherit;font-size:12px;border:1px solid #d9d0e0;background:#fff;color:var(--ink);border-radius:999px;padding:5px 11px;cursor:pointer}
.pill.on{background:var(--purple);border-color:var(--purple);color:#fff}
.chip{opacity:.4}.chip.on{opacity:1}.chip.focus{outline:2px solid var(--purple)}
.chip span{font-size:15px;margin-right:4px}
.stage{padding:8px 24px 24px;position:relative}
svg{width:100%;height:auto;background:var(--sea);border:1px solid #e4dce9;border-radius:8px;display:block}
.land{fill:var(--land);stroke:#cbbcd6;stroke-width:.6}
.grat{stroke:var(--grid);stroke-width:1;fill:none}
.ln{fill:none;stroke-width:1.6}.ln.IC,.ln.DSC{stroke-dasharray:6 4}
.ln.personality{stroke:var(--ink)}.ln.design{stroke:var(--design)}
.ln.hot{stroke-width:4}
.lbl{font-size:13px;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:3px;cursor:default}
.lbl tspan{font-size:8px;font-weight:600;dx:1}
.lbl.personality{fill:var(--ink)}.lbl.design{fill:var(--design)}
.pr line{stroke-width:.8;stroke-dasharray:2 3}.pr circle{stroke:#fff;stroke-width:1}
.pr.personality line{stroke:var(--ink)}.pr.personality circle{fill:var(--ink)}
.pr.design line{stroke:var(--design)}.pr.design circle{fill:var(--design)}
.pr.hot line{stroke-width:2.5;stroke-dasharray:none}
.birth{fill:var(--purple);stroke:#fff;stroke-width:2}
.off{display:none}
#tip{position:fixed;pointer-events:none;background:#fff;border:1px solid #d9d0e0;border-radius:8px;padding:8px 10px;font-size:12px;box-shadow:0 4px 14px rgba(47,42,51,.12);display:none;max-width:280px}
#tip b{color:var(--purple)}
.key{color:var(--muted);font-size:12px;padding:0 24px}
</style></head><body>
<header><h1>${personName}</h1>
<div class="sub">${row.birth_place} · ${row.birth_date} ${String(row.birth_time).slice(0, 5)} · design ${sides.design.toISOString().slice(0, 16).replace("T", " ")} UTC</div></header>
<div class="bar">
 <div class="grp" id="side"><button class="pill on" data-v="both">Both</button><button class="pill" data-v="personality">Personality</button><button class="pill" data-v="design">Design</button></div>
 <div class="grp" id="detail"><button class="pill on" data-v="simple">Simple Map</button><button class="pill" data-v="detailed">Detailed Map</button></div>
 <div class="grp" id="paran"><button class="pill on" data-v="focus">Parans For Selected</button><button class="pill" data-v="all">All Parans</button><button class="pill" data-v="none">No Parans</button></div>
</div>
<div class="bar" id="chips">${chips}<button class="pill" id="allOn">All On</button><button class="pill" id="allOff">All Off</button></div>
<div class="stage"><svg viewBox="0 0 ${W} ${f(H)}" id="map">
<path class="grat" d="${graticule.join("")}"/>
<path class="land" id="simple" d="${landPath(join(geoDir, "land-110m.json"))}"/>
<path class="land off" id="detailed" d="${landPath(join(geoDir, "land-50m.json"))}"/>
<g id="parans">${parans.join("")}</g>
<g id="lines">${lines.join("")}</g>
<circle class="birth" cx="${f(x(place.lon))}" cy="${f(y(place.lat))}" r="5"><title>${row.birth_place}</title></circle>
</svg></div>
<div class="key">Solid: MC and ASC. Dashed: IC and DSC. Click a planet to focus it and see its parans.</div>
<div id="tip"></div>
<script>
const ANGLE={MC:"Midheaven line",IC:"IC line",ASC:"Rising line",DSC:"Setting line"};
const SIDE={personality:"Personality",design:"Design"};
const st={side:"both",paran:"focus",bodies:new Set(${JSON.stringify(HD_BODIES)}),focus:null};
// One resolver answers "what is this?", read from the element, never its position.
function describe(el){
  const d=el.dataset, who=d.person+", "+SIDE[d.side];
  if(d.body2) return "<b>"+who+" paran</b><br>"+d.body+" "+ANGLE[d.angle]+" with "+d.body2+" "+ANGLE[d.angle2]+"<br>Latitude "+(+d.lat).toFixed(1)+"°";
  return "<b>"+who+"</b><br>"+d.body+" "+ANGLE[d.angle];
}
function paint(){
  for(const el of document.querySelectorAll("[data-side]")){
    const sideOk=st.side==="both"||el.dataset.side===st.side;
    let on=sideOk&&st.bodies.has(el.dataset.body);
    if(el.dataset.body2){
      on=on&&st.bodies.has(el.dataset.body2)&&(st.paran==="all"||(st.paran==="focus"&&st.focus&&(el.dataset.body===st.focus||el.dataset.body2===st.focus)));
    }
    el.classList.toggle("off",!on);
    el.classList.toggle("hot",!!st.focus&&!el.dataset.body2&&el.dataset.body===st.focus);
  }
  for(const c of document.querySelectorAll(".chip")){c.classList.toggle("on",st.bodies.has(c.dataset.chip));c.classList.toggle("focus",c.dataset.chip===st.focus)}
}
function pills(id,fn){const g=document.getElementById(id);g.onclick=e=>{const b=e.target.closest(".pill");if(!b)return;g.querySelectorAll(".pill").forEach(p=>p.classList.toggle("on",p===b));fn(b.dataset.v);paint()}}
pills("side",v=>st.side=v);
pills("paran",v=>st.paran=v);
pills("detail",v=>{document.getElementById("simple").classList.toggle("off",v!=="simple");document.getElementById("detailed").classList.toggle("off",v!=="detailed")});
document.getElementById("chips").onclick=e=>{
  if(e.target.id==="allOn"){st.bodies=new Set(${JSON.stringify(HD_BODIES)});return paint()}
  if(e.target.id==="allOff"){st.bodies.clear();st.focus=null;return paint()}
  const c=e.target.closest(".chip");if(!c)return;const b=c.dataset.chip;
  if(st.focus===b){st.focus=null;st.bodies.delete(b)}
  else if(!st.bodies.has(b)){st.bodies.add(b)}
  else st.focus=b;
  paint();
};
const tip=document.getElementById("tip");
document.getElementById("map").addEventListener("mousemove",e=>{
  const el=e.target.closest("[data-side]");
  for(const h of document.querySelectorAll(".pr.hot"))h.classList.remove("hot");
  if(!el){tip.style.display="none";return}
  if(el.dataset.body2)el.classList.add("hot");
  tip.innerHTML=describe(el);tip.style.display="block";
  tip.style.left=Math.min(e.clientX+14,innerWidth-300)+"px";tip.style.top=(e.clientY+14)+"px";
});
document.getElementById("map").addEventListener("mouseleave",()=>tip.style.display="none");
paint();
</script></body></html>`;

  const dir = join(homedir(), "Desktop", "HD Reports", "Astrocartography");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${personName}.html`);
  writeFileSync(out, html);
  console.log(out, (html.length / 1024).toFixed(0) + " KB");
})();
