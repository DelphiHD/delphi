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
import { locate } from "../lib/astro";
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

  const chipRow = (kind: string) => HD_BODIES.map((b) =>
    `<button class="chip" data-kind="${kind}" data-chip="${b}" title="${b}">` +
    `<span>${glyph(b)}</span>${b}</button>`).join("");

  const VW = ML + W + MR, VH = MT + H + MB;
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
.bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 24px}
.head{font-size:12px;font-weight:600;color:var(--purple);width:56px}
.pill,.chip{font:inherit;font-size:12px;border:1px solid #d9d0e0;background:#fff;color:var(--ink);border-radius:999px;padding:5px 11px;cursor:pointer}
.pill.on{background:var(--purple);border-color:var(--purple);color:#fff}
.chip{color:#a59fb0}.chip.on{border-color:var(--purple);color:var(--ink);background:#f6f0f9}
.chip span{font-size:15px;margin-right:4px}
.gap{width:10px}
.stage{padding:8px 24px 24px}
svg{width:100%;height:auto;display:block}
.frame{fill:var(--sea);stroke:#8d8396;stroke-width:1.5}
.land{fill:var(--land);stroke:#cbbcd6;stroke-width:.6}
.grat{stroke:var(--grid);stroke-width:1;fill:none}
.ln{fill:none;stroke-width:1.7;stroke-linecap:round}
.ln.MC{stroke-dasharray:14 4 2 4}
.ln.IC{stroke-dasharray:0.1 4.5;stroke-width:2.6}
.ln.DSC{stroke-dasharray:8 5}
.ln.personality{stroke:var(--ink)}.ln.design{stroke:var(--design)}
.ln.hot{stroke-width:4}.ln.IC.hot{stroke-width:5}
.lbl{cursor:default}
.lbl .g{font-size:15px}.lbl .a{font-size:8px;font-weight:600;letter-spacing:.3px}
.lbl.personality{fill:var(--ink)}.lbl.design{fill:var(--design)}
.lbl.hot .g{font-size:19px}
.lead{stroke-width:.7;fill:none}.lead.personality{stroke:var(--ink)}.lead.design{stroke:var(--design)}
.pr rect{opacity:.2}.pr circle{stroke:#fff;stroke-width:1}
.pr.personality rect,.pr.personality circle{fill:var(--purple)}
.pr.design rect,.pr.design circle{fill:var(--design)}
.pr.hot rect{opacity:.38}
.birth{fill:var(--purple);stroke:#fff;stroke-width:2}
.off{display:none}
#tip{position:fixed;pointer-events:none;background:#fff;border:1px solid #d9d0e0;border-radius:8px;padding:8px 10px;font-size:12px;box-shadow:0 4px 14px rgba(47,42,51,.12);display:none;max-width:280px}
#tip b{color:var(--purple)}
</style></head><body>
<header><h1>${personName}</h1>
<div class="sub">${row.birth_place} · ${row.birth_date} ${String(row.birth_time).slice(0, 5)} · design ${sides.design.toISOString().slice(0, 16).replace("T", " ")} UTC</div></header>
<div class="bar" id="side"><span class="head">Show</span><button class="pill on" data-v="both">Both</button><button class="pill" data-v="personality">Personality</button><button class="pill" data-v="design">Design</button></div>
<div class="bar"><span class="head">Lines</span>${chipRow("lines")}<span class="gap"></span><button class="pill" data-all="lines">All</button><button class="pill" data-none="lines">None</button></div>
<div class="bar"><span class="head">Parans</span>${chipRow("parans")}<span class="gap"></span><button class="pill" data-all="parans">All</button><button class="pill" data-none="parans">None</button></div>
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
const ANGLE={MC:"Midheaven line",IC:"IC line",ASC:"Rising line",DSC:"Setting line"};
const SIDE={personality:"Personality",design:"Design"};
const GLYPH=${JSON.stringify(Object.fromEntries(HD_BODIES.map((b) => [b, glyph(b)])))};
const LABELS=${JSON.stringify(labels.map((l) => ({ ...l, pos: +l.pos.toFixed(1) })))};
const PERSON=${JSON.stringify(personName)};
const ML=${ML},MT=${MT},W=${W},H=${f(H)};
const BODIES=${JSON.stringify(HD_BODIES)};
const st={side:"both",lines:new Set(BODIES),parans:new Set()};
// One resolver answers "what is this?", read from the element, never its position.
function describe(el){
  const d=el.dataset, who=d.person+", "+SIDE[d.side];
  if(d.body2) return "<b>"+who+" paran</b><br>"+d.body+" "+ANGLE[d.angle]+" with "+d.body2+" "+ANGLE[d.angle2]+"<br>Latitude "+(+d.lat).toFixed(1)+"°";
  return "<b>"+who+"</b><br>"+d.body+" "+ANGLE[d.angle];
}
const NS="http://www.w3.org/2000/svg";
const mk=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e};
/** Glyphs outside the frame, spread along each edge so none overlap. */
function layoutLabels(){
  const g=document.getElementById("labels");g.replaceChildren();
  const vis=LABELS.filter(l=>(st.side==="both"||l.side===st.side)&&st.lines.has(l.body));
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
function paint(){
  const sideOk=d=>st.side==="both"||d.side===st.side;
  for(const el of document.querySelectorAll("#lines [data-side]"))
    el.classList.toggle("off",!(sideOk(el.dataset)&&st.lines.has(el.dataset.body)));
  for(const el of document.querySelectorAll("#parans [data-side]"))
    el.classList.toggle("off",!(sideOk(el.dataset)&&(st.parans.has(el.dataset.body)||st.parans.has(el.dataset.body2))));
  for(const c of document.querySelectorAll(".chip"))c.classList.toggle("on",st[c.dataset.kind].has(c.dataset.chip));
  layoutLabels();
}
document.getElementById("side").onclick=e=>{const b=e.target.closest(".pill");if(!b)return;
  document.querySelectorAll("#side .pill").forEach(p=>p.classList.toggle("on",p===b));st.side=b.dataset.v;paint()};
document.body.addEventListener("click",e=>{
  const t=e.target.closest("button");if(!t)return;
  if(t.dataset.all){st[t.dataset.all]=new Set(BODIES);return paint()}
  if(t.dataset.none){st[t.dataset.none].clear();return paint()}
  if(t.dataset.kind){const s=st[t.dataset.kind],b=t.dataset.chip;s.has(b)?s.delete(b):s.add(b);paint()}
});
const tip=document.getElementById("tip");
function hot(d,on){
  for(const el of document.querySelectorAll('#lines [data-side="'+d.side+'"][data-body="'+d.body+'"][data-angle="'+d.angle+'"], #labels [data-side="'+d.side+'"][data-body="'+d.body+'"][data-angle="'+d.angle+'"]'))el.classList.toggle("hot",on);
}
let cur=null;
document.getElementById("map").addEventListener("mousemove",e=>{
  const el=e.target.closest("[data-side]");
  if(cur&&cur!==el){cur.dataset.body2?cur.classList.remove("hot"):hot(cur.dataset,false)}
  cur=el;
  if(!el){tip.style.display="none";return}
  el.dataset.body2?el.classList.add("hot"):hot(el.dataset,true);
  tip.innerHTML=describe(el);tip.style.display="block";
  tip.style.left=Math.min(e.clientX+14,innerWidth-300)+"px";tip.style.top=(e.clientY+14)+"px";
});
document.getElementById("map").addEventListener("mouseleave",()=>{tip.style.display="none";if(cur){cur.dataset.body2?cur.classList.remove("hot"):hot(cur.dataset,false);cur=null}});
paint();
</script></body></html>`;

  const dir = join(homedir(), "Desktop", "HD Reports", "Astrocartography");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${personName}.html`);
  writeFileSync(out, html);
  console.log(out, (html.length / 1024).toFixed(0) + " KB", labels.length, "labels");
})();
