/**
 * A first look at astro-cartography, as a standalone page on the Desktop.
 *
 * Not wired into the chart. Personality and design maps from one chart, the
 * thirteen bodies, and parans. See docs/ASTROCARTOGRAPHY_PLAN.md.
 *
 *   npx tsx scripts/astrocartography-preview.ts "Kaycee Vandenberg" .cache/world-atlas
 *
 * The geo directory holds land-50m.json from world-atlas@2.0.2. Kaycee chose
 * the detailed coastline over land-110m on 10 October.
 *
 * Lines and parans are switched separately: Kaycee, 10 October, turning off a
 * planet's parans had also taken its lines off the map, which she did not
 * expect. Line glyphs sit outside the frame, where each line leaves it.
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { getChart } from "../lib/mybodygraph";
import { locate, getAstro } from "../lib/astro";
import { ZODIAC } from "../lib/astro-extras";
import { mapFor, paransFor, HD_BODIES, type LonLat } from "../lib/astrocartography";
import { GLYPH } from "./astro-wheel";

const [, , personName, geoDir] = process.argv;
if (!personName || !geoDir) throw new Error("usage: astrocartography-preview.ts <person> <geo-dir>");

// The map shows latitudes TOP down to BOTTOM; the far south is open ocean.
const TOP = 80, BOTTOM = -70, W = 1440;
const H = (W / 360) * (TOP - BOTTOM);
// Room outside the frame for the glyphs.
const ML = 64, MR = 64, MT = 46, MB = 46;
const x = (lon: number) => ((lon + 180) / 360) * W;
const y = (lat: number) => ((TOP - lat) / (TOP - BOTTOM)) * H;
const f = (n: number) => n.toFixed(1);
const glyph = (b: string) => GLYPH[b] ?? (b === "North Node" ? "☊" : "☋");

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

function linePath(runs: LonLat[][]): string {
  return runs.map((run) => "M" + run.map(([lon, lat]) => `${f(x(lon))},${f(y(lat))}`).join("L")).join("");
}

type Edge = "top" | "bottom" | "left" | "right";
interface Anchor { edge: Edge; pos: number }

/**
 * Where a horizon curve leaves the frame, so its glyph can sit just outside.
 * Side and bottom exits are all labelled; a top exit only when the curve has
 * no other, because the top row belongs to the meridians.
 */
