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
 *
 * The map zooms inside its own frame (pinch, scroll, drag, or the buttons)
 * rather than the browser magnifying the page. Kaycee, 10 October: tooltips
 * were unreadable under a page zoom, and the edge glyphs should travel with
 * the zoom so the lines in view stay named. So the lines, parans and glyphs
 * are drawn in the page from longitude and latitude, for the current view.
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { getChart } from "../lib/mybodygraph";
import { locate, getAstro } from "../lib/astro";
import { ZODIAC } from "../lib/astro-extras";
import { mapFor, paransFor, HD_BODIES } from "../lib/astrocartography";
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

const r3 = (n: number) => Math.round(n * 1000) / 1000;

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

  // Lines and parans go to the page as longitude and latitude; it draws them
  // for whatever part of the world is in view.
  const LN: { side: string; body: string; angle: string; runs: number[][][] }[] = [];
  const PR: { side: string; a: string; angleA: string; b: string; angleB: string; lat: number; lon: number }[] = [];
  for (const [side, when] of Object.entries(sides)) {
    for (const b of mapFor(when)) {
      for (const [angle, runs] of Object.entries(b.lines)) {
        LN.push({ side, body: b.body, angle, runs: runs.map((run) => run.map(([lo, la]) => [r3(lo), r3(la)])) });
      }
    }
    for (const p of paransFor(when)) {
      if (p.lat > TOP || p.lat < BOTTOM) continue;
      PR.push({ side, a: p.a, angleA: p.angleA, b: p.b, angleB: p.angleB, lat: r3(p.lat), lon: r3(p.lon) });
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
body{margin:0;font-family:'Montserrat',-apple-system,sans-serif;color:var(--ink);background:#faf8fb;height:100vh;display:flex;flex-direction:column;overflow:hidden}
header{padding:20px 24px 8px}
h1{margin:0;font-weight:600;font-size:22px;color:var(--purple)}
.sub{color:var(--muted);font-size:13px;margin-top:4px}
.bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 24px}
.head{font-size:12px;font-weight:600;color:var(--purple);width:56px}
.pill{font:inherit;font-size:12px;border:1px solid #d9d0e0;background:#fff;color:var(--ink);border-radius:999px;padding:5px 11px;cursor:pointer}
.pill.on{background:var(--purple);border-color:var(--purple);color:#fff}
.gap{width:10px}
.stage{flex:1;min-height:0;padding:8px 24px 16px;display:flex;justify-content:center;align-items:flex-start}
#map{touch-action:none}
#map.grab{cursor:grab}#map.grabbing{cursor:grabbing}
.zoom{display:flex;gap:4px;margin-left:auto}
.zoom button{font:inherit;font-size:16px;font-weight:600;width:30px;height:30px;border:1px solid #d9d0e0;background:#fff;color:var(--ink);border-radius:8px;cursor:pointer;box-shadow:0 2px 6px rgba(47,42,51,.08);padding:0}
.zoom button[data-z=reset]{font-size:10px;width:auto;padding:0 6px}
#map{display:block;max-width:100%;max-height:100%;width:auto;height:100%}
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
#tip{position:fixed;transform-origin:0 0;pointer-events:none;background:#fff;border:1px solid #d9d0e0;border-radius:8px;padding:8px 10px;font-size:12px;box-shadow:0 4px 14px rgba(47,42,51,.12);display:none;max-width:280px}
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
<span class="gap"></span>${dropdown("lines", "Lines", planetItems)}${dropdown("angles", "Angles", angleItems)}${dropdown("parans", "Parans", planetItems)}<div class="zoom"><button data-z="in" title="Zoom In">+</button><button data-z="out" title="Zoom Out">&minus;</button><button data-z="reset">Reset</button></div></div>
<div class="stage"><svg viewBox="0 0 ${VW} ${f(VH)}" preserveAspectRatio="xMidYMin meet" id="map">
<defs><clipPath id="clip"><rect width="${W}" height="${f(H)}"/></clipPath></defs>
<g transform="translate(${ML},${MT})">
<rect class="frame" width="${W}" height="${f(H)}"/>
<g clip-path="url(#clip)">
<g id="world">
<path class="grat" vector-effect="non-scaling-stroke" d="${graticule.join("")}"/>
<path class="land" vector-effect="non-scaling-stroke" d="${landPath(join(geoDir, "land-50m.json"))}"/>
</g>
<g id="parans"></g>
<g id="lines"></g>
<circle class="birth" id="birth" r="5"><title>${row.birth_place}</title></circle>
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
const LN=${JSON.stringify(LN)};
const PR=${JSON.stringify(PR)};
const BIRTH=${JSON.stringify([place.lon, place.lat])};
const TOP=${TOP},BOTTOM=${BOTTOM},ORB=1;
const PERSON=${JSON.stringify(personName)};
const ML=${ML},MT=${MT},W=${W},H=${f(H)};
const BODIES=${JSON.stringify(HD_BODIES)};
const ANGLES=["ASC","DSC","MC","IC"];
const ALL={lines:BODIES,parans:BODIES,angles:ANGLES};
// Earth and both Nodes start off: Kaycee, 10 October. They are still one
// click away, and All includes them.
const START_OFF=["Earth","North Node","South Node"];
const st={side:"both",lines:new Set(BODIES.filter(b=>!START_OFF.includes(b))),angles:new Set(ANGLES),parans:new Set()};
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
// The view: zoom k and pan (tx, ty), in frame units. k=1 is the whole map.
const view={k:1,tx:0,ty:0};
const X=lon=>((lon+180)/360*W)*view.k+view.tx;
const Y=lat=>((TOP-lat)/(TOP-BOTTOM)*H)*view.k+view.ty;
// Build every mark once, tagged by identity; drawing only moves them.
const gl=document.getElementById("lines"),gp=document.getElementById("parans");
for(const l of LN){l.el=mk("path",{class:"ln "+l.side+" "+l.angle,"data-person":PERSON,"data-side":l.side,"data-body":l.body,"data-angle":l.angle});gl.append(l.el)}
for(const p of PR){
  p.el=mk("g",{class:"pr "+p.side,"data-person":PERSON,"data-side":p.side,"data-body":p.a,"data-angle":p.angleA,"data-body2":p.b,"data-angle2":p.angleB,"data-lat":p.lat.toFixed(2)});
  p.rect=mk("rect",{x:0,width:W});p.dot=mk("circle",{r:3.5});p.el.append(p.rect,p.dot);gp.append(p.el)}
function draw(){
  document.getElementById("world").setAttribute("transform","matrix("+view.k+",0,0,"+view.k+","+view.tx+","+view.ty+")");
  for(const l of LN){if(l.el.classList.contains("off"))continue;
    l.el.setAttribute("d",l.runs.map(r=>"M"+r.map(p=>X(p[0]).toFixed(1)+","+Y(p[1]).toFixed(1)).join("L")).join(""))}
  for(const p of PR){if(p.el.classList.contains("off"))continue;
    const y0=Y(p.lat+ORB),y1=Y(p.lat-ORB);p.rect.setAttribute("y",y0.toFixed(1));p.rect.setAttribute("height",(y1-y0).toFixed(1));
    p.dot.setAttribute("cx",X(p.lon).toFixed(1));p.dot.setAttribute("cy",Y(p.lat).toFixed(1))}
  const b=document.getElementById("birth");b.setAttribute("cx",X(BIRTH[0]));b.setAttribute("cy",Y(BIRTH[1]));
  layoutLabels();
}
/**
 * Where each line in view leaves the frame, worked out for the current view,
 * so the glyphs travel with the zoom. Meridians are named along the top.
 * Horizon curves at every side and bottom exit; at a top exit only when they
 * have no other, because the top row belongs to the meridians.
 */
function anchors(l){
  if(l.angle==="MC"||l.angle==="IC"){const x=X(l.runs[0][0][0]);return x>=0&&x<=W?[{edge:"top",pos:x}]:[]}
  const out=[],top=[];let tail=null;
  for(const run of l.runs){
    const P=run.map(p=>[X(p[0]),Y(p[1])]);
    for(const e of [P[0],P[P.length-1]]){
      if(e[1]>=0&&e[1]<=H&&(Math.abs(e[0])<.5||Math.abs(e[0]-W)<.5))out.push({edge:e[0]<W/2?"left":"right",pos:e[1]});
    }
    for(let i=1;i<P.length;i++){const a=P[i-1],c=P[i];
      for(const [v,edge,axis] of [[0,"top",1],[H,"bottom",1],[0,"left",0],[W,"right",0]]){
        if((a[axis]>v)===(c[axis]>v)||a[axis]===c[axis])continue;
        const t=(v-a[axis])/(c[axis]-a[axis]),o=a[1-axis]+t*(c[1-axis]-a[1-axis]);
        if(o<0||o>(axis?W:H))continue;
        (edge==="top"?top:out).push({edge,pos:o});
      }
      if(c[0]>=0&&c[0]<=W&&c[1]>=0&&c[1]<=H&&(!tail||c[1]<tail[1]))tail=c;
    }
  }
  if(out.length)return out;
  if(top.length)return top;
  // Entirely inside the view: named on the nearer side, at its highest point.
  return tail?[{edge:tail[0]<W/2?"left":"right",pos:tail[1]}]:[];
}
/** Glyphs outside the frame, spread along each edge so none overlap. */
function layoutLabels(){
  const g=document.getElementById("labels");g.replaceChildren();
  const LABELS=[];
  for(const l of LN)if(!l.el.classList.contains("off"))for(const a of anchors(l))LABELS.push({side:l.side,body:l.body,angle:l.angle,...a});
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
// A paran shows when one of its bodies is picked in the Parans menu and BOTH
// have their lines on the map, so a hover never lights a hidden line. Kaycee,
// 10 October: with Earth's lines off, Earth's parans should be too. Checking
// only the partner left Earth in whenever Parans was set to All.
const pairOk=d=>(st.parans.has(d.body)||st.parans.has(d.body2))&&st.lines.has(d.body)&&st.lines.has(d.body2);
function paint(){
  const sideOk=d=>st.side==="both"||d.side===st.side;
  for(const el of document.querySelectorAll("#lines [data-side]"))
    el.classList.toggle("off",!(sideOk(el.dataset)&&st.lines.has(el.dataset.body)&&st.angles.has(el.dataset.angle)));
  for(const el of document.querySelectorAll("#parans [data-side]"))
    el.classList.toggle("off",!(sideOk(el.dataset)&&pairOk(el.dataset)&&(st.angles.has(el.dataset.angle)||st.angles.has(el.dataset.angle2))));
  for(const c of document.querySelectorAll(".opt"))c.classList.toggle("on",st[c.dataset.kind].has(c.dataset.chip));
  for(const k in ALL)document.querySelector('[data-dd="'+k+'"] .n').textContent=st[k].size===ALL[k].length?"All":st[k].size?st[k].size:"None";
  draw();
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
  // A pinch-zoom magnifies the page, tooltip and all. Kaycee, 10 October:
  // the tooltip should not zoom with the map. Undo the zoom on the tooltip
  // alone and keep it inside the part of the page actually on screen.
  const vv=window.visualViewport, z=vv?vv.scale:1;
  tip.style.transform="scale("+(1/z)+")";
  const w=tip.offsetWidth/z, h=tip.offsetHeight/z, pad=8/z;
  const vl=vv?vv.offsetLeft:0, vt=vv?vv.offsetTop:0, vw=vv?vv.width:innerWidth, vh=vv?vv.height:innerHeight;
  let tx=e.clientX+14/z, ty=e.clientY+14/z;
  if(tx+w>vl+vw-pad)tx=e.clientX-14/z-w;
  if(ty+h>vt+vh-pad)ty=e.clientY-14/z-h;
  tip.style.left=Math.max(vl+pad,tx)+"px";tip.style.top=Math.max(vt+pad,ty)+"px";
});
document.getElementById("map").addEventListener("mouseleave",()=>{tip.style.display="none";if(cur){cur.classList.remove("hot");hot(cur.dataset,false);cur=null}});
// Zoom inside the frame. A pinch arrives as a ctrl-wheel (Chrome, Firefox) or
// as gesture events (Safari); either is caught here so the page itself never
// zooms. Two-finger scroll or a drag pans once zoomed in.
const svg=document.getElementById("map");
function frameAt(cx,cy){const pt=new DOMPoint(cx,cy).matrixTransform(svg.getScreenCTM().inverse());return [pt.x-ML,pt.y-MT]}
function clampView(){view.k=Math.min(16,Math.max(1,view.k));
  view.tx=Math.min(0,Math.max(W-W*view.k,view.tx));view.ty=Math.min(0,Math.max(H-H*view.k,view.ty));
  svg.classList.toggle("grab",view.k>1)}
let pending=false;
function redraw(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;draw()})}
function zoomAt(fx,fy,k){const k0=view.k;view.k=Math.min(16,Math.max(1,k));
  view.tx=fx-(fx-view.tx)*view.k/k0;view.ty=fy-(fy-view.ty)*view.k/k0;clampView();redraw()}
let gesturing=false;
svg.addEventListener("wheel",e=>{
  if(e.ctrlKey){if(gesturing)return;e.preventDefault();const [fx,fy]=frameAt(e.clientX,e.clientY);zoomAt(fx,fy,view.k*Math.exp(-e.deltaY*0.01));return}
  if(view.k>1){e.preventDefault();const s=svg.getScreenCTM().a;view.tx-=e.deltaX/s;view.ty-=e.deltaY/s;clampView();redraw()}
},{passive:false});
let g0=1;
svg.addEventListener("gesturestart",e=>{e.preventDefault();gesturing=true;g0=view.k});
svg.addEventListener("gesturechange",e=>{e.preventDefault();const [fx,fy]=frameAt(e.clientX,e.clientY);zoomAt(fx,fy,g0*e.scale)});
svg.addEventListener("gestureend",e=>{e.preventDefault();gesturing=false});
let drag=null;
svg.addEventListener("pointerdown",e=>{if(view.k<=1||e.button!==0)return;drag={x:e.clientX,y:e.clientY,tx:view.tx,ty:view.ty};svg.setPointerCapture(e.pointerId);svg.classList.add("grabbing")});
svg.addEventListener("pointermove",e=>{if(!drag)return;const s=svg.getScreenCTM().a;view.tx=drag.tx+(e.clientX-drag.x)/s;view.ty=drag.ty+(e.clientY-drag.y)/s;clampView();redraw()});
svg.addEventListener("pointerup",()=>{drag=null;svg.classList.remove("grabbing")});
document.querySelector(".zoom").onclick=e=>{const z=e.target.closest("button");if(!z)return;
  if(z.dataset.z==="reset"){view.k=1;view.tx=0;view.ty=0;clampView();return redraw()}
  zoomAt(W/2,H/2,view.k*(z.dataset.z==="in"?1.6:1/1.6))};
paint();
</script></body></html>`;

  const dir = join(homedir(), "Desktop", "HD Reports", "Astrocartography");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${personName}.html`);
  writeFileSync(out, html);
  console.log(out, (html.length / 1024).toFixed(0) + " KB", LN.length, "lines", PR.length, "parans");
})();