function exits(runs: LonLat[][]): Anchor[] {
  const out: Anchor[] = [];
  const top: Anchor[] = [];
  const inside = (lat: number) => lat <= TOP && lat >= BOTTOM;
  for (const run of runs) {
    for (const end of [run[0], run[run.length - 1]]) {
      if (inside(end[1]) && Math.abs(end[0]) > 178) {
        out.push({ edge: end[0] < 0 ? "left" : "right", pos: y(end[1]) });
      }
    }
    for (let i = 1; i < run.length; i++) {
      const [a, b] = [run[i - 1], run[i]];
      for (const [edgeLat, edge] of [[TOP, "top"], [BOTTOM, "bottom"]] as const) {
        // The edges fall exactly on sample latitudes, so a point ON the edge
        // counts as inside; a strict product test missed every one of them.
        if ((a[1] > edgeLat) === (b[1] > edgeLat) || a[1] === b[1]) continue;
        const t = (edgeLat - a[1]) / (b[1] - a[1]);
        (edge === "top" ? top : out).push({ edge, pos: x(a[0] + t * (b[0] - a[0])) });
      }
    }
    // A curve that ends inside the frame stops at the latitude where the body
    // no longer rises or sets. Named on the nearer side, at that height.
    const hi = run.reduce((m, p) => (p[1] > m[1] ? p : m), run[0]);
    if (inside(hi[1]) && hi[1] > 0 && Math.abs(hi[0]) <= 178) {
      top.push({ edge: hi[0] < 0 ? "left" : "right", pos: y(hi[1]) });
    }
  }
  return out.length ? out : top;
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

  // Where each body is in the zodiac, from the provider's astrology chart, the
  // same numbers the Astrology view's hovers read. Earth is the far end of the
  // Sun's axis; the provider's astrology endpoint does not name it.
  const deg = (v: number) => {
    let d = Math.floor(v), m = Math.round((v - d) * 60);
    if (m === 60) { d += 1; m = 0; }
    return `${d}\u00b0${m < 10 ? "0" : ""}${m}'`;
  };
  const where: Record<string, Record<string, string>> = {};
  for (const [side, astro] of [
    ["personality", await getAstro({ birthDate: String(row.birth_date), birthTime: String(row.birth_time).slice(0, 5), place: String(row.birth_place) })],
    ["design", await getAstro({ birthDate: String(row.birth_date), birthTime: String(row.birth_time).slice(0, 5), place: String(row.birth_place), atUtc: chart.birth.designUtcDate })],
  ] as const) {
    where[side] = {};
    for (const p of astro.planets) where[side][p.label] = `${p.sign} ${deg(p.position)}`;
    const sun = astro.planets.find((p) => p.label === "Sun");
    if (sun) {
      const e = (sun.abs_pos + 180) % 360;
      where[side].Earth = `${ZODIAC[Math.floor(e / 30)]} ${deg(e % 30)}`;
    }
    for (const b of HD_BODIES) if (!where[side][b]) throw new Error(`no ${side} position for ${b}`);
  }

  // Every mark carries person, side, body and angle on the element itself.
  const tag = (side: string, body: string, angle: string) =>
    `data-person="${personName}" data-side="${side}" data-body="${body}" data-angle="${angle}"`;
  const lines: string[] = [];
  const labels: { side: string; body: string; angle: string; edge: Edge; pos: number }[] = [];
  const parans: string[] = [];
  const PARAN_ORB = 1;   // degrees of latitude either side
  for (const [side, when] of Object.entries(sides)) {
    for (const b of mapFor(when)) {
      for (const [angle, runs] of Object.entries(b.lines)) {
        lines.push(`<path class="ln ${side} ${angle}" ${tag(side, b.body, angle)} d="${linePath(runs)}"/>`);
        const anchors = angle === "MC" || angle === "IC"
          ? [{ edge: "top" as Edge, pos: x(runs[0][0][0]) }]
          : exits(runs);
        for (const a of anchors) labels.push({ side, body: b.body, angle, ...a });
      }
    }
    for (const p of paransFor(when)) {
      if (p.lat > TOP || p.lat < BOTTOM) continue;
      parans.push(`<g class="pr ${side}" ${tag(side, p.a, p.angleA)} data-body2="${p.b}" ` +
        `data-angle2="${p.angleB}" data-lat="${p.lat.toFixed(2)}">` +
        `<rect x="0" width="${W}" y="${f(y(p.lat + PARAN_ORB))}" height="${f(y(p.lat - PARAN_ORB) - y(p.lat + PARAN_ORB))}"/>` +
        `<circle cx="${f(x(p.lon))}" cy="${f(y(p.lat))}" r="3.5"/></g>`);
    }
  }

  const graticule: string[] = [];
  for (let lon = -150; lon <= 150; lon += 30) graticule.push(`M${f(x(lon))},0V${f(H)}`);
  for (let lat = -60; lat <= 60; lat += 30) graticule.push(`M0,${f(y(lat))}H${W}`);

  // Lines and parans each get their own menu, so switching one never moves
  // the other. Angles narrow the lines: Kaycee, 10 October, "so a person
  // could see only their ascendant lines".
  type Item = { key: string; icon: string; name: string };
  const planetItems: Item[] = HD_BODIES.map((b) => ({ key: b, icon: glyph(b), name: b }));
  // Each angle is shown in its own line style, so the menu is the key too.
  const swatch = (a: string) =>
    `<svg width="26" height="8"><line class="ln personality ${a}" x1="2" x2="24" y1="4" y2="4"/></svg>`;
  const angleItems: Item[] = [
    { key: "ASC", icon: swatch("ASC"), name: "Ascendant" },
    { key: "DSC", icon: swatch("DSC"), name: "Descendant" },
    { key: "MC", icon: swatch("MC"), name: "Midheaven" },
    { key: "IC", icon: swatch("IC"), name: "IC" },
  ];
  const dropdown = (kind: string, title: string, items: Item[]) =>
    `<div class="dd" data-dd="${kind}"><button>${title}<span class="n"></span></button><div class="menu">` +
    items.map((i) => `<div class="opt" data-kind="${kind}" data-chip="${i.key}"><span class="radio"></span>` +
      `<span class="gl">${i.icon}</span>${i.name}</div>`).join("") +
    `<div class="foot"><button class="pill" data-all="${kind}">All</button><button class="pill" data-none="${kind}">None</button></div></div></div>`;

  const VW = ML + W + MR, VH = MT + H + MB;
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${personName} Astrocartography</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--gold:#c79a2e;--ink:#2f2a33;--design:#e06666;--purple:#845095;--land:#e3e1e6;--sea:#ffffff;--grid:#ece7ef;--muted:#6b6790}
body{margin:0;font-family:'Montserrat',-apple-system,sans-serif;color:var(--ink);background:#faf8fb}
header{padding:20px 24px 8px}
h1{margin:0;font-weight:600;font-size:22px;color:var(--purple)}
.sub{color:var(--muted);font-size:13px;margin-top:4px}
.bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 24px}
.head{font-size:12px;font-weight:600;color:var(--purple);width:56px}
.pill{font:inherit;font-size:12px;border:1px solid #d9d0e0;background:#fff;color:var(--ink);border-radius:999px;padding:5px 11px;cursor:pointer}
.pill.on{background:var(--purple);border-color:var(--purple);color:#fff}
.gap{width:10px}
.stage{padding:8px 24px 24px}
svg{width:100%;height:auto;display:block}
.frame{fill:var(--sea);stroke:#8d8396;stroke-width:1.5}
.land{fill:var(--land);stroke:#c3bfc8;stroke-width:.6}
.grat{stroke:var(--grid);stroke-width:1;fill:none}
.ln{fill:none;stroke-width:1.7;stroke-linecap:round}
.ln.MC{stroke-dasharray:14 4 2 4}
.ln.IC{stroke-dasharray:0.1 4.5;stroke-width:2.6}
.ln.DSC{stroke-dasharray:8 5}
.ln.personality{stroke:var(--ink)}.ln.design{stroke:var(--design)}
.ln.hot{stroke:var(--gold);stroke-width:4}.ln.IC.hot{stroke-width:5}
.lbl{cursor:default}
.lbl .g{font-size:15px}.lbl .a{font-size:8px;font-weight:600;letter-spacing:.3px}
.lbl.personality{fill:var(--ink)}.lbl.design{fill:var(--design)}
.lbl.hot{fill:var(--gold)}.lbl.hot .g{font-size:19px}
.lead{stroke-width:.7;fill:none}.lead.personality{stroke:var(--ink)}.lead.design{stroke:var(--design)}
.pr rect{opacity:.2}.pr circle{stroke:#fff;stroke-width:1}
.pr.personality rect,.pr.personality circle{fill:var(--purple)}
.pr.design rect,.pr.design circle{fill:var(--design)}
.pr.hot rect{fill:var(--gold);opacity:.4}.pr.hot circle{fill:var(--gold);r:7;stroke-width:2}
.birth{fill:var(--purple);stroke:#fff;stroke-width:2}
.off{display:none}
#tip{position:fixed;pointer-events:none;background:#fff;border:1px solid #d9d0e0;border-radius:8px;padding:8px 10px;font-size:12px;box-shadow:0 4px 14px rgba(47,42,51,.12);display:none;max-width:280px}
#tip b{color:var(--ink)}
#tip .pill{display:inline-block;padding:2.5px 8px;border-radius:999px;font-size:9px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin:5px 5px 1px 0;line-height:1.5;background:var(--purple);color:#fff}
#tip .row{margin-top:4px}#tip .meta{opacity:.65;display:block;margin-top:4px}
.dd{position:relative}
.dd>button{font:inherit;font-size:12px;font-weight:600;border:1px solid #d9d0e0;background:#fff;color:var(--ink);border-radius:999px;padding:6px 14px;cursor:pointer}
.dd>button .n{color:var(--muted);font-weight:400;margin-left:4px}
.dd>button::after{content:"▾";margin-left:6px;color:var(--muted)}
.menu{display:none;position:absolute;z-index:5;top:34px;left:0;background:#fff;border:1px solid #d9d0e0;border-radius:10px;box-shadow:0 8px 24px rgba(47,42,51,.14);padding:8px;min-width:210px}
.dd.open .menu{display:block}
.opt{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:13px;user-select:none}
.opt:hover{background:#f6f0f9}
.radio{width:14px;height:14px;border-radius:50%;border:1.5px solid #b7aec0;box-sizing:border-box;flex:none}
.opt.on .radio{border:4px solid var(--purple)}
.opt .gl{min-width:18px;text-align:center;font-size:15px;display:flex;justify-content:center}
.menu .foot{display:flex;gap:6px;border-top:1px solid #eee7f1;margin-top:6px;padding-top:8px}
</style></head><body>
<header><h1>${personName}</h1>
<div class="sub">${row.birth_place} · ${row.birth_date} ${String(row.birth_time).slice(0, 5)} · design ${sides.design.toISOString().slice(0, 16).replace("T", " ")} UTC</div></header>
<div class="bar"><span id="side" style="display:flex;gap:4px"><button class="pill on" data-v="both">Both</button><button class="pill" data-v="personality">Personality</button><button class="pill" data-v="design">Design</button></span>
<span class="gap"></span>${dropdown("lines", "Lines", planetItems)}${dropdown("angles", "Angles", angleItems)}${dropdown("parans", "Parans", planetItems)}</div>
<div class="stage"><svg viewBox="0 0 ${VW} ${f(VH)}" id="map">
<defs><clipPath id="clip"><rect width="${W}" height="${f(H)}"/></clipPath></defs>
<g transform="translate(${ML},${MT})">
<rect class="frame" width="${W}" height="${f(H)}"/>
<g clip-path="url(#clip)">
<path class="grat" d="${graticule.join("")}"/>
<path class="land" d="${landPath(join(geoDir, "land-50m.json"))}"/>
<g id="parans">${parans.join("")}</g>
<g id="lines">${lines.join("")}</g>
<circle class="birth" cx="${f(x(place.lon))}" cy="${f(y(place.lat))}" r="5"><title>${row.birth_place}</title></circle>
</g>
<rect width="${W}" height="${f(H)}" fill="none" stroke="#8d8396" stroke-width="1.5"/>
</g>
<g id="labels"></g>
</svg></div>
<div id="tip"></div>
<script>
const WHERE=${JSON.stringify(where)};
const pill=a=>'<span class="pill">'+a+'</span>';
const SIDE={personality:"Personality",design:"Design"};
const GLYPH=${JSON.stringify(Object.fromEntries(HD_BODIES.map((b) => [b, glyph(b)])))};
const LABELS=${JSON.stringify(labels.map((l) => ({ ...l, pos: +l.pos.toFixed(1) })))};
const PERSON=${JSON.stringify(personName)};
const ML=${ML},MT=${MT},W=${W},H=${f(H)};
const BODIES=${JSON.stringify(HD_BODIES)};
const ANGLES=["ASC","DSC","MC","IC"];
const ALL={lines:BODIES,parans:BODIES,angles:ANGLES};
// Earth starts off: Kaycee, 10 October. It is the Sun's lines turned round,
// and every one of them doubles a Sun line already on the map.
const st={side:"both",lines:new Set(BODIES.filter(b=>b!=="Earth")),angles:new Set(ANGLES),parans:new Set()};
// One resolver answers "what is this?", read from the element, never its position.
function describe(el){
  const d=el.dataset, side=SIDE[d.side];
  if(d.body2){const lat=+d.lat;
    return "<b>"+side+" Paran</b>"+
      '<div class="row">'+side+" "+d.body+" "+pill(d.angle)+"</div>"+
      '<div class="row">'+side+" "+d.body2+" "+pill(d.angle2)+"</div>"+
      '<span class="meta">Latitude '+Math.abs(lat).toFixed(1)+"°"+(lat>=0?"N":"S")+"</span>";}
  return "<b>"+side+" "+d.body+" in "+WHERE[d.side][d.body]+"</b><br>"+pill(d.angle);
}
const NS="http://www.w3.org/2000/svg";
const mk=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e};
/** Glyphs outside the frame, spread along each edge so none overlap. */
function layoutLabels(){
  const g=document.getElementById("labels");g.replaceChildren();
  const vis=LABELS.filter(l=>(st.side==="both"||l.side===st.side)&&st.lines.has(l.body)&&st.angles.has(l.angle));
  for(const edge of ["top","bottom","left","right"]){
    const row=vis.filter(l=>l.edge===edge).sort((a,b)=>a.pos-b.pos);
    const gap=edge==="top"||edge==="bottom"?22:16, max=edge==="top"||edge==="bottom"?W:H;
    const at=row.map(l=>l.pos);
    for(let i=1;i<at.length;i++)at[i]=Math.max(at[i],at[i-1]+gap);
    const over=at.length?at[at.length-1]-max:0;
    if(over>0)for(let i=at.length-1;i>=0;i--){at[i]=Math.min(at[i],(i===at.length-1?max:at[i+1]-gap))}
    row.forEach((l,i)=>{
      const p=at[i];
      const lab=mk("text",{class:"lbl "+l.side,"data-person":PERSON,"data-side":l.side,"data-body":l.body,"data-angle":l.angle});
      const gl=mk("tspan",{class:"g"});gl.textContent=GLYPH[l.body];
      const an=mk("tspan",{class:"a"});an.textContent=l.angle;
      let lead;
      if(edge==="top"){lab.setAttribute("text-anchor","middle");
        an.setAttribute("x",ML+p);an.setAttribute("y",11);gl.setAttribute("x",ML+p);gl.setAttribute("y",29);lab.append(an,gl);
        lead=mk("path",{d:"M"+(ML+p)+","+(MT-12)+"L"+(ML+l.pos)+","+MT});}
      else if(edge==="bottom"){lab.setAttribute("text-anchor","middle");
        gl.setAttribute("x",ML+p);gl.setAttribute("y",MT+H+27);an.setAttribute("x",ML+p);an.setAttribute("y",MT+H+39);lab.append(gl,an);
        lead=mk("path",{d:"M"+(ML+p)+","+(MT+H+12)+"L"+(ML+l.pos)+","+(MT+H)});}
      else{const left=edge==="left";lab.setAttribute("text-anchor",left?"end":"start");
        const xx=left?ML-10:ML+W+10;
        gl.setAttribute("x",xx);gl.setAttribute("y",MT+p+5);an.setAttribute("dx",left?-0:0);
        if(left){an.setAttribute("dx","0");lab.append(an,gl);an.setAttribute("x",xx-19);an.setAttribute("y",MT+p+4);}
        else{lab.append(gl,an);an.setAttribute("dx","3");}
        lead=mk("path",{d:"M"+(left?ML-8:ML+W+8)+","+(MT+p)+"L"+(left?ML:ML+W)+","+(MT+l.pos)});}
      lead.setAttribute("class","lead "+l.side);
      g.append(lead,lab);
    });
  }
}
// A paran shows when one of its bodies is picked in the Parans menu and the
// other has its lines on the map, so a hover never lights a hidden line.
// Kaycee, 10 October: with Earth's lines off, a Venus-Earth paran should be too.
const pairOk=d=>(st.parans.has(d.body)&&st.lines.has(d.body2))||(st.parans.has(d.body2)&&st.lines.has(d.body));
function paint(){
  const sideOk=d=>st.side==="both"||d.side===st.side;
  for(const el of document.querySelectorAll("#lines [data-side]"))
    el.classList.toggle("off",!(sideOk(el.dataset)&&st.lines.has(el.dataset.body)&&st.angles.has(el.dataset.angle)));
  for(const el of document.querySelectorAll("#parans [data-side]"))
    el.classList.toggle("off",!(sideOk(el.dataset)&&pairOk(el.dataset)&&(st.angles.has(el.dataset.angle)||st.angles.has(el.dataset.angle2))));
  for(const c of document.querySelectorAll(".opt"))c.classList.toggle("on",st[c.dataset.kind].has(c.dataset.chip));
  for(const k in ALL)document.querySelector('[data-dd="'+k+'"] .n').textContent=st[k].size===ALL[k].length?"All":st[k].size?st[k].size:"None";
  layoutLabels();
}
document.getElementById("side").onclick=e=>{const b=e.target.closest(".pill");if(!b)return;
  document.querySelectorAll("#side .pill").forEach(p=>p.classList.toggle("on",p===b));st.side=b.dataset.v;paint()};
document.body.addEventListener("click",e=>{
  const dd=e.target.closest(".dd");
  for(const m of document.querySelectorAll(".dd.open"))if(m!==dd)m.classList.remove("open");
  if(dd&&e.target.closest(".dd>button")){dd.classList.toggle("open");return}
  const t=e.target.closest("button,.opt");if(!t)return;
  if(t.dataset.all){st[t.dataset.all]=new Set(ALL[t.dataset.all]);return paint()}
  if(t.dataset.none){st[t.dataset.none].clear();return paint()}
  if(t.dataset.kind){const s=st[t.dataset.kind],b=t.dataset.chip;s.has(b)?s.delete(b):s.add(b);paint()}
});
const tip=document.getElementById("tip");
function hot(d,on){
  const q=(b,a)=>'#lines [data-side="'+d.side+'"][data-body="'+b+'"][data-angle="'+a+'"], #labels [data-side="'+d.side+'"][data-body="'+b+'"][data-angle="'+a+'"]';
  for(const el of document.querySelectorAll(q(d.body,d.angle)+(d.body2?", "+q(d.body2,d.angle2):"")))el.classList.toggle("hot",on);
}
let cur=null;
document.getElementById("map").addEventListener("mousemove",e=>{
  const el=e.target.closest("[data-side]");
  if(cur&&cur!==el){cur.classList.remove("hot");hot(cur.dataset,false)}
  cur=el;
  if(!el){tip.style.display="none";return}
  if(el.dataset.body2){el.classList.add("hot");el.parentNode.appendChild(el)}
  hot(el.dataset,true);
  tip.innerHTML=describe(el);tip.style.display="block";
  tip.style.left=Math.min(e.clientX+14,innerWidth-300)+"px";tip.style.top=(e.clientY+14)+"px";
});
document.getElementById("map").addEventListener("mouseleave",()=>{tip.style.display="none";if(cur){cur.classList.remove("hot");hot(cur.dataset,false);cur=null}});
paint();
</script></body></html>`;

  const dir = join(homedir(), "Desktop", "HD Reports", "Astrocartography");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${personName}.html`);
  writeFileSync(out, html);
  console.log(out, (html.length / 1024).toFixed(0) + " KB", labels.length, "labels");
})();
