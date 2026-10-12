/**
 * The World: a chart's astro-cartography view.
 *
 * Mounted by the chart page into an empty element:
 *   DelphiWorld.mount(el, DATA.world, { geometry, api: { places, place, relocate }, fontCss })
 * DATA.world comes from lib/world.ts: each side's sky (right ascension and
 * declination of every body, and the sidereal time), never the lines
 * themselves, so a chart stays small. The lines and parans are drawn here with
 * the same geometry as lib/astrocartography.ts, which is where it was checked.
 * The coastline, borders and cities are one shared file, fetched once.
 *
 * Everything this view draws carries person, side, body and angle on the
 * element, and one resolver (describe) answers what a mark is. Identity, never
 * position. See docs/ASTROCARTOGRAPHY_PLAN.md and docs/DECISIONS.md.
 */
(function () {
"use strict";
var RAD = Math.PI / 180;
var wrap180 = function (d) { return ((((d + 180) % 360) + 360) % 360) - 180; };

// ---- Line geometry, ported from lib/astrocartography.ts ------------------
var LATS = (function () { var o = []; for (var lat = -85; lat <= 85; lat += 0.5) o.push(lat); return o; })();
function horizonCurves(mc, dec) {
  var ASC = [], DSC = [], tanDec = Math.tan(dec * RAD), limit = 90 - Math.abs(dec);
  var lats = LATS.filter(function (lat) { return Math.abs(lat) < limit; });
  if (limit <= 85) [0.25, 0.1, 0.04, 0.01, 0.002, 0].forEach(function (d) { lats.push(limit - d, -(limit - d)); });
  lats.sort(function (a, b) { return a - b; });
  lats.forEach(function (lat) {
    var c = Math.max(-1, Math.min(1, -Math.tan(lat * RAD) * tanDec)), h0 = Math.acos(c) / RAD;
    ASC.push([wrap180(mc - h0), lat]); DSC.push([wrap180(mc + h0), lat]);
  });
  return { ASC: ASC, DSC: DSC };
}
function splitAtDateline(points) {
  var runs = [], run = [];
  points.forEach(function (p) {
    if (run.length && Math.abs(p[0] - run[run.length - 1][0]) > 180) { runs.push(run); run = []; }
    run.push(p);
  });
  if (run.length) runs.push(run);
  return runs;
}
function linesFromSky(sky) {
  var out = [];
  Object.keys(sky.bodies).forEach(function (body) {
    var b = sky.bodies[body], mc = wrap180(b.ra - sky.gast), ic = wrap180(mc + 180), h = horizonCurves(mc, b.dec);
    out.push({ body: body, lines: { MC: [[[mc, -85], [mc, 85]]], IC: [[[ic, -85], [ic, 85]]],
      ASC: splitAtDateline(h.ASC), DSC: splitAtDateline(h.DSC) } });
  });
  return out;
}
var SAME_AXIS = { "Sun|Earth": 1, "Earth|Sun": 1, "North Node|South Node": 1, "South Node|North Node": 1 };
function curveAtLongitude(curve, lon) {
  var out = [];
  for (var i = 1; i < curve.length; i++) {
    var d0 = wrap180(curve[i - 1][0] - lon), d1 = wrap180(curve[i][0] - lon);
    if (Math.abs(d0 - d1) > 180 || Math.sign(d0) === Math.sign(d1)) continue;
    var t = d0 / (d0 - d1);
    out.push(curve[i - 1][1] + t * (curve[i][1] - curve[i - 1][1]));
  }
  return out;
}
function curvesCross(p, q) {
  var qAt = new Map(q.map(function (x) { return [x[1], x[0]]; })), out = [], prev = null;
  p.forEach(function (pt) {
    var lon = pt[0], lat = pt[1], qLon = qAt.get(lat);
    if (qLon === undefined) { prev = null; return; }
    var d = wrap180(lon - qLon);
    if (prev && Math.sign(d) !== Math.sign(prev.d) && Math.abs(d - prev.d) < 90) {
      var t = prev.d / (prev.d - d);
      out.push([wrap180(prev.lon + t * wrap180(lon - prev.lon)), prev.lat + t * (lat - prev.lat)]);
    }
    prev = { d: d, lat: lat, lon: lon };
  });
  return out;
}
function paransFromSky(sky) {
  var S = Object.keys(sky.bodies).map(function (body) {
    var b = sky.bodies[body], mc = wrap180(b.ra - sky.gast), h = horizonCurves(mc, b.dec);
    return { body: body, MC: mc, IC: wrap180(mc + 180), ASC: h.ASC, DSC: h.DSC };
  });
  var out = [];
  for (var i = 0; i < S.length; i++) for (var j = 0; j < S.length; j++) {
    if (i === j) continue;
    var A = S[i], B = S[j];
    if (SAME_AXIS[A.body + "|" + B.body]) continue;
    ["MC", "IC"].forEach(function (aA) { ["ASC", "DSC"].forEach(function (aB) {
      curveAtLongitude(B[aB], A[aA]).forEach(function (lat) { out.push({ a: A.body, angleA: aA, b: B.body, angleB: aB, lat: lat, lon: A[aA] }); });
    }); });
    if (j < i) continue;
    ["ASC", "DSC"].forEach(function (aA) { ["ASC", "DSC"].forEach(function (aB) {
      curvesCross(A[aA], B[aB]).forEach(function (c) { out.push({ a: A.body, angleA: aA, b: B.body, angleB: aB, lat: c[1], lon: c[0] }); });
    }); });
  }
  return out;
}

var HD_BODIES = ["Sun", "Earth", "North Node", "South Node", "Moon", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
var GLYPHS = { Sun: "☉", Earth: "⊕", "North Node": "☊", "South Node": "☋", Moon: "☽", Mercury: "☿",
  Venus: "♀", Mars: "♂", Jupiter: "♃", Saturn: "♄", Uranus: "⛢", Neptune: "♆", Pluto: "♇", Chiron: "⚷", Lilith: "⚸" };

function markup(G, inChart, findHosted, person) {
  var ML = 84, MR = 84, MT = 60, MB = 60, VW = ML + G.W + MR, VH = MT + G.H + MB, f = function (n) { return n.toFixed(1); };
  var grat = [];
  for (var lon = -150; lon <= 150; lon += 30) grat.push("M" + f((lon + 180) / 360 * G.W) + ",0V" + f(G.H));
  for (var lat = -60; lat <= 60; lat += 30) grat.push("M0," + f((G.TOP - lat) / (G.TOP - G.BOTTOM) * G.H) + "H" + G.W);
  var opt = function (kind, key, icon, name) {
    return '<div class="w-opt" data-kind="' + kind + '" data-chip="' + key + '"><span class="radio"></span><span class="gl">' + icon + '</span>' + name + '</div>';
  };
  var swatch = function (a) { return '<svg width="26" height="8"><line class="ln personality ' + a + '" x1="2" x2="24" y1="4" y2="4"/></svg>'; };
  var planets = function (kind) { return HD_BODIES.map(function (b) { return opt(kind, b, GLYPHS[b], b); }).join(""); };
  var dd = function (kind, title, items, extra) {
    return '<div class="dd" data-dd="' + kind + '"><button>' + title + '<span class="n"></span></button><div class="menu">' + items + (extra || "") +
      '<div class="foot"><button class="w-pill" data-all="' + kind + '">All</button><button class="w-pill" data-none="' + kind + '">None</button></div></div></div>';
  };
  var extras = '<div class="sep"></div>' + opt("extras", "Chiron", "⚷", "Chiron") + opt("extras", "Lilith", "⚸", "Lilith") +
    '<div class="trx">' + opt("trx", "Moon", "☽", "Transit Moon") + '</div>';
  var angles = [["ASC", "Ascendant"], ["DSC", "Descendant"], ["MC", "Midheaven"], ["IC", "IC"]].map(function (a) { return opt("angles", a[0], swatch(a[0]), a[1]); }).join("") +
    // Local space, each side on its own, off to begin with; drawn from the
    // birthplace or any place chosen. Kaycee, 2026-10-11.
    '<div class="sep"></div>' + opt("ls", "personality", swatch("LS"), "Personality Local Space") + opt("ls", "design", swatch("LS"), "Design Local Space") +
    '<div class="lsfrom"></div>';
  // Inside a chart, the chart's own panel holds Personality and Design, and its
  // Save Image and Reset serve this view too. Lines and Angles stay here: they
  // work in a way only this view does, and The World opens with Earth and the
  // Nodes off without switching them off in the chart's other views. Kaycee,
  // 2026-10-11. Standalone, the view carries its own sides as well.
  var own = (inChart ? '' : '<span id="w-side" style="display:flex;gap:4px"><button class="w-pill on" data-v="both">Both</button><button class="w-pill" data-v="personality">Personality</button><button class="w-pill" data-v="design">Design</button></span>' +
    '<span class="gap"></span>') + dd("lines", "Lines", planets("lines"), extras) + dd("angles", "Angles", angles) +
    // A rough first look, on her chart only, at the gate each place puts on an
    // angle. Kaycee, 2026-10-11: "would it be possible to put a human design
    // gate overlay over the astrocartography map?"
    '<div class="dd" data-dd="gates"><button>Gates<span class="n"></span></button><div class="menu">' +
    opt("gates", "MC", swatch("MC"), "Midheaven Gates") + opt("gates", "ASC", swatch("ASC"), "Ascendant Gates") + '</div></div>';
  // Two rows (Kaycee, 2026-10-11): finding places first, search then Find My
  // Places, with zoom at the right; the view's own switches together beneath.
  // The person's name over the view, as every other view carries it, so a
  // reader with several charts open can tell them apart. Kaycee, 2026-10-11.
  var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  return (inChart && person ? '<div class="w-name">' + esc(person) + '</div>' : '') +
    '<div class="w-bar' + (inChart ? ' in-chart' : '') + '"><div class="w-tools">' +
    '<div class="search"><input id="w-q" placeholder="Search A City" autocomplete="off"><div class="results" id="w-results"></div></div>' +
    '<button class="w-pill" id="w-findBtn">Find My Places</button><button class="w-pill" id="w-cmpBtn">Compare Places</button>' +
    '<button class="w-pill" id="w-snapMap"' + (inChart ? ' hidden' : '') + '>Save Map Image</button>' +
    '<div class="zoom"><button data-z="in" title="Zoom In">+</button><button data-z="out" title="Zoom Out">&minus;</button>' + (inChart ? '' : '<button data-z="reset">Reset</button>') + '</div></div>' +
    '<div class="w-views">' + own + dd("parans", "Parans", planets("parans")) + '</div></div>' +
    '<div class="w-stage"><svg viewBox="0 0 ' + VW + ' ' + f(VH) + '" preserveAspectRatio="xMidYMin meet" id="w-map">' +
    '<defs><clipPath id="w-clip"><rect width="' + G.W + '" height="' + f(G.H) + '"/></clipPath></defs>' +
    '<g transform="translate(' + ML + ',' + MT + ')"><rect class="frame" width="' + G.W + '" height="' + f(G.H) + '"/>' +
    '<g clip-path="url(#w-clip)"><g id="w-world">' +
    '<path class="grat" vector-effect="non-scaling-stroke" d="' + grat.join("") + '"/>' +
    '<path class="land" vector-effect="non-scaling-stroke" d="' + G.land + '"/>' +
    '<g id="w-gates"></g>' +
    '<image id="w-heat" x="0" y="0" width="' + G.W + '" height="' + f(G.H) + '" preserveAspectRatio="none" href=""/>' +
    '<path class="border" vector-effect="non-scaling-stroke" d="' + G.borders + '"/></g>' +
    '<g id="w-cities"></g><g id="w-rings"></g><g id="w-parans"></g><g id="w-lines"></g><g id="w-hits"></g>' +
    '<circle class="birth" id="w-birth" r="5"></circle><g id="w-pin"></g></g>' +
    '<rect width="' + G.W + '" height="' + f(G.H) + '" fill="none" stroke="#8d8396" stroke-width="1.5"/></g>' +
    '<g id="w-labels"></g></svg><div id="w-here"></div><div id="w-compare"></div>' + (findHosted ? '' : '<div id="w-find"></div>') + '</div>' +
    '<div id="w-tip"></div><div id="w-wheel"><div class="box"></div></div>';
}

function init(root, D, G, opts) {
const API = opts.api || {};
if (opts.findHost && !document.getElementById("w-find")) {
  const fb = document.createElement("div"); fb.id = "w-find"; opts.findHost.appendChild(fb);
}
const withToken = function (u) { return opts.token ? u + (u.indexOf("?") < 0 ? "?" : "&") + "token=" + encodeURIComponent(opts.token) : u; };
const WHERE = D.where;
const pill = a => '<span class="w-pill">' + a + '</span>';
const SIDE = { personality: "Personality", design: "Design" };
const GLYPH = Object.assign({}, GLYPHS);
// Lines and parans drawn here from each side's sky; tagged with the side.
const LN = [], PR = [];
["personality", "design"].forEach(function (side) {
  linesFromSky(D.sky[side]).forEach(function (b) {
    Object.keys(b.lines).forEach(function (angle) { LN.push({ side: side, body: b.body, angle: angle, runs: b.lines[angle] }); });
  });
  paransFromSky(D.sky[side]).forEach(function (p) {
    if (p.lat > G.TOP || p.lat < G.BOTTOM) return;
    PR.push({ side: side, a: p.a, angleA: p.angleA, b: p.b, angleB: p.angleB, lat: p.lat, lon: p.lon });
  });
});
const BIRTH = D.birth;
const BASIC = D.basic;
const NATAL = D.natal;
const GATE_OF = D.gateOf;
const FONTCSS = opts.fontCss || (typeof window.FONTCSS === "string" ? window.FONTCSS : "");
const GATES = { pg: Object.values(D.gateOf.personality).map(g => g.split(".")[0]).join(","), dg: Object.values(D.gateOf.design).map(g => g.split(".")[0]).join(",") };
const BORN = D.born;
const CAST = D.cast;
const CITIES = G.cities;
const TOP = G.TOP, BOTTOM = G.BOTTOM, ORB = 1;
const PERSON = D.person;
const ML = 84, MT = 60, MR = 84, W = G.W, H = G.H;
const BODIES = HD_BODIES;
const ANGLES=["ASC","DSC","MC","IC"];
const ALL={lines:BODIES,parans:BODIES,angles:ANGLES};
// Earth and both Nodes start off: Kaycee, 10 October. They are still one
// click away, and All includes them.
const START_OFF=["Earth","North Node","South Node"];
const st={side:"both",lines:new Set(BODIES.filter(b=>!START_OFF.includes(b))),angles:new Set(ANGLES),parans:new Set(),extras:new Set(),trx:new Set(),ls:new Set(),gates:new Set()};
const EXTRAS=["Chiron","Lilith"];
let bothOff=false;   // the chart's panel has both sides off
// Transit (Kaycee, 2026-10-11): where each transiting body sits on this
// chart's natal angles at the moment the chart's date picker shows. On under the
// Transit chart type; Transit Only hides the natal lines.
const tr={on:false,alone:false,at:opts.transitAt||"",sky:null,loading:""};
let TWHERE={};
// Relationship (Kaycee, 2026-10-11): the other person's lines with this
// chart's, in the Relationship view's person colours, design a lighter shade.
// PB is their sky from the connection the chart casts; null when there is none
// or their time is not exact enough, and then this chart's person shows alone.
const rel={on:false,name:""};let PB=null;
// The chart's two party buttons (the names in the right-hand panel): on a
// Relationship each person, under Transit the chart and the sky. Either can be
// taken off the map. Kaycee, 2026-10-11: "the buttons for removing one person
// from the map don't do anything. I can see them being useful."
const party={a:true,b:true};
const first=n=>String(n||"").split(" ")[0];
const isB=l=>l.who==="b";
const whoName=l=>rel.on&&PB?first(isB(l)?PB.person:PERSON)+" · ":"";
// The transiting sky for tr.at, from the site; the lines are drawn here against
// each side's natal sidereal time (lib/world-transit.ts says why).
function loadSky(){
  if(!tr.at||!API.sky)return;
  const at=tr.at.slice(0,16);
  if(tr.sky&&tr.sky.at.slice(0,16)===at||tr.loading===at)return;
  tr.loading=at;
  fetch(API.sky+"?date="+at.slice(0,10)+"&time="+at.slice(11,16)).then(r=>r.json()).then(j=>{
    if(tr.loading!==at)return;tr.loading="";
    if(!j.ok)throw new Error(j.error);
    for(let i=LN.length-1;i>=0;i--)if(LN[i].tr){LN[i].el.remove();LN[i].hit.remove();LN.splice(i,1)}
    for(const side of ["personality","design"])
      for(const b of linesFromSky({gast:D.sky[side].gast,bodies:j.bodies}))
        for(const angle of Object.keys(b.lines)){const l={side,body:b.body,angle,runs:b.lines[angle],tr:true};LN.push(l);lineEls(l)}
    tr.sky=j;TWHERE=j.where||{};paint();
  }).catch(e=>{tr.loading="";console.error(e)});
}
GLYPH.Chiron="⚷";GLYPH.Lilith="⚸";
// The bodies the relocated chart speaks about: the menu's planets, and Chiron
// and Lilith when they are switched on.
// A body's lines are on when the Lines menu has it, or, for Chiron and
// Lilith, when their own switch is on.
const lineOn=b=>st.lines.has(b)||st.extras.has(b);
// Whether a line shows: side, Lines menu, Angles, and for transit lines the
// Transit chart type and the transit Moon switch (off to start: it crosses
// every angle within a day). Natal lines step aside under Transit Only.
const lineVisible=l=>!bothOff&&(st.side==="both"||l.side===st.side)&&lineOn(l.body)&&(l.angle==="LS"?st.ls.has(l.side):st.angles.has(l.angle))&&
  (isB(l)||l.tr?party.b:party.a)&&
  (isB(l)?rel.on&&!!PB:true)&&
  (l.tr?(tr.on&&(l.body!=="Moon"||st.trx.has("Moon"))):!(tr.on&&tr.alone));
const chartBodies=()=>[...BODIES.filter(b=>st.lines.has(b)),...EXTRAS.filter(b=>st.extras.has(b))];
// One resolver answers "what is this?", read from the element, never its position.
function describe(el){
  const d=el.dataset, side=(rel.on&&PB?first(d.who==="b"?PB.person:PERSON)+" · ":"")+SIDE[d.side];
  const WH=d.who==="b"&&PB?PB.where:WHERE;
  if(d.body2){const lat=+d.lat;
    return "<b>"+side+" Paran</b>"+
      '<div class="w-row">'+side+" "+d.body+" "+pill(d.angle)+"</div>"+
      '<div class="w-row">'+side+" "+d.body2+" "+pill(d.angle2)+"</div>"+
      '<span class="w-meta">Latitude '+Math.abs(lat).toFixed(1)+"°"+(lat>=0?"N":"S")+"</span>";}
  if(d.transit)return "<b>Transit "+d.body+(TWHERE[d.body]?" in "+TWHERE[d.body]:"")+"</b><br>"+side+" "+pill(d.angle);
  return "<b>"+side+" "+d.body+" in "+WH[d.side][d.body]+"</b><br>"+pill(d.angle);
}
const NS="http://www.w3.org/2000/svg";
const mk=(t,a)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);return e};
// The view: zoom k and pan (tx, ty), in frame units. k=1 is the whole map.
const view={k:1,tx:0,ty:0};
const X=lon=>((lon+180)/360*W)*view.k+view.tx;
const Y=lat=>((TOP-lat)/(TOP-BOTTOM)*H)*view.k+view.ty;
// Build every mark once, tagged by identity; drawing only moves them.
const gl=document.getElementById("w-lines"),gp=document.getElementById("w-parans");
// Each line also gets a wide invisible twin, so it can be hovered and clicked
// without hunting for a 2 pixel stroke. The twin carries the same identity.
const gh=document.getElementById("w-hits");
function lineEls(l){const id={"data-person":isB(l)?PB.person:PERSON,"data-side":l.side,"data-body":l.body,"data-angle":l.angle};
  if(l.tr)id["data-transit"]="1";
  if(isB(l))id["data-who"]="b";
  l.el=mk("path",{class:"ln "+l.side+" "+l.angle+(l.tr?" transit":"")+(isB(l)?" who-b":""),...id});gl.append(l.el);
  l.hit=mk("path",{class:"hit",...id});gh.append(l.hit)}
for(const l of LN)lineEls(l);
function paranEls(p){
  p.el=mk("g",{class:"pr "+p.side+(isB(p)?" who-b":""),"data-person":isB(p)?PB.person:PERSON,"data-side":p.side,"data-body":p.a,"data-angle":p.angleA,"data-body2":p.b,"data-angle2":p.angleB,"data-lat":p.lat.toFixed(2)});
  if(isB(p))p.el.setAttribute("data-who","b");
  p.rect=mk("rect",{x:0,width:W});p.dot=mk("circle",{r:3.5});p.el.append(p.rect,p.dot);gp.append(p.el)}
for(const p of PR)paranEls(p);
// The other person of a Relationship: their lines and their own parans, in.
function setPartner(B,name){
  for(let i=LN.length-1;i>=0;i--)if(isB(LN[i])){LN[i].el.remove();LN[i].hit.remove();LN.splice(i,1)}
  for(let i=PR.length-1;i>=0;i--)if(isB(PR[i])){PR[i].el.remove();PR.splice(i,1)}
  PB=B&&B.v===1?B:null;rel.name=name||(PB?PB.person:"");
  if(PB)for(const side of ["personality","design"]){
    for(const b of linesFromSky(PB.sky[side]))for(const angle of Object.keys(b.lines)){const l={side,body:b.body,angle,runs:b.lines[angle],who:"b"};LN.push(l);lineEls(l)}
    for(const p of paransFromSky(PB.sky[side])){if(p.lat>TOP||p.lat<BOTTOM)continue;const q={side,a:p.a,angleA:p.angleA,b:p.b,angleB:p.angleB,lat:p.lat,lon:p.lon,who:"b"};PR.push(q);paranEls(q)}
  }
  buildLS();
  renderName();
  if(typeof paint==="function")paint();
}
// The person's name over the view; on a Relationship both, as the chart shows
// a pair, or a word that the other's time is not exact enough for a map.
// ---- Local space -------------------------------------------------------------
// Each body's compass direction at the birth moment, seen from one place, drawn
// as the great circle through that place on that bearing. From the birthplace
// unless the person draws it from a place they choose. Graded in a place's
// panel like any line; Find My Places keeps to the angles. Kaycee, 2026-10-11:
// "any place they choose", both sides each with an on and off, on the same
// map, graded.
let lsFrom=null;   // {lat,lon,name}; null is the birthplace
function lsLines(sky,lat,lon){
  // its own degree constant: this runs as the map is first built, before RAD exists
  const DEG=Math.PI/180,out=[],f=lat*DEG;
  for(const body of Object.keys(sky.bodies)){
    const b=sky.bodies[body],H=(sky.gast+lon-b.ra)*DEG,d=b.dec*DEG;
    const az=Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(f)-Math.tan(d)*Math.cos(f))+Math.PI;
    const pts=[];
    for(let k=0;k<=360;k+=1){const a=k*DEG;
      const la=Math.asin(Math.sin(f)*Math.cos(a)+Math.cos(f)*Math.sin(a)*Math.cos(az));
      const lo=lon+Math.atan2(Math.sin(az)*Math.sin(a)*Math.cos(f),Math.cos(a)-Math.sin(f)*Math.sin(la))/DEG;
      pts.push([((lo+540)%360)-180,la/DEG])}
    out.push({body,runs:splitAtDateline(pts),az:az/DEG});
  }
  return out;
}
function buildLS(){
  for(let i=LN.length-1;i>=0;i--)if(LN[i].angle==="LS"){LN[i].el.remove();LN[i].hit.remove();LN.splice(i,1)}
  const at=lsFrom||{lat:BIRTH[1],lon:BIRTH[0]};
  const skies=[["a",D]].concat(PB?[["b",PB]]:[]);
  for(const [who,src] of skies)for(const side of ["personality","design"])
    for(const x of lsLines(src.sky[side],at.lat,at.lon)){const l={side,body:x.body,angle:"LS",runs:x.runs,az:x.az};if(who==="b")l.who="b";LN.push(l);lineEls(l)}
  const f=root.querySelector(".lsfrom");
  if(f)f.innerHTML=lsFrom?'<div class="w-opt" data-lsback="1">From '+lsFrom.name+' <span class="was">· Use Birthplace</span></div>':'<div class="w-opt was">From Birthplace</div>';
}
function renderName(){
  const n=root.querySelector(".w-name");if(!n)return;
  const e=t=>String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  if(rel.on&&PB)n.innerHTML='<span class="pa">'+e(PERSON)+'</span><span class="and"> and </span><span class="pb">'+e(PB.person)+'</span>';
  else n.innerHTML=e(PERSON)+(rel.on&&rel.name?'<div class="w-note">'+e(first(rel.name))+"'s birth time is not exact enough for the map.</div>":"");
}
function draw(){
  document.getElementById("w-world").setAttribute("transform","matrix("+view.k+",0,0,"+view.k+","+view.tx+","+view.ty+")");
  for(const l of LN){l.hit.classList.toggle("off",l.el.classList.contains("off"));if(l.el.classList.contains("off"))continue;
    const d=l.runs.map(r=>"M"+r.map(p=>X(p[0]).toFixed(1)+","+Y(p[1]).toFixed(1)).join("L")).join("");
    l.el.setAttribute("d",d);l.hit.setAttribute("d",d);
    l.el.classList.toggle("pinned",pinned.has(key(l)))}
  for(const p of PR){if(p.el.classList.contains("off"))continue;
    const y0=Y(p.lat+ORB),y1=Y(p.lat-ORB);p.rect.setAttribute("y",y0.toFixed(1));p.rect.setAttribute("height",(y1-y0).toFixed(1));
    p.dot.setAttribute("cx",X(p.lon).toFixed(1));p.dot.setAttribute("cy",Y(p.lat).toFixed(1))}
  const b=document.getElementById("w-birth");b.setAttribute("cx",X(BIRTH[0]));b.setAttribute("cy",Y(BIRTH[1]));
  drawCities();drawHere();
  layoutLabels();
}
/**
 * Cities appear as the map zooms, in Natural Earth's own order of importance,
 * and a name is skipped rather than drawn over another.
 */
function drawCities(){
  const g=document.getElementById("w-cities");g.replaceChildren();
  const px=svg.getBoundingClientRect().width*W/(ML+W+MR);
  const zoom=Math.log2(px*view.k/256)+0.6;
  const taken=[];
  // The chosen city's own label has the first claim on its spot.
  if(here&&here.name&&!/^Near /.test(here.name)){const hx=X(here.lon),hy=Y(here.lat);taken.push([hx-10,hy-12,hx+14+here.name.length*9.5,hy+10])}
  for(const c of CITIES){
    if(c.z>zoom)break;
    const x=X(c.lon),y=Y(c.lat);if(x<0||x>W||y<0||y>H)continue;
    const box=[x-4,y-8,x+8+c.n.length*7.8,y+8];
    if(taken.some(t=>box[0]<t[2]&&box[2]>t[0]&&box[1]<t[3]&&box[3]>t[1]))continue;
    taken.push(box);
    const e=mk("g",{class:"city"+(c.cap?" cap":"")});
    e.append(mk("circle",{cx:x,cy:y,r:c.cap?3.8:3}));
    const t=mk("text",{x:x+7,y:y+5});t.textContent=c.n;e.append(t);g.append(e);
  }
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
  const g=document.getElementById("w-labels");g.replaceChildren();
  const LABELS=[];
  for(const l of LN)if(!l.el.classList.contains("off"))for(const a of anchors(l))LABELS.push({side:l.side,body:l.body,angle:l.angle,tr:!!l.tr,who:l.who,...a});
  const vis=LABELS;
  for(const edge of ["top","bottom","left","right"]){
    const row=vis.filter(l=>l.edge===edge).sort((a,b)=>a.pos-b.pos);
    const gap=edge==="top"||edge==="bottom"?30:22, max=edge==="top"||edge==="bottom"?W:H;
    const at=row.map(l=>l.pos);
    for(let i=1;i<at.length;i++)at[i]=Math.max(at[i],at[i-1]+gap);
    const over=at.length?at[at.length-1]-max:0;
    if(over>0)for(let i=at.length-1;i>=0;i--){at[i]=Math.min(at[i],(i===at.length-1?max:at[i+1]-gap))}
    row.forEach((l,i)=>{
      const p=at[i];
      const lab=mk("text",{class:"lbl "+l.side+(l.tr?" transit":"")+(isB(l)?" who-b":""),"data-person":isB(l)?PB.person:PERSON,"data-side":l.side,"data-body":l.body,"data-angle":l.angle});
      if(l.tr)lab.setAttribute("data-transit","1");
      if(isB(l))lab.setAttribute("data-who","b");
      const gl=mk("tspan",{class:"g"});gl.textContent=GLYPH[l.body];
      const an=mk("tspan",{class:"a"});an.textContent=l.angle;
      let lead;
      if(edge==="top"){lab.setAttribute("text-anchor","middle");
        an.setAttribute("x",ML+p);an.setAttribute("y",15);gl.setAttribute("x",ML+p);gl.setAttribute("y",40);lab.append(an,gl);
        lead=mk("path",{d:"M"+(ML+p)+","+(MT-14)+"L"+(ML+l.pos)+","+MT});}
      else if(edge==="bottom"){lab.setAttribute("text-anchor","middle");
        gl.setAttribute("x",ML+p);gl.setAttribute("y",MT+H+35);an.setAttribute("x",ML+p);an.setAttribute("y",MT+H+51);lab.append(gl,an);
        lead=mk("path",{d:"M"+(ML+p)+","+(MT+H+14)+"L"+(ML+l.pos)+","+(MT+H)});}
      else{const left=edge==="left";lab.setAttribute("text-anchor",left?"end":"start");
        const xx=left?ML-12:ML+W+12;
        gl.setAttribute("x",xx);gl.setAttribute("y",MT+p+7);an.setAttribute("dx",left?-0:0);
        if(left){an.setAttribute("dx","0");lab.append(an,gl);an.setAttribute("x",xx-26);an.setAttribute("y",MT+p+5);}
        else{lab.append(gl,an);an.setAttribute("dx","4");}
        lead=mk("path",{d:"M"+(left?ML-10:ML+W+10)+","+(MT+p)+"L"+(left?ML:ML+W)+","+(MT+l.pos)});}
      if(pinned.has(key(l)))lab.classList.add("pinned");
      lead.setAttribute("class","lead "+l.side+(l.tr?" transit":"")+(isB(l)?" who-b":""));
      g.append(lead,lab);
    });
  }
}
// A paran shows when one of its bodies is picked in the Parans menu and BOTH
// have their lines on the map, so a hover never lights a hidden line. Kaycee,
// 10 October: with Earth's lines off, Earth's parans should be too. Checking
// only the partner left Earth in whenever Parans was set to All.
const pairOk=d=>(st.parans.has(d.body)||st.parans.has(d.body2))&&lineOn(d.body)&&lineOn(d.body2);
function paint(){
  const sideOk=d=>!bothOff&&(st.side==="both"||d.side===st.side);
  for(const l of LN)l.el.classList.toggle("off",!lineVisible(l));
  for(const el of document.querySelectorAll("#w-parans [data-side]"))
    el.classList.toggle("off",!(sideOk(el.dataset)&&pairOk(el.dataset)&&(st.angles.has(el.dataset.angle)||st.angles.has(el.dataset.angle2))&&!(tr.on&&tr.alone)&&(el.dataset.who!=="b"||rel.on)&&(el.dataset.who==="b"?party.b:party.a)));
  root.classList.toggle("tr-on",tr.on);
  root.classList.toggle("rel-on",rel.on&&!!PB);
  for(const c of document.querySelectorAll(".w-opt[data-kind]"))c.classList.toggle("on",st[c.dataset.kind].has(c.dataset.chip));
  for(const x of EXTRAS)root.classList.toggle("x-"+x,st.extras.has(x));
  for(const k in ALL){const nEl=root.querySelector('[data-dd="'+k+'"] .n');if(nEl)nEl.textContent=st[k].size===ALL[k].length?"All":st[k].size?st[k].size:"None";}
  if(typeof drawGates==="function")drawGates();
  draw();
  if(typeof renderHere==="function"){renderHere();renderCompare();if(finding)renderFind()}
}
if(document.getElementById("w-side"))document.getElementById("w-side").onclick=e=>{const b=e.target.closest(".w-pill");if(!b)return;
  document.querySelectorAll("#w-side .w-pill").forEach(p=>p.classList.toggle("on",p===b));st.side=b.dataset.v;paint()};
root.addEventListener("click",e=>{
  const dd=e.target.closest(".dd");
  for(const m of document.querySelectorAll(".dd.open"))if(m!==dd)m.classList.remove("open");
  if(dd&&e.target.closest(".dd>button")){dd.classList.toggle("open");return}
  const t=e.target.closest("button,.w-opt");if(!t)return;
  if(t.dataset.all){st[t.dataset.all]=new Set(ALL[t.dataset.all]);return paint()}
  if(t.dataset.none){st[t.dataset.none].clear();return paint()}
  if(t.dataset.lsback){lsFrom=null;buildLS();return paint()}
  if(t.dataset.kind){const s=st[t.dataset.kind],b=t.dataset.chip;s.has(b)?s.delete(b):s.add(b);paint();if(t.dataset.kind==="ls"&&here)renderHere()}
});
const tip=document.getElementById("w-tip");
function hot(d,on){
  const t=(d.transit?'[data-transit]':':not([data-transit])')+(d.who==="b"?'[data-who="b"]':':not([data-who])');
  const q=(b,a)=>'#w-lines [data-side="'+d.side+'"][data-body="'+b+'"][data-angle="'+a+'"]'+t+', #w-labels [data-side="'+d.side+'"][data-body="'+b+'"][data-angle="'+a+'"]'+t;
  for(const el of document.querySelectorAll(q(d.body,d.angle)+(d.body2?", "+q(d.body2,d.angle2):"")))el.classList.toggle("hot",on);
  if(d.body2)for(const p of PR)if((p.who||"")===(d.who||"")&&p.side===d.side&&p.a===d.body&&p.angleA===d.angle&&p.b===d.body2&&p.angleB===d.angle2&&!p.el.classList.contains("off"))p.el.classList.toggle("hot",on);
}
let cur=null;
document.getElementById("w-map").addEventListener("mousemove",e=>{
  const el=e.target.closest("[data-side]");
  if(cur&&cur!==el){cur.classList.remove("hot");hot(cur.dataset,false)}
  cur=el;
  if(!el&&st.gates.size&&typeof gateTip==="function"){const html=gateTip(e);if(html){tip.innerHTML=html;tip.style.display="block";tip.style.transform="none";
    tip.style.left=Math.min(e.clientX+14,innerWidth-tip.offsetWidth-8)+"px";tip.style.top=Math.min(e.clientY+14,innerHeight-tip.offsetHeight-8)+"px";return}}
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
document.getElementById("w-map").addEventListener("mouseleave",()=>{tip.style.display="none";if(cur){cur.classList.remove("hot");hot(cur.dataset,false);cur=null}});
// ---- What's here -------------------------------------------------------
// Distances are great-circle miles from the clicked spot to each line.
// Grades, proposed 10 October for Kaycee to adjust: within 300 miles Strong,
// to 500 Moderate, to 700 Mild, past 700 not listed. A paran is a latitude, so
// it is graded on the 1 degree orb she set: within a third of it Strong, two
// thirds Moderate, the whole degree Mild.
const R=3958.8,RAD=Math.PI/180;
const GRADES=[[300,3,"Strong"],[500,2,"Moderate"],[700,1,"Mild"]];
const gradeMi=mi=>GRADES.find(g=>mi<=g[0]);
const gradeLat=d=>d<=ORB/3?GRADES[0]:d<=ORB*2/3?GRADES[1]:d<=ORB?GRADES[2]:null;
function hav(la1,lo1,la2,lo2){const a=Math.sin((la2-la1)*RAD/2)**2+Math.cos(la1*RAD)*Math.cos(la2*RAD)*Math.sin((lo2-lo1)*RAD/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(a)))}
function distTo(l,lat,lon){
  if(l.angle==="MC"||l.angle==="IC"){
    // A meridian is half a great circle, pole to pole.
    let dl=Math.abs(((l.runs[0][0][0]-lon)%360+540)%360-180)*RAD;
    if(dl>Math.PI/2)return R*(Math.PI/2-Math.abs(lat)*RAD);
    return R*Math.asin(Math.abs(Math.sin(dl))*Math.cos(lat*RAD));
  }
  let best=Infinity;
  for(const run of l.runs)for(let i=1;i<run.length;i++){
    const a=run[i-1],b=run[i];
    if(Math.min(a[1],b[1])>lat+12||Math.max(a[1],b[1])<lat-12)continue;
    const n=Math.max(1,Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]))/0.2));
    for(let k=0;k<=n;k++){const t=k/n;best=Math.min(best,hav(lat,lon,a[1]+t*(b[1]-a[1]),a[0]+t*(b[0]-a[0])))}
  }
  return best;
}
let here=null;   // {lat, lon, name, country}
// Lines clicked to keep them lit, by identity: side, body and angle.
const pinned=new Set();
const key=l=>(isB(l)?"B|":"")+(l.tr?"T|":"")+l.side+"|"+l.body+"|"+l.angle;
const ANGLE_NAME={ASC:"Ascendant",DSC:"Descendant",MC:"Midheaven",IC:"IC",LS:"Local Space"};
// Saved places stay in this browser for now. In the live chart they belong to
// the account that saved them.
const STORE="acg-places|"+PERSON;
let saved=[];try{saved=JSON.parse(localStorage.getItem(STORE)||"[]")}catch(e){saved=[]}
function persist(){if(account)return;try{localStorage.setItem(STORE,JSON.stringify(saved))}catch(e){}}
// Signed in, saved places live in the person's journal instead of this
// browser, and any kept here move over on the first visit. Kaycee,
// 2026-10-11: one journal per account; places are its first entries.
let account=false;
const fromEntry=e=>({id:e.id,n:(e.place&&e.place.name)||fmtLat(e.place.lat)+", "+fmtLon(e.place.lon),c:(e.place&&e.place.country)||"",lat:e.place.lat,lon:e.place.lon});
const asPlace=s=>({name:s.n,country:s.c,lat:s.lat,lon:s.lon});
async function journal(method,body,query){
  const r=await fetch(API.journal+(query||""),{method,headers:body?{"content-type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
  if(r.status===401)return null;
  const j=await r.json().catch(()=>({ok:false}));
  if(!j.ok)throw new Error("journal");
  return j;
}
async function joinAccount(){
  if(!API.journal||!opts.token)return;
  try{
    const j=await journal("GET",null,"?kind=place&token="+opts.token);if(!j)return;
    account=true;
    let entries=j.entries;
    if(saved.length){const k=await journal("POST",{token:opts.token,places:saved.map(asPlace)});if(k)entries=k.entries;
      try{localStorage.removeItem(STORE)}catch(e){}}
    saved=entries.filter(e=>e.place).map(fromEntry);
    renderCompare();renderHere();redraw();
  }catch(e){account=false}
}
/** What reaches one place, under the current menus. Shared by the panel and the comparison. */
function analyze(lat,lon){
  const sideOk=s=>st.side==="both"||s===st.side;
  const rows=[],prs=[];
  for(const l of LN){
    if(!lineVisible(l))continue;
    const mi=distTo(l,lat,lon),g=gradeMi(mi);if(g)rows.push({l,mi,g});
  }
  for(const p of PR){
    if(tr.on&&tr.alone)continue;
    if(isB(p)&&!rel.on)continue;
    if(!(isB(p)?party.b:party.a))continue;
    if(!sideOk(p.side)||!lineOn(p.a)||!lineOn(p.b)||!(st.angles.has(p.angleA)||st.angles.has(p.angleB)))continue;
    const d=Math.abs(p.lat-lat),g=gradeLat(d);if(g)prs.push({p,d,g});
  }
  rows.sort((a,b)=>a.mi-b.mi);prs.sort((a,b)=>a.d-b.d);
  return {rows,prs};
}
function nearestCity(lat,lon){let best=null,d=75;for(const c of CITIES){const m=hav(lat,lon,c.lat,c.lon);if(m<d){d=m;best=c}}return best}
function ringPath(lat,lon,mi){
  const d=mi/R,la=lat*RAD,pts=[];
  for(let b=0;b<=360;b+=3){const br=b*RAD;
    const la2=Math.asin(Math.sin(la)*Math.cos(d)+Math.cos(la)*Math.sin(d)*Math.cos(br));
    const lo2=lon+Math.atan2(Math.sin(br)*Math.sin(d)*Math.cos(la),Math.cos(d)-Math.sin(la)*Math.sin(la2))/RAD;
    pts.push([lo2,la2/RAD])}
  return "M"+pts.map(p=>X(p[0]).toFixed(1)+","+Y(p[1]).toFixed(1)).join("L")+"Z";
}
function drawHere(){
  const r=document.getElementById("w-rings"),p=document.getElementById("w-pin");r.replaceChildren();p.replaceChildren();
  drawSaved();
  if(!here)return;
  r.append(mk("path",{class:"ring",d:ringPath(here.lat,here.lon,700)}),mk("path",{class:"ring inner",d:ringPath(here.lat,here.lon,300)}));
  p.append(mk("circle",{class:"pin",cx:X(here.lon),cy:Y(here.lat),r:7}));
  // A chosen city is named beside its pin, whatever the zoom: a small town is
  // not one of the map's own city labels, and the pin alone had to be hunted
  // for. Kaycee, 2026-10-11. A plain click stays a pin.
  if(here.name&&!/^Near /.test(here.name)){
    const t=mk("text",{class:"pin-l",x:X(here.lon)+11,y:Y(here.lat)+5});t.textContent=here.name;p.append(t);
  }
}
const fmtLat=v=>Math.abs(v).toFixed(1)+"°"+(v>=0?"N":"S"),fmtLon=v=>Math.abs(v).toFixed(1)+"°"+(v>=0?"E":"W");
const tag=(side,body,angle,isT,bWho)=>'data-side="'+side+'" data-body="'+body+'" data-angle="'+angle+'"'+(isT?' data-transit="1"':'')+(bWho?' data-who="b"':'');
const gradePill=g=>'<span class="gr g'+g[1]+'">'+g[2]+'</span>';
const isSaved=h=>saved.some(s=>Math.abs(s.lat-h.lat)<1e-4&&Math.abs(s.lon-h.lon)<1e-4);
function renderHere(){
  if(tlOpen&&tr.on&&here)fetchTimeline();
  const box=document.getElementById("w-here");
  if(!here&&!pinned.size){box.classList.remove("open");return}
  // A pinned line: her Delphi Basic for the planet, and the angle by name.
  const cards=[...pinned].map(k=>{const bk=k.startsWith("B|"),k2=k.replace(/^B\|/,""),isT=k2.startsWith("T|"),[side,body,angle]=k2.replace(/^T\|/,"").split("|");
    if(bk&&!PB)return"";
    const nm=rel.on&&PB?first(bk?PB.person:PERSON)+" · ":"";
    return '<div class="w-card" '+tag(side,body,angle,isT,bk)+'><button class="un" data-un="'+k+'" title="Unpin">&times;</button>'+
      '<b>'+(isT?"Transit "+body+" · "+SIDE[side]+" ":nm+SIDE[side]+" "+body+" · ")+ANGLE_NAME[angle]+'</b><div class="deg">'+body+" in "+((isT?TWHERE:(bk?PB.where:WHERE)[side])[body]||"")+' <span class="ap">'+angle+'</span></div>'+
      (BASIC[body]?'<p>'+BASIC[body]+'</p>':'')+'</div>'}).join("");
  if(!here){box.innerHTML='<button class="x" title="Close">&times;</button>'+cards;box.classList.add("open");return}
  const {rows,prs}=analyze(here.lat,here.lon);
  box.innerHTML='<button class="x" title="Close">&times;</button>'+cards+
    '<h2>'+(here.name||fmtLat(here.lat)+", "+fmtLon(here.lon))+'</h2>'+
    '<div class="co">'+(here.name?(here.country?here.country+" · ":"")+fmtLat(here.lat)+", "+fmtLon(here.lon):"")+'</div>'+
    (isSaved(here)?'<button class="save done">Saved</button>':'<button class="save" data-save="1">Save Place</button>')+
    ' <button class="w-pill pdf" data-pdf="place">View Place Report</button>'+
    (st.ls.size?' <button class="w-pill pdf" data-lshere="1">Local Space From Here</button>':'')+
    relocHtml()+timelineHtml()+
    '<h3>Lines</h3>'+(rows.length?rows.map(r=>'<div class="hr" '+tag(r.l.side,r.l.body,r.l.angle,r.l.tr,isB(r.l))+'>'+
      '<span class="gl '+r.l.side+(r.l.tr?" transit":"")+(isB(r.l)?" who-b":"")+'">'+GLYPH[r.l.body]+'</span><span class="nm">'+(r.l.tr?"Transit "+r.l.body+' <span class="was">'+SIDE[r.l.side]+'</span>':whoName(r.l)+SIDE[r.l.side]+" "+r.l.body)+' <span class="ap">'+r.l.angle+'</span></span>'+
      '<span class="mi">'+Math.round(r.mi)+' mi</span>'+gradePill(r.g)+'</div>').join(""):'<div class="none">No lines within 700 miles.</div>')+
    '<h3>Parans</h3>'+(prs.length?prs.map(r=>'<div class="hr" '+tag(r.p.side,r.p.a,r.p.angleA,false,isB(r.p))+' data-body2="'+r.p.b+'" data-angle2="'+r.p.angleB+'">'+
      '<span class="nm">'+whoName(r.p)+SIDE[r.p.side]+" "+r.p.a+' <span class="ap">'+r.p.angleA+'</span> '+r.p.b+' <span class="ap">'+r.p.angleB+'</span></span>'+
      '<span class="mi">'+r.d.toFixed(1)+'°</span>'+gradePill(r.g)+'</div>').join(""):'<div class="none">No parans within 1° of this latitude.</div>');
  box.classList.add("open");
}
// ---- Relocated chart ----------------------------------------------------
// The birth moment cast at the chosen place, both sides, by the provider via
// the local server. The planets do not move; angles and houses do.
const reloc=new Map();   // "lat,lon" -> result, or "loading" / "failed"
const ord=n=>n+(n%100>10&&n%100<14?"th":["th","st","nd","rd"][n%10]||"th");
const keyOf=pl=>pl.lat.toFixed(4)+","+pl.lon.toFixed(4);
// The second person's casts are kept under their own birth, so a different
// second person never borrows the last one's.
const BK=()=>"|b|"+(PB?PB.cast.p:"");
function relocKey(){return keyOf(here)}
const placeName=pl=>pl.name?pl.name.replace(/^Near /,"")+(pl.country?", "+pl.country:""):fmtLat(pl.lat)+", "+fmtLon(pl.lon);
let relOpen=false;   // the section starts closed
// ---- Upcoming transits to a place --------------------------------------------
// Under the Transit chart type: when each transiting body comes within her
// orbs (one degree, three for the Sun and the Moon) of this place's relocated
// angles, for a year from the moment on the date picker. Kaycee, 2026-10-11.
let tlOpen=false;
const tlCache=new Map();
const tlBodies=()=>[...BODIES.filter(b=>st.lines.has(b)&&(b!=="Moon"||st.trx.has("Moon"))),...EXTRAS.filter(b=>st.extras.has(b))];
const tlKey=()=>keyOf(here)+"|"+tr.at.slice(0,16)+"|"+tlBodies().join(",");
function fetchTimeline(){
  if(!API.timeline||!here||!tr.at)return;const k=tlKey();if(tlCache.has(k))return;
  tlCache.set(k,"loading");const at=tr.at.slice(0,16);
  const q=new URLSearchParams({lat:here.lat,lon:here.lon,date:at.slice(0,10),time:at.slice(11,16),bodies:tlBodies().join(","),...CAST});
  fetch(withToken(API.timeline+"?"+q)).then(r=>r.json()).then(r=>{tlCache.set(k,r.ok?r.events:"failed");if(here)renderHere()})
    .catch(()=>{tlCache.set(k,"failed");if(here)renderHere()});
}
const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const shortDay=iso=>{const d=new Date(iso);return MON[d.getUTCMonth()]+" "+d.getUTCDate()+", "+d.getUTCFullYear()};
function timelineHtml(){
  if(!tr.on||!API.timeline)return"";
  const head='<button class="reltog'+(tlOpen?" open":"")+'" data-tltog="1">Upcoming Transits</button>';
  if(!tlOpen)return head;
  const r=tlCache.get(tlKey());
  if(!r||r==="loading")return head+'<div class="none">Working it out…</div>';
  if(r==="failed")return head+'<div class="none">Could not work out the transits here.</div>';
  const sides=st.side==="both"?["personality","design"]:[st.side];
  const ev=r.filter(e=>sides.includes(e.side)&&st.angles.has(e.angle));
  if(!ev.length)return head+'<div class="none">No transits to these angles in the coming year.</div>';
  return head+'<table class="rt tl"><tr><th></th><th>Angle</th><th>Within Orb</th><th>Exact</th></tr>'+ev.map(e=>
    '<tr class="hr" '+tag(e.side,e.body,e.angle,true)+'><td><span class="gl">'+GLYPH[e.body]+'</span> Transit '+e.body+'</td>'+
    '<td>'+SIDE[e.side]+" "+ANGLE_NAME[e.angle]+'</td>'+
    '<td class="when">'+(e.start?shortDay(e.start):"Now")+" to "+(e.end?shortDay(e.end):"beyond")+'</td>'+
    '<td class="when">'+(e.exact.length?e.exact.map(shortDay).join(", "):"")+'</td></tr>').join("")+'</table>';
}
/** Cast a place; with wheels for the panel, without for the comparison. */
// The other person of a Relationship is cast from the birth their connection
// carries (who=b); the chart's own person from the chart link alone.
const gatesOf=g=>({pg:Object.values(g.personality).map(x=>x.split(".")[0]).join(","),dg:Object.values(g.design).map(x=>x.split(".")[0]).join(",")});
function fetchReloc(pl,wheels,done,who){
  if(!live||(who==="b"&&!PB))return;const k=keyOf(pl)+(who==="b"?BK():""),have=reloc.get(k);
  if(have==="loading"||(have&&have.ok&&(have.svg||!wheels)))return;
  reloc.set(k,"loading");
  const q=who==="b"?{who:"b",lat:pl.lat,lon:pl.lon,name:PB.person,at:placeName(pl),wheels:wheels?"1":"0",place:PB.cast.place,p:PB.cast.p,d:PB.cast.d,...gatesOf(PB.gateOf)}
    :{lat:pl.lat,lon:pl.lon,name:PERSON,at:placeName(pl),wheels:wheels?"1":"0",...CAST,...GATES};
  fetch(withToken(API.relocate+"?"+new URLSearchParams(q))).then(r=>r.json())
    .then(r=>{reloc.set(k,r.ok?r:"failed");done()})
    .catch(()=>{reloc.set(k,"failed");done()});
}
const fmtDeg=v=>{let d=Math.floor(v),m=Math.round((v-d)*60);if(m===60){d++;m=0}return d+"°"+(m<10?"0":"")+m+"'"};
// Whose gate a relocated angle lands in, from that person's own activations,
// among the bodies in view.
function ownGate(g,gateOf){
  const on=new Set(chartBodies()),who=[];
  for(const sd of ["personality","design"])for(const [pl,gl] of Object.entries(gateOf[sd]))
    if(on.has(pl)&&+gl.split(".")[0]===g)who.push(SIDE[sd]+" "+pl+" "+gl);
  return who;
}
const pairOn=()=>rel.on&&!!PB;
function relocHtml(){
  if(!live)return"";
  const head='<button class="reltog'+(relOpen?" open":"")+'" data-reltog="1">Relocated Chart</button>';
  if(!relOpen)return head;
  return head+(party.a||!pairOn()?relocBlock("a"):"")+(pairOn()&&party.b?relocBlock("b"):"");
}
// One person's relocated chart: angles here and natal with their gates (a gate
// that person carries in gold, named once beneath), then the planets that
// change house. On a Relationship each person has their own, under their name.
function relocBlock(who){
  const isb=who==="b",r=reloc.get(relocKey()+(isb?BK():""));
  const NAT=isb?PB.natal:NATAL,GO=isb?PB.gateOf:GATE_OF,name=isb?PB.person:PERSON;
  const top=pairOn()?'<div class="relwho '+(isb?"pb":"pa")+'">'+name+'</div>':"";
  if(!r||r==="loading")return top+'<div class="none">Casting…</div>';
  if(r==="failed")return top+'<div class="none">Could not cast this place.</div>';
  const sides=st.side==="both"?["personality","design"]:[st.side];
  const ANGULAR=new Set([1,4,7,10]);
  let h=top+'<div class="rel"><button class="wheelbtn" data-wheel="'+who+'">View Chart</button>';
  const mine=[];
  for(const sd of sides){
    h+='<table class="rt"><tr><th>'+SIDE[sd]+'</th><th>Here</th><th>Gate</th><th class="n">Natal</th><th class="n">Gate</th></tr>';
    for(const a of ["ASC","DSC","MC","IC"]){const R=r[sd].angles[a],N=NAT[sd].angles[a],w2=ownGate(R.gate,GO);
      if(w2.length)mine.push({g:R.gate+"."+R.line,at:SIDE[sd]+" "+ANGLE_NAME[a],who:w2});
      h+='<tr><td>'+ANGLE_NAME[a]+'</td><td>'+R.sign+" "+fmtDeg(R.deg)+'</td><td class="g'+(w2.length?" own":"")+'">'+R.gate+"."+R.line+'</td>'+
        '<td class="n">'+N.text+'</td><td class="n g">'+N.gate+"."+N.line+'</td></tr>'}
    h+='</table>';
  }
  if(mine.length)h+='<div class="mine"><b>'+(pairOn()?"In "+first(name)+"'s Chart":"In Your Chart")+'</b>'+mine.map(m=>'<div><span class="own">'+m.g+'</span> '+m.at+' · '+m.who.join(", ")+'</div>').join("")+'</div>';
  const moved=[];
  for(const sd of sides)for(const b of chartBodies()){
    const a=NAT[sd].house[b],z=r[sd].house[b];if(a&&z&&a!==z)moved.push({sd,b,a,z})}
  h+='<h3>Planets Changing House</h3>'+(moved.length?'<table class="rt ht"><tr><th></th><th>Natal</th><th>Here</th></tr>'+moved.map(m=>
    '<tr class="hr" '+tag(m.sd,m.b,"",false,isb)+'><td><span class="gl '+m.sd+(isb?" who-b":"")+'">'+GLYPH[m.b]+'</span> '+SIDE[m.sd]+" "+m.b+'</td>'+
    '<td class="n">'+ord(m.a)+'</td><td'+(ANGULAR.has(m.z)?' class="own" title="Angular house"':'')+'>'+ord(m.z)+'</td></tr>').join("")+'</table>'
    :'<div class="none">No planet changes house here.</div>');
  return h+'</div>';
}
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
function utcWhen(iso){const m=/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})/.exec(iso);if(!m)return iso;const h=+m[4];
  return MONTHS[+m[2]-1]+" "+(+m[3])+", "+m[1]+" · "+(h%12===0?12:h%12)+":"+m[5]+" "+(h<12?"AM":"PM")+" UTC"}
// Personality and design each on their own relocated horizon, or both
// together on the personality's, as the Astrology view draws a natal chart.
function showWheel(r,where,which,who){
  who=who||"a";
  const w=document.getElementById("w-wheel");
  w.querySelector(".box").innerHTML='<button class="x" title="Close">&times;</button><h2>Relocated Chart · '+(pairOn()?(who==="b"?PB.person:PERSON)+" · ":"")+where+'</h2>'+
    '<div class="wtabs">'+[["personality","Personality"],["design","Design"],["both","Both"]].map(([k,t])=>'<button class="w-pill'+(k===which?" on":"")+'" data-wtab="'+k+'">'+t+'</button>').join("")+'<button class="w-pill snap" data-snapwheel="1">Save Chart Image</button></div>'+
    // A one-sided wheel has no corner legend (that drawing is shared with the
    // live charts and left alone), so the window says which side it is.
    (which==="both"?"":'<div class="wsub" style="color:'+(which==="design"?"var(--design)":"var(--ink)")+'"><b>'+SIDE[which]+'</b> · '+utcWhen(which==="design"?(who==="b"&&PB?PB.cast:CAST).d:(who==="b"&&PB?PB.cast:CAST).p)+" · "+where+'</div>')+
    r.svg[which];
  w.dataset.where=where;w.dataset.which=which;w.dataset.who=who;w.classList.add("open");
}
document.getElementById("w-wheel").addEventListener("click",e=>{
  if(e.target.id==="wheel"||e.target.closest(".x"))return e.currentTarget.classList.remove("open");
  const t=e.target.closest("[data-wtab]");if(t){const who=e.currentTarget.dataset.who;const r=reloc.get(relocKey()+(who==="b"?BK():""));if(r&&r.svg)showWheel(r,e.currentTarget.dataset.where,t.dataset.wtab,who)}
  if(e.target.closest("[data-snapwheel]")){const w=e.currentTarget,which=w.dataset.which;
    const who=w.dataset.who;snapshot(w.querySelector(".box svg"),[who==="b"&&PB?PB.person:PERSON,"Relocated Chart · "+w.dataset.where,
      which==="both"?"Personality + Design":SIDE[which]+" · "+utcWhen(which==="design"?(who==="b"&&PB?PB.cast:CAST).d:(who==="b"&&PB?PB.cast:CAST).p)],
      (w.dataset.who==="b"&&PB?PB.person:PERSON)+" - Relocated Chart - "+w.dataset.where.split(",")[0]+" - "+(which==="both"?"Both":SIDE[which])+".png")}
});
// Hovers on the relocated wheel, read from the glyph's own tags: the side it
// carries and the body it names. Same pills as the Astrology view, with the
// house it lands in at this place and its gate.
const WHEEL_NAME={True_Node:"North Node",Mean_Node:"South Node",Mean_Lilith:"Lilith"};
const ANGLE_OF={As:["asc","Ascendant"],Ds:["asc","Descendant"],Mc:["mc","Midheaven"],Ic:["mc","IC"]};
const opp=sd=>{const z=ZOD.indexOf(sd.sign);return {sign:ZOD[(z+6)%12],deg:sd.deg}};
const ZOD=["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
function wheelTip(el){
  const w=document.getElementById("w-wheel"),which=w.dataset.which,isb=w.dataset.who==="b";
  const r=reloc.get(relocKey()+(isb?BK():""));if(!r||!r.svg)return"";
  const GO=isb&&PB?PB.gateOf:GATE_OF;
  const pill=(t,c)=>t?'<span class="w-pill '+(c||String(t).toLowerCase())+'">'+t+'</span>':"";
  if(el.dataset.aplanet){
    const sd=el.dataset.side==="design"?"design":"personality";
    const pl=r[sd].planets[el.dataset.aplanet];if(!pl)return"";
    const label=WHEEL_NAME[el.dataset.aplanet]||pl.label,gate=GO[sd][label];
    return "<b>"+SIDE[sd]+" "+label+" in "+pl.sign+" "+fmtDeg(pl.deg)+"</b>"+
      pill(pl.quality)+pill(pl.element)+(pl.house?pill("House "+pl.house,"house"):"")+(gate?pill("Gate "+gate,"house"):"")+
      ([1,4,7,10].includes(pl.house)?pill("Angular","ang"):"")+
      (BASIC[label]?'<span class="tb">'+BASIC[label]+'</span>':"");
  }
  const a=ANGLE_OF[el.dataset.angle];if(!a)return"";
  const sd=which==="design"?"design":"personality",v=r[sd][a[0]];
  const at=(a[1]==="Descendant"||a[1]==="IC")?opp(v):v;
  const key2={Ascendant:"ASC",Descendant:"DSC",Midheaven:"MC",IC:"IC"}[a[1]],G=r[sd].angles[key2];
  return "<b>"+SIDE[sd]+" "+a[1]+" in "+at.sign+" "+fmtDeg(at.deg)+"</b>"+pill("Gate "+G.gate+"."+G.line,"house");
}
document.getElementById("w-wheel").addEventListener("mousemove",e=>{
  const el=e.target.closest("[data-aplanet],[data-angle]");
  const html=el?wheelTip(el):"";
  if(!html){tip.style.display="none";return}
  tip.innerHTML=html;tip.style.display="block";tip.style.transform="none";
  const tw=tip.offsetWidth,th=tip.offsetHeight;
  let tx=e.clientX+14,ty=e.clientY+14;if(tx+tw>innerWidth-8)tx=e.clientX-14-tw;if(ty+th>innerHeight-8)ty=e.clientY-14-th;
  tip.style.left=Math.max(8,tx)+"px";tip.style.top=Math.max(8,ty)+"px";
});
document.getElementById("w-wheel").addEventListener("mouseleave",()=>tip.style.display="none");

// ---- Save Image ------------------------------------------------------------
// The live chart's method: copy the drawing as it stands, bake every computed
// style into it, carry the font inside, draw it at twice the size, and add a
// footer naming what it shows with the brand marks. Handed over as a file.
const BAKE=["fill","fill-opacity","stroke","stroke-width","stroke-opacity","stroke-dasharray","stroke-linecap",
  "stroke-linejoin","opacity","display","visibility","font-family","font-size","font-weight","letter-spacing","paint-order"];
function bake(src,dst){
  const a=src.querySelectorAll("*"),b=dst.querySelectorAll("*");
  const apply=(from,to)=>{const cs=getComputedStyle(from);let css="";
    for(const k of BAKE){const v=cs.getPropertyValue(k);if(v&&v!=="none"||k==="display"||k==="fill")css+=k+":"+v+";"}
    to.setAttribute("style",css)};
  apply(src,dst);for(let i=0;i<a.length&&i<b.length;i++)apply(a[i],b[i]);
}
function snapshot(svgEl,lines,filename){
  if(!svgEl)return;
  const vb=(svgEl.getAttribute("viewBox")||"").trim().split(/[ ,]+/).map(Number);
  const vw=vb[2]||svgEl.clientWidth,vh=vb[3]||svgEl.clientHeight;
  const clone=svgEl.cloneNode(true);bake(svgEl,clone);
  clone.setAttribute("xmlns","http://www.w3.org/2000/svg");clone.setAttribute("width",vw);clone.setAttribute("height",vh);
  clone.removeAttribute("class");clone.style.removeProperty("max-height");clone.style.removeProperty("max-width");
  const sty=document.createElementNS("http://www.w3.org/2000/svg","style");sty.textContent=FONTCSS;clone.insertBefore(sty,clone.firstChild);
  const xml=new XMLSerializer().serializeToString(clone);
  const img=new Image();
  img.onload=()=>{
    const S=2,foot=Math.max(150,62+lines.length*26),cv=document.createElement("canvas");cv.width=vw*S;cv.height=vh*S+foot;
    const g=cv.getContext("2d");g.fillStyle="#ffffff";g.fillRect(0,0,cv.width,cv.height);g.drawImage(img,0,0,vw*S,vh*S);
    const y0=vh*S+8;g.strokeStyle="rgba(132,80,149,.35)";g.lineWidth=2;g.beginPath();g.moveTo(52,y0);g.lineTo(cv.width-52,y0);g.stroke();
    const logo=document.querySelector(".brandmark.logo"),know=document.querySelector(".brandmark.know");
    if(logo&&logo.complete)g.drawImage(logo,52,y0+28,132,66);
    if(know&&know.complete)g.drawImage(know,cv.width-52-170,y0+40,170,42);
    g.fillStyle="#1c1a2e";g.font="600 24px Montserrat, sans-serif";g.fillText(lines[0],210,y0+50);
    g.fillStyle="rgba(28,26,46,.6)";g.font="400 18px Montserrat, sans-serif";
    lines.slice(1).forEach((t,i)=>g.fillText(t,210,y0+80+i*26));
    const give=(href,revoke)=>{const a=document.createElement("a");a.download=filename;a.href=href;a.rel="noopener";document.body.appendChild(a);a.click();document.body.removeChild(a);if(revoke)setTimeout(()=>URL.revokeObjectURL(href),60000)};
    if(cv.toBlob)cv.toBlob(b=>b&&window.URL?give(URL.createObjectURL(b),true):give(cv.toDataURL("image/png"),false),"image/png");
    else give(cv.toDataURL("image/png"),false);
  };
  img.src="data:image/svg+xml;base64,"+btoa(unescape(encodeURIComponent(xml)));
}
// ---- Reports ------------------------------------------------------------------
// Find My Places and Compare Places as a page to save as PDF, with the map as
// it stands. Kaycee, 2026-10-11. Opened in its own window with the browser's
// print, whose Save as PDF every browser has, so no PDF library rides along in
// every chart.
function mapPng(cb){
  const svgEl=document.getElementById("w-map");
  const vb=(svgEl.getAttribute("viewBox")||"").trim().split(/[ ,]+/).map(Number);
  const vw=vb[2],vh=vb[3];
  const clone=svgEl.cloneNode(true);bake(svgEl,clone);
  clone.setAttribute("xmlns","http://www.w3.org/2000/svg");clone.setAttribute("width",vw);clone.setAttribute("height",vh);
  clone.removeAttribute("class");
  const sty=document.createElementNS("http://www.w3.org/2000/svg","style");sty.textContent=FONTCSS;clone.insertBefore(sty,clone.firstChild);
  const img=new Image();
  img.onload=()=>{const S=2,cv=document.createElement("canvas");cv.width=vw*S;cv.height=vh*S;
    const g=cv.getContext("2d");g.fillStyle="#ffffff";g.fillRect(0,0,cv.width,cv.height);g.drawImage(img,0,0,vw*S,vh*S);cb(cv.toDataURL("image/png"))};
  img.onerror=()=>cb("");
  img.src="data:image/svg+xml;base64,"+btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(clone))));
}
const RCSS='body{font-family:Montserrat,-apple-system,sans-serif;color:#1c1a2e;margin:0;padding:28px 34px}'+
  '.hd{display:flex;align-items:center;gap:20px;border-bottom:2px solid rgba(132,80,149,.35);padding-bottom:12px;margin-bottom:14px}'+
  '.hd img{width:120px}.hd .nm{font-size:22px;font-weight:600}.hd .dt{font-size:12px;color:#6b6790;margin-top:3px}'+
  'h1{font-size:18px;color:#845095;margin:6px 0 4px}.set{font-size:11.5px;color:#6b6790;margin:2px 0}'+
  '.map{width:100%;border:1px solid #e4dce9;border-radius:6px;margin:12px 0 16px}'+
  'table{border-collapse:collapse;width:100%;font-size:11px}th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #eee7f1;vertical-align:top}'+
  'th{font-size:10.5px;color:#6b6790;font-weight:600}tr.w-sec td,.sec{font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#6b6790;padding-top:12px}'+
  'tr.sum td{font-weight:600}.ap,.gr{display:inline-block;padding:1px 6px;border-radius:999px;font-size:8.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}'+
  '.ap{background:#845095;color:#fff}.gr.g3{background:#c79a2e;color:#fff}.gr.g2{background:#ecd9a4;color:#6b5210}.gr.g1{border:1px solid #d8c48c;color:#8a6a14}'+
  '.own{color:#9c7415;font-weight:600}.was{color:#6b6790;font-weight:400}.mi{color:#4b4553}'+
  '.relwho{font-weight:600;font-size:13px;margin:12px 0 2px}.relwho.pa{color:#845095}.relwho.pb{color:#0d9488}'+
  '.rt td.own::after{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:#c79a2e;margin-left:4px;vertical-align:middle}'+
  '.mine{margin:8px 0 4px;padding:6px 8px;background:#fffbf0;border:1px solid #ecd9a4;border-radius:6px;font-size:10.5px;line-height:1.6}.mine b{display:block;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#8a6a14}'+
  'h3{font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#6b6790;margin:16px 0 4px}.n{color:#6b6790}.none{color:#6b6790;font-size:11px}'+
  '.wh{page-break-inside:avoid;margin:14px 0 6px}.wh svg{width:100%;max-width:560px;height:auto;display:block;margin:4px auto 0}.wsub{font-size:11.5px;color:#4b4553}'+
  'tr{page-break-inside:avoid}@page{margin:14mm}';
// win: a window already opened on the tap itself, for a report that has to
// wait for something first (a browser refuses a window opened later).
function openReport(title,settings,table,win){
  const w=win||window.open("","_blank");
  if(!w)return;
  w.document.write('<!doctype html><title>'+PERSON+' - '+title+'</title><p style="font-family:sans-serif;padding:30px">…</p>');
  mapPng(png=>{
    const logo=document.querySelector(".brandmark.logo");
    const st=mapState();
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+PERSON+' - '+title+'</title><style>'+FONTCSS+RCSS+'</style></head><body>'+
      '<div class="hd">'+(logo?'<img src="'+logo.src+'" alt="">':'')+'<div><div class="nm">'+PERSON+'</div>'+
      st.slice(1,st.length-1).map(t=>'<div class="dt">'+t+'</div>').join("")+'</div></div>'+
      '<h1>'+title+'</h1>'+settings.map(t=>'<div class="set">'+t+'</div>').join("")+
      (png?'<img class="map" src="'+png+'" alt="">':'')+table+'</body></html>');
    w.document.close();
    const go=()=>{w.focus();w.print()};
    const im=w.document.querySelector("img.map");
    if(im&&!im.complete)im.onload=go;else setTimeout(go,300);
  });
}
function findReport(){
  const F=lastFind;if(!F||!F.top.length)return;
  const head=F.groups.map(g=>'<th>'+(pairOn()?first(g.who==="b"?PB.person:PERSON)+" · ":"")+SIDE[g.sd]+" "+g.b+'</th>').join("");
  const table='<table><tr><th></th><th>City</th>'+head+'</tr>'+F.top.map((t,i)=>'<tr><td>'+(i+1)+'</td><td><b>'+t.c.n+'</b><br><span class="was">'+t.c.c+'</span></td>'+
    t.per.map(p=>'<td class="mi">'+(p.v?Math.round(p.mi)+" mi "+gradePill(GRADES.find(g=>g[1]===p.v)):'')+'</td>').join("")+'</tr>').join("")+'</table>';
  openReport("Find My Places",[
    "Planets: "+[...want].join(", "),
    "Continent: "+(conts.size?[...conts].join(", "):"All")+"  ·  Latitude Limit: "+(latLimit>=90?"No Limit":latLimit===66.5?"Polar Circles":latLimit+"°"),
    mapState().slice(-1)[0],
  ],'<h1 style="font-size:14px">Closest Matches</h1>'+table);
}
// One place on a page, for a session: the map close in on it, its lines and
// parans with their grades, each person's relocated chart, and under Transit
// the year's transits to its angles. Kaycee chose it from the list of what
// would make The World more useful, 2026-10-11.
async function placeReport(){
  if(!here)return;
  const P=here,people=pairOn()?["a","b"].filter(w=>party[w]):["a"];
  const win=window.open("","_blank");if(!win)return;
  win.document.write('<!doctype html><title>'+PERSON+'</title><p style="font-family:sans-serif;padding:30px">…</p>');
  // What the report needs, cast if it has not been yet.
  if(live)for(const w of people)fetchReloc(P,true,()=>{},w);
  const wasTl=tlOpen;tlOpen=true;if(tr.on)fetchTimeline();
  const ready=()=>(!live||people.every(w=>{const r=reloc.get(keyOf(P)+(w==="b"?BK():""));return r&&r!=="loading"}))&&
    (!tr.on||!API.timeline||(tlCache.get(tlKey())&&tlCache.get(tlKey())!=="loading"));
  for(let t=0;t<60&&!ready();t++)await new Promise(r=>setTimeout(r,250));
  const {rows,prs}=analyze(P.lat,P.lon);
  const lines='<h3>Lines</h3>'+(rows.length?'<table>'+rows.map(r=>'<tr><td>'+(r.l.tr?"Transit "+r.l.body+' <span class="was">'+SIDE[r.l.side]+'</span>':whoName(r.l)+SIDE[r.l.side]+" "+r.l.body)+' <span class="ap">'+r.l.angle+'</span></td>'+
    '<td class="mi">'+Math.round(r.mi)+' mi</td><td>'+gradePill(r.g)+'</td></tr>').join("")+'</table>':'<div class="none">No lines within 700 miles.</div>');
  const parans='<h3>Parans</h3>'+(prs.length?'<table>'+prs.map(r=>'<tr><td>'+whoName(r.p)+SIDE[r.p.side]+" "+r.p.a+' <span class="ap">'+r.p.angleA+'</span> '+r.p.b+' <span class="ap">'+r.p.angleB+'</span></td>'+
    '<td class="mi">'+r.d.toFixed(1)+'°</td><td>'+gradePill(r.g)+'</td></tr>').join("")+'</table>':'<div class="none">No parans within 1° of this latitude.</div>');
  const strip=h=>{const d=document.createElement("div");d.innerHTML=h;d.querySelectorAll("button").forEach(b=>b.remove());return d.innerHTML};
  const relocated=live?'<h3>Relocated Chart</h3>'+strip(people.map(w=>relocBlock(w)).join("")):"";
  // The relocated wheel itself: one per side in view, Personality and Design
  // each on its own horizon, for each person. Chiron and Lilith only when the
  // Lines menu has them on, as on the map. Kaycee, 2026-10-11.
  const sides=st.side==="both"?["personality","design"]:[st.side];
  const wheel=(w,sd)=>{const r=reloc.get(keyOf(P)+(w==="b"?BK():""));if(!r||!r.svg||!r.svg[sd])return"";
    const d=document.createElement("div");d.innerHTML=r.svg[sd];
    if(!st.extras.has("Chiron"))d.querySelectorAll('[data-aplanet="Chiron"]').forEach(e=>e.remove());
    if(!st.extras.has("Lilith"))d.querySelectorAll('[data-aplanet="Mean_Lilith"]').forEach(e=>e.remove());
    const c=w==="b"&&PB?PB.cast:CAST;
    return '<div class="wh"><div class="wsub"><b>'+(pairOn()?(w==="b"?PB.person:PERSON)+" · ":"")+SIDE[sd]+'</b> · '+utcWhen(sd==="design"?c.d:c.p)+'</div>'+d.innerHTML+'</div>'};
  const wheels=live?people.map(w=>sides.map(sd=>wheel(w,sd)).join("")).join(""):"";
  const transits=tr.on&&API.timeline?'<h3>Upcoming Transits</h3>'+strip(timelineHtml()):"";
  tlOpen=wasTl;
  // The map close in on the place for the picture, then back as it was.
  const was={...view};
  const k=Math.max(view.k,4);view.k=k;view.tx=W/2-((P.lon+180)/360*W)*k;view.ty=H/2-((TOP-P.lat)/(TOP-BOTTOM)*H)*k;clampView();draw();
  const title=placeName(P);
  openReport(title,[(P.name?fmtLat(P.lat)+", "+fmtLon(P.lon)+"  ·  ":"")+mapState().slice(-1)[0]],lines+parans+relocated+wheels+transits,win);
  Object.assign(view,was);clampView();redraw();
}
function compareReport(){
  const t=document.querySelector("#w-compare table");if(!t)return;
  const c=t.cloneNode(true);c.querySelectorAll("button").forEach(b=>b.remove());
  openReport("Compare Places",[mapState().slice(-1)[0]],c.outerHTML);
}
function mapState(){
  const n=k=>st[k].size===ALL[k].length?"All":st[k].size?[...st[k]].join(", "):"None";
  // The moment each map was cast, for the sides on it. Kaycee, 10 October:
  // "can you add the date(s) to the map image?"
  const [y,mo,d]=BORN.date.split("-").map(Number),[hh,mm]=BORN.time.split(":").map(Number);
  const born=MONTHS[mo-1]+" "+d+", "+y+" · "+(hh%12===0?12:hh%12)+":"+String(mm).padStart(2,"0")+" "+(hh<12?"AM":"PM")+" · "+BORN.place;
  const dates=[];
  if(st.side!=="design")dates.push("Personality: "+born);
  if(st.side!=="personality")dates.push("Design: "+utcWhen(CAST.d));
  if(tr.on&&tr.sky)dates.push("Transit: "+utcWhen(tr.at)+(tr.alone?"  ·  Transit Only":""));
  if(pairOn())dates.push("With "+PB.person);
  return ["The World · "+(st.side==="both"?"Personality + Design":SIDE[st.side]),...dates,
    "Lines: "+n("lines")+"  ·  Angles: "+n("angles")+"  ·  Parans: "+n("parans")+
      (st.ls.size?"  ·  Local Space: "+[...st.ls].map(x=>SIDE[x]).join(", ")+" from "+(lsFrom?lsFrom.name:"Birthplace"):"")];
}
document.getElementById("w-snapMap").onclick=()=>snapshot(document.getElementById("w-map"),[PERSON,...mapState()],PERSON+" - The World.png");
function openHere(lat,lon,city){
  const c=city||nearestCity(lat,lon);
  here={lat,lon,name:city?city.n:(c?"Near "+c.n:null),country:c?c.c:null};
  if(city){here.lat=city.lat;here.lon=city.lon}
  if(relOpen){fetchReloc(here,true,renderHere);if(pairOn())fetchReloc(here,true,renderHere,"b")}renderHere();redraw();
  if(typeof centerOn==="function")centerOn(here.lon);
}
document.getElementById("w-here").addEventListener("click",e=>{
  if(e.target.closest(".x")){here=null;pinned.clear();renderHere();redraw();return}
  if(e.target.closest("[data-pdf=place]"))return placeReport();
  if(e.target.closest("[data-lshere]")&&here){lsFrom={lat:here.lat,lon:here.lon,name:(here.name||fmtLat(here.lat)+", "+fmtLon(here.lon)).replace(/^Near /,"")};buildLS();paint();return renderHere()}
  if(e.target.closest("[data-tltog]")){tlOpen=!tlOpen;if(tlOpen)fetchTimeline();renderHere();return}
  if(e.target.closest("[data-reltog]")){relOpen=!relOpen;if(relOpen&&here){fetchReloc(here,true,renderHere);if(pairOn())fetchReloc(here,true,renderHere,"b")}renderHere();return}
  const wb=e.target.closest("[data-wheel]");if(wb){const who=wb.dataset.wheel;const r=reloc.get(relocKey()+(who==="b"?BK():""));if(r&&r.svg)showWheel(r,placeName(here),"personality",who);return}
  const un=e.target.closest("[data-un]");if(un){pinned.delete(un.dataset.un);renderHere();redraw();return}
  if(e.target.closest("[data-save]")&&here){
    const one={n:here.name?here.name.replace(/^Near /,"Near "):fmtLat(here.lat)+", "+fmtLon(here.lon),c:here.country||"",lat:here.lat,lon:here.lon};
    saved.push(one);persist();renderHere();renderCompare();redraw();
    if(account)journal("POST",{token:opts.token,places:[asPlace(one)]}).then(j=>{if(j){saved=j.entries.filter(e=>e.place).map(fromEntry);renderCompare()}}).catch(()=>{})}
});
// ---- Find My Places ---------------------------------------------------------
// The person chooses which planets they want close; the map shades where those
// planets' lines fall nearest and lists the closest cities. Nothing here says a
// planet is good or bad. Kaycee, 10 October: "I'm trying to resist telling them
// that certain planets are always good or always bad and want them to be able
// to explore on their own intuitively."
// Each chosen planet scores its grade at a place (Strong 3, Moderate 2, Mild 1)
// for each side in view, through the angles the Angles menu allows.
const want=new Set();let finding=false;
// Near the poles every line converges, so the far north and south score well
// for any choice: across twelve charts, 56% of top-ten matches lay beyond 60
// degrees against 5% of cities. The person sets how far to look; 60 to start.
let latLimit=60;
// Continents to look in; none chosen means everywhere. Kaycee, 2026-10-11.
const CONTS=["Africa","Asia","Europe","North America","South America","Oceania"];
const conts=new Set();
const STEP=2,GC=Math.round(360/STEP),GR=Math.round((TOP-BOTTOM)/STEP);
const dense=new Map();   // line -> points every 0.4 degrees
function densePts(l){
  if(dense.has(l))return dense.get(l);const out=[];
  for(const run of l.runs)for(let i=1;i<run.length;i++){const a=run[i-1],b=run[i];
    const n=Math.max(1,Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]))/0.4));
    for(let k=0;k<n;k++){const t=k/n;out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])])}}
  dense.set(l,out);return out;
}
// On a Relationship, Find My Places looks for both people: Each Person keeps
// only places where each has a chosen planet close; Combined adds the two
// together. Kaycee, 2026-10-11.
let findMode="each";
function chosenLines(){
  const sides=st.side==="both"?["personality","design"]:[st.side];
  const groups=[];
  const whos=(pairOn()?["a","b"]:["a"]).filter(w=>w==="b"?party.b:party.a);
  for(const who of whos)for(const sd of sides)for(const b of want){
    const ls=LN.filter(l=>!l.tr&&(who==="b")===isB(l)&&l.side===sd&&l.body===b&&st.angles.has(l.angle));if(ls.length)groups.push({who,sd,b,ls})}
  return groups;
}
const gradeVal=mi=>mi<=300?3:mi<=500?2:mi<=700?1:0;
let lastFind=null;
function computeFind(){
  const groups=chosenLines();
  const score=new Float32Array(GC*GR),sA=new Float32Array(GC*GR),sB=new Float32Array(GC*GR);
  const each=pairOn()&&party.a&&party.b&&findMode==="each";
  for(const g of groups){
    const best=new Float32Array(GC*GR).fill(Infinity);
    for(const l of g.ls)for(const [plon,plat] of densePts(l)){
      if(plat>TOP+11||plat<BOTTOM-11)continue;
      const r0=Math.max(0,Math.floor((TOP-plat-10.2)/STEP)),r1=Math.min(GR-1,Math.floor((TOP-plat+10.2)/STEP));
      for(let r=r0;r<=r1;r++){const clat=TOP-(r+.5)*STEP;
        const span=10.2/Math.max(.15,Math.cos(clat*RAD));
        const c0=Math.floor((plon-span+180)/STEP),c1=Math.floor((plon+span+180)/STEP);
        for(let cc=c0;cc<=c1;cc++){const c=((cc%GC)+GC)%GC,clon=-180+(c+.5)*STEP;
          const d=hav(clat,clon,plat,plon),i=r*GC+c;if(d<best[i])best[i]=d}}
    }
    const into=g.who==="b"?sB:sA;
    for(let i=0;i<best.length;i++)into[i]+=gradeVal(best[i]);
  }
  for(let i=0;i<score.length;i++)score[i]=each&&!(sA[i]>0&&sB[i]>0)?0:sA[i]+sB[i];
  const max=3*groups.length;
  // Paint the score as a soft gold wash under the lines.
  const cv=document.createElement("canvas");cv.width=GC;cv.height=GR;const g=cv.getContext("2d"),img=g.createImageData(GC,GR);
  for(let i=0;i<score.length;i++){const rowLat=TOP-(Math.floor(i/GC)+.5)*STEP;const a=max&&Math.abs(rowLat)<=latLimit?score[i]/max:0;img.data[i*4]=199;img.data[i*4+1]=154;img.data[i*4+2]=46;img.data[i*4+3]=Math.round(Math.pow(a,1.6)*190)}
  g.putImageData(img,0,0);
  document.getElementById("w-heat").setAttribute("href",groups.length?cv.toDataURL():"");
  // Rank cities exactly, starting from the cells that score at all.
  const cell=(lat,lon)=>{const r=Math.min(GR-1,Math.max(0,Math.floor((TOP-lat)/STEP))),c=Math.min(GC-1,Math.max(0,Math.floor((lon+180)/STEP)));return score[r*GC+c]};
  const ranked=[];
  if(groups.length)for(const c of CITIES){if(c.stn||(conts.size&&!conts.has(c.ct))||Math.abs(c.lat)>latLimit||c.lat>TOP||c.lat<BOTTOM||cell(c.lat,c.lon)<=0)continue;
    let sc=0,sum=0,ga=0,gb=0;const per=[];
    for(const g2 of groups){const mi=Math.min(...g2.ls.map(l=>distTo(l,c.lat,c.lon)));const v=gradeVal(mi);sc+=v;sum+=Math.min(mi,700);
      if(g2.who==="b")gb+=v;else ga+=v;per.push({who:g2.who,sd:g2.sd,b:g2.b,mi,v})}
    if(each&&!(ga>0&&gb>0))continue;
    if(sc>0)ranked.push({c,sc,sum,per})}
  ranked.sort((a,b)=>b.sc-a.sc||a.sum-b.sum);
  lastFind={groups,max,top:ranked.slice(0,12)};
}
function renderFind(){
  const box=document.getElementById("w-find"),btn=document.getElementById("w-findBtn");
  btn.classList.toggle("on",finding);
  // Find My Places opens on the right, clear of the chart's panel on the left
  // (Kaycee, 2026-10-11: it "gets lost behind the left hand control panel");
  // an open place panel moves over beside it.
  // In a chart it lives in the right-hand panel instead (Kaycee, 2026-10-11:
  // it "still covers up too much of the map"), where nothing overlaps.
  if(!opts.findHost)root.classList.toggle("finding",finding);
  if(!finding){box.classList.remove("open");document.getElementById("w-heat").setAttribute("href","");return}
  computeFind();
  const F=lastFind;
  box.innerHTML='<button class="x" title="Close">&times;</button><h2>Find My Places</h2>'+
    '<div class="grid">'+[...BODIES,...EXTRAS.filter(x=>st.extras.has(x))].map(b=>'<div class="w-opt'+(want.has(b)?" on":"")+'" data-want="'+b+'"><span class="radio"></span><span class="gl">'+GLYPH[b]+'</span>'+b+'</div>').join("")+'</div>'+
    (pairOn()&&party.a&&party.b?'<h3>Match</h3><div class="lims">'+[["each","Each Person"],["combined","Combined"]].map(([k,t])=>'<button class="w-pill'+(findMode===k?" on":"")+'" data-fmode="'+k+'">'+t+'</button>').join("")+'</div>':"")+
    '<h3>Continent</h3><div class="lims">'+['All',...CONTS].map(t=>'<button class="w-pill'+((t==="All"?!conts.size:conts.has(t))?" on":"")+'" data-cont="'+t+'">'+t+'</button>').join("")+'</div>'+
    '<h3>Latitude Limit</h3><div class="lims">'+[[45,"45°"],[60,"60°"],[66.5,"Polar Circles"],[90,"No Limit"]].map(([v,t])=>'<button class="w-pill'+(v===latLimit?" on":"")+'" data-lim="'+v+'">'+t+'</button>').join("")+'</div>'+
    (F.groups.length?'<h3>Closest Matches</h3>'+(F.top.length?'<button class="w-pill pdf" data-pdf="find">Save As PDF</button>':'')+(F.top.length?F.top.map((t,i)=>'<div class="fr" data-fi="'+i+'"><b>'+t.c.n+'</b> <span class="co">'+t.c.c+'</span>'+
      '<div class="mt">'+t.per.filter(p=>p.v).map(p=>'<span><span style="color:'+(p.who==="b"?(p.sd==="design"?"#5fb3a8":"#0d9488"):pairOn()?(p.sd==="design"?"#b48bc0":"#845095"):p.sd==="design"?"var(--design)":"var(--ink)")+'">'+GLYPH[p.b]+'</span>'+gradePill(GRADES.find(g=>g[1]===p.v))+'</span>').join("")+'</div></div>').join(""):'<div class="none">No cities within 700 miles of these lines.</div>'):"");
  box.classList.add("open");
}
document.getElementById("w-findBtn").onclick=()=>{finding=!finding;renderFind()};
document.getElementById("w-find").addEventListener("click",e=>{
  if(e.target.closest(".x")){finding=false;return renderFind()}
  const fm=e.target.closest("[data-fmode]");if(fm){findMode=fm.dataset.fmode;return renderFind()}
  const ct=e.target.closest("[data-cont]");if(ct){const t=ct.dataset.cont;if(t==="All")conts.clear();else conts.has(t)?conts.delete(t):conts.add(t);return renderFind()}
  if(e.target.closest("[data-pdf=find]"))return findReport();
  const lim=e.target.closest("[data-lim]");if(lim){latLimit=+lim.dataset.lim;return renderFind()}
  const w=e.target.closest("[data-want]");if(w){const b=w.dataset.want;want.has(b)?want.delete(b):want.add(b);return renderFind()}
  const r=e.target.closest("[data-fi]");if(r){const c=lastFind.top[+r.dataset.fi].c;
    const k=Math.max(view.k,4);view.k=k;view.tx=W/2-((c.lon+180)/360*W)*k;view.ty=H/2-((TOP-c.lat)/(TOP-BOTTOM)*H)*k;clampView();openHere(c.lat,c.lon,c)}
});

// ---- Saved places, compared ---------------------------------------------
function drawSaved(){
  const g=document.getElementById("w-pin");
  for(const s of saved){const x=X(s.lon),y=Y(s.lat);if(x<0||x>W||y<0||y>H)continue;
    g.append(mk("circle",{class:"spin",cx:x,cy:y,r:5}));
    const t=mk("text",{class:"spin-l",x:x+8,y:y-6});t.textContent=s.n.replace(/^Near /,"");g.append(t)}
}
let comparing=false;
// Folding sections: a pair's comparison runs long. The grade counts always
// show; Lines open, the rest folded. Kaycee, 2026-10-11: "It's a lot of info
// for two people and it's only showing one person's houses."
const cmpOpen=new Set(["lines"]);
// On a Relationship, the people in view, from the people buttons.
const cmpWho=()=>pairOn()?["a","b"].filter(w=>party[w]):["a"];
function renderCompare(){
  const b=document.getElementById("w-cmpBtn");b.classList.toggle("has",saved.length>0);b.textContent="Compare Places ("+saved.length+")";
  const box=document.getElementById("w-compare");
  if(!comparing||!saved.length){box.classList.remove("open");return}
  if(cmpOpen.has("reloc"))for(const s of saved)for(const w of cmpWho())fetchReloc({lat:s.lat,lon:s.lon,name:s.n,country:s.c},false,renderCompare,w);
  const A=saved.map(s=>analyze(s.lat,s.lon));
  // Every line or paran that reaches any saved place, best first.
  const lines=new Map(),pars=new Map();
  A.forEach((a,i)=>{
    for(const r of a.rows){const k=key(r.l);if(!lines.has(k))lines.set(k,{l:r.l,at:[],best:9e9});const e=lines.get(k);e.at[i]=r;e.best=Math.min(e.best,r.mi)}
    for(const r of a.prs){const p=r.p,k=[p.who||"",p.side,p.a,p.angleA,p.b,p.angleB].join("|");if(!pars.has(k))pars.set(k,{p,at:[],best:9});const e=pars.get(k);e.at[i]=r;e.best=Math.min(e.best,r.d)}
  });
  const cell=r=>r?'<td class="mi">'+(r.mi!==undefined?Math.round(r.mi)+" mi":r.d.toFixed(1)+"°")+" "+gradePill(r.g)+"</td>":"<td></td>";
  const count=(a,n,w)=>a.rows.filter(r=>r.g[1]===n&&(!w||isB(r.l)===(w==="b"))).length+a.prs.filter(r=>r.g[1]===n&&(!w||isB(r.p)===(w==="b"))).length;
  const W=cmpWho(),cols=saved.length+1;
  // A pair's counts name each person in their own colour.
  const sumCell=(a,n)=>'<td>'+(pairOn()?W.map(w=>'<span class="p'+w+'">'+first(w==="b"?PB.person:PERSON)+" "+count(a,n,w)+'</span>').join(" · "):count(a,n))+'</td>';
  const sec=(k,t)=>'<tr class="w-sec fold'+(cmpOpen.has(k)?" open":"")+'" data-fold="'+k+'"><td colspan="'+cols+'">'+t+'</td></tr>';
  const whoRow=w=>pairOn()?'<tr class="w-who"><td class="p'+w+'" colspan="'+cols+'">'+(w==="b"?PB.person:PERSON)+'</td></tr>':"";
  // On a pair, each person's lines and parans under their own name.
  const byWho=(list,isb,row)=>W.map(w=>{const mine=list.filter(e=>(isb(e)?"b":"a")===w);return mine.length?whoRow(w)+mine.map(row).join(""):""}).join("");
  box.innerHTML='<button class="x" title="Close">&times;</button><h2>Compare Places <button class="w-pill pdf" data-pdf="compare">Save As PDF</button></h2><table>'+
    '<tr><th></th>'+saved.map((s,i)=>'<th><span class="pl" data-go="'+i+'">'+s.n+'</span> <button class="rm" data-rm="'+i+'" title="Remove">&times;</button></th>').join("")+'</tr>'+
    '<tr class="sum"><td>Strong</td>'+A.map(a=>sumCell(a,3)).join("")+'</tr>'+
    '<tr class="sum"><td>Moderate</td>'+A.map(a=>sumCell(a,2)).join("")+'</tr>'+
    '<tr class="sum"><td>Mild</td>'+A.map(a=>sumCell(a,1)).join("")+'</tr>'+
    (live?sec("reloc","Relocated Chart")+(cmpOpen.has("reloc")?W.map(w=>whoRow(w)+relocRows(w)).join(""):""):"")+
    sec("lines","Lines")+(!cmpOpen.has("lines")?"":byWho([...lines.values()].sort((a,b)=>a.best-b.best),e=>isB(e.l),e=>'<tr '+tag(e.l.side,e.l.body,e.l.angle,e.l.tr,isB(e.l))+'><td><span class="gl '+e.l.side+(isB(e.l)?" who-b":"")+(e.l.tr?" transit":"")+'">'+GLYPH[e.l.body]+'</span> '+(e.l.tr?"Transit "+e.l.body+' <span class="was">'+SIDE[e.l.side]+'</span>':whoName(e.l)+SIDE[e.l.side]+" "+e.l.body)+' <span class="ap">'+e.l.angle+'</span></td>'+saved.map((s,i)=>cell(e.at[i])).join("")+'</tr>'))+
    sec("parans","Parans")+(!cmpOpen.has("parans")?"":byWho([...pars.values()].sort((a,b)=>a.best-b.best),e=>isB(e.p),e=>{const p=e.p;return '<tr '+tag(p.side,p.a,p.angleA,false,isB(p))+' data-body2="'+p.b+'" data-angle2="'+p.angleB+'"><td>'+whoName(p)+SIDE[p.side]+" "+p.a+' <span class="ap">'+p.angleA+'</span> '+p.b+' <span class="ap">'+p.angleB+'</span></td>'+saved.map((s,i)=>cell(e.at[i])).join("")+'</tr>'}))+
    '</table>';
  box.classList.add("open");
}
// The relocated chart for every saved place: angles for each side in view,
// then each planet's house there, natal house beside its name.
function relocRows(who){
  if(!live)return"";
  const isb=who==="b",NATAL_=isb?PB.natal:NATAL,GO=isb?PB.gateOf:GATE_OF;
  const R=saved.map(s=>reloc.get(keyOf(s)+(isb?BK():"")));
  const sides=st.side==="both"?["personality","design"]:[st.side];
  const ANGULAR=new Set([1,4,7,10]);
  const cellOf=f=>R.map(r=>r==="loading"||!r?'<td class="mi">…</td>':r==="failed"?'<td class="mi"></td>':'<td>'+f(r)+'</td>').join("");
  let h="";
  for(const sd of sides)for(const a of ["ASC","DSC","MC","IC"]){const N=NATAL_[sd].angles[a];
    h+='<tr><td>'+SIDE[sd]+" "+ANGLE_NAME[a]+' <span class="was">natal '+N.text+" · "+N.gate+"."+N.line+'</span></td>'+
      cellOf(r=>{const R=r[sd].angles[a],who=ownGate(R.gate,GO);
        return R.sign+" "+fmtDeg(R.deg)+' <span class="'+(who.length?"own":"was")+'"'+(who.length?' title="'+who.join(", ")+'"':"")+'>'+R.gate+"."+R.line+'</span>'})+'</tr>'}
  for(const sd of sides)for(const bd of chartBodies()){const n=NATAL_[sd].house[bd];
    h+='<tr><td><span class="gl '+sd+(isb?" who-b":"")+'" style="color:'+(isb?(sd==="design"?"#5fb3a8":"#0d9488"):sd==="design"?"var(--design)":"var(--ink)")+'">'+GLYPH[bd]+'</span> '+SIDE[sd]+" "+bd+' <span class="was">natal '+ord(n)+'</span></td>'+
      cellOf(r=>{const z=r[sd].house[bd];return'<span class="'+(ANGULAR.has(z)?"own":z===n?"was":"")+'"'+(ANGULAR.has(z)?' title="Angular house"':'')+'>'+ord(z)+'</span>'})+'</tr>'}
  return h;
}
document.getElementById("w-cmpBtn").onclick=()=>{comparing=!comparing;renderCompare()};
document.getElementById("w-compare").addEventListener("click",e=>{
  if(e.target.closest("[data-pdf=compare]"))return compareReport();
  if(e.target.closest(".x")){comparing=false;return renderCompare()}
  const f=e.target.closest("[data-fold]");if(f){const k=f.dataset.fold;cmpOpen.has(k)?cmpOpen.delete(k):cmpOpen.add(k);return renderCompare()}
  const rm=e.target.closest("[data-rm]");if(rm){const gone=saved.splice(+rm.dataset.rm,1)[0];persist();
    if(account&&gone&&gone.id)journal("DELETE",null,"?id="+gone.id).catch(()=>{});
    renderCompare();renderHere();return redraw()}
  const go=e.target.closest("[data-go]");if(go){const s=saved[+go.dataset.go];openHere(s.lat,s.lon,{n:s.n,c:s.c,lat:s.lat,lon:s.lon})}
});
document.getElementById("w-compare").addEventListener("mouseover",e=>{const r=e.target.closest("tr[data-side]");if(r)hot(r.dataset,true)});
document.getElementById("w-compare").addEventListener("mouseout",e=>{const r=e.target.closest("tr[data-side]");if(r)hot(r.dataset,false)});
document.getElementById("w-here").addEventListener("mouseover",e=>{const r=e.target.closest(".hr");if(r)hot(r.dataset,true)});
document.getElementById("w-here").addEventListener("mouseout",e=>{const r=e.target.closest(".hr");if(r)hot(r.dataset,false)});

// Zoom inside the frame. A pinch arrives as a ctrl-wheel (Chrome, Firefox) or
// as gesture events (Safari); either is caught here so the page itself never
// zooms. Two-finger scroll or a drag pans once zoomed in.
const svg=document.getElementById("w-map");
function frameAt(cx,cy){const pt=new DOMPoint(cx,cy).matrixTransform(svg.getScreenCTM().inverse());return [pt.x-ML,pt.y-MT]}
function clampView(){view.k=Math.min(16,Math.max(1,view.k));
  view.tx=Math.min(0,Math.max(W-W*view.k,view.tx));view.ty=Math.min(0,Math.max(H-H*view.k,view.ty));
  svg.classList.toggle("grab",view.k>1)}
let pending=false;
function redraw(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;draw()})}
function zoomAt(fx,fy,k){const k0=view.k;view.k=Math.min(16,Math.max(1,k));
  view.tx=fx-(fx-view.tx)*view.k/k0;view.ty=fy-(fy-view.ty)*view.k/k0;clampView();redraw()}
let gesturing=false;
const touches=new Map();let pinch=null,slide=null;
// Two fingers that start close together (pointer and middle, side by side)
// made every small movement a big zoom. Counting the spread from a floor of
// 120px makes a pinch feel the same with any two fingers. Kaycee, 2026-10-11.
const spread=()=>{const [a,b]=[...touches.values()];return {d:Math.max(120,Math.hypot(a[0]-b[0],a[1]-b[1])),x:(a[0]+b[0])/2,y:(a[1]+b[1])/2}};
// A pinch moves the picture as it stands while the fingers move (a cheap
// transform the phone does smoothly) and redraws the map sharply once they
// lift. Redrawing every line and city on each finger movement could not keep
// up: Kaycee, 2026-10-11, "pinch zoom works great on the bodygraph view, but
// it's sooo challenging on the wheel and world views."
function endPinch(){
  if(!pinch)return;const p=pinch;pinch=null;
  svg.style.transform="";svg.style.transformOrigin="";
  if(!p.r)return;
  const s=svg.getScreenCTM().a;
  zoomAt(p.fx,p.fy,p.k*p.r);
  view.tx+=p.dx/s;view.ty+=p.dy/s;clampView();redraw();
}
const lift=e=>{touches.delete(e.pointerId);if(touches.size<2)endPinch();if(!touches.size)slide=null};
window.addEventListener("pointerup",lift);window.addEventListener("pointercancel",lift);
svg.addEventListener("wheel",e=>{
  if(e.ctrlKey){if(gesturing)return;e.preventDefault();const [fx,fy]=frameAt(e.clientX,e.clientY);zoomAt(fx,fy,view.k*Math.exp(-e.deltaY*0.01));return}
  if(view.k>1){e.preventDefault();const s=svg.getScreenCTM().a;view.tx-=e.deltaX/s;view.ty-=e.deltaY/s;clampView();redraw()}
},{passive:false});
let g0=1;
// Safari's gesture events are kept for a trackpad. A pinch on a touch screen
// is read from the two fingers below instead, on every phone alike: Android
// sends neither gesture events nor a ctrl-wheel, and on an iPhone the two
// fingers also arrived as presses that panned against the zoom.
svg.addEventListener("gesturestart",e=>{e.preventDefault();if(touches.size)return;gesturing=true;g0=view.k});
svg.addEventListener("gesturechange",e=>{e.preventDefault();if(touches.size||!gesturing)return;const [fx,fy]=frameAt(e.clientX,e.clientY);zoomAt(fx,fy,g0*e.scale)});
svg.addEventListener("gestureend",e=>{e.preventDefault();gesturing=false});
let drag=null;
// A press that barely moves is a click: it asks what is here. One that moves
// is a drag, which pans once zoomed in.
let press=null;
svg.addEventListener("pointerdown",e=>{if(e.button!==0)return;
  if(e.pointerType==="touch"){touches.set(e.pointerId,[e.clientX,e.clientY]);
    // A second finger makes it a pinch: whatever the first finger began is dropped.
    if(touches.size>=2){press=null;drag=null;slide=null;svg.classList.remove("grabbing");
      const s=spread(),[fx,fy]=frameAt(s.x,s.y),b=svg.getBoundingClientRect();
      pinch={d:s.d,k:view.k,x:s.x,y:s.y,fx,fy,r:0,dx:0,dy:0};
      svg.style.transformOrigin=(s.x-b.left)+"px "+(s.y-b.top)+"px";return}
    // One finger on a phone, the whole map in view: it slides the map sideways.
    if(view.k===1&&typeof phone==="function"&&phone())slide={x:e.clientX,left:stageEl.scrollLeft}}
  // What was pressed is read now: once the pointer is captured for a drag,
  // later events all report the map itself.
  press={x:e.clientX,y:e.clientY,moved:false,line:e.target.closest("#w-hits [data-side], #w-labels [data-side]")};
  if(view.k>1){drag={x:e.clientX,y:e.clientY,tx:view.tx,ty:view.ty};svg.setPointerCapture(e.pointerId)}});
svg.addEventListener("pointermove",e=>{
  if(touches.has(e.pointerId)){touches.set(e.pointerId,[e.clientX,e.clientY]);
    if(pinch&&touches.size>=2){const s=spread();
      const r=Math.min(16,Math.max(1,pinch.k*s.d/pinch.d))/pinch.k;
      pinch.r=r;pinch.dx=s.x-pinch.x;pinch.dy=s.y-pinch.y;
      svg.style.transform="translate("+pinch.dx+"px,"+pinch.dy+"px) scale("+r+")";return}
    if(slide&&touches.size===1){stageEl.scrollLeft=slide.left-(e.clientX-slide.x)}}
  if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>4)press.moved=true;
  if(!drag||!press||!press.moved)return;svg.classList.add("grabbing");const s=svg.getScreenCTM().a;view.tx=drag.tx+(e.clientX-drag.x)/s;view.ty=drag.ty+(e.clientY-drag.y)/s;clampView();redraw()});
svg.addEventListener("pointerup",e=>{
  const onLine=press&&!press.moved&&press.line;
  if(onLine){const d=onLine.dataset,k=(d.who==="b"?"B|":"")+(d.transit?"T|":"")+d.side+"|"+d.body+"|"+d.angle;pinned.has(k)?pinned.delete(k):pinned.add(k);renderHere();redraw();press=null;drag=null;return}
  if(press&&!press.moved){const [fx,fy]=frameAt(e.clientX,e.clientY);
    if(fx>=0&&fx<=W&&fy>=0&&fy<=H){const lon=((fx-view.tx)/view.k)/W*360-180,lat=TOP-((fy-view.ty)/view.k)/H*(TOP-BOTTOM);openHere(lat,lon)}}
  press=null;drag=null;svg.classList.remove("grabbing")});
document.querySelector(".zoom").onclick=e=>{const z=e.target.closest("button");if(!z)return;
  if(z.dataset.z==="reset"){view.k=1;view.tx=0;view.ty=0;clampView();return redraw()}
  zoomAt(W/2,H/2,view.k*(z.dataset.z==="in"?1.6:1/1.6))};
// ---- City search ---------------------------------------------------------
const q=document.getElementById("w-q"),res=document.getElementById("w-results");
const norm=t=>t.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
let hits=[],sel=0;
// Search asks the chart provider's own place list, the one the chart forms
// use, through the local server; a chosen place is then located the way a
// birthplace is. Opened as a plain file there is no server, and the built-in
// Natural Earth cities answer instead.
let live=!!(API.places&&API.place);
async function choose(h){
  if(!h.value)return goTo(h);
  res.classList.remove("open");q.value=h.value;
  try{const r=await (await fetch(withToken(API.place+"?value="+encodeURIComponent(h.value)))).json();
    if(!r.ok)throw new Error(r.error);
    goTo({n:h.name,c:h.region,lat:r.lat,lon:r.lon});
  }catch(e){q.value="";q.placeholder="Could not place "+h.name}
}
function goTo(c){
  res.classList.remove("open");q.value=c.n+(c.c?", "+c.c:"");
  const k=Math.max(view.k,5);view.k=k;view.tx=W/2-((c.lon+180)/360*W)*k;view.ty=H/2-((TOP-c.lat)/(TOP-BOTTOM)*H)*k;clampView();
  openHere(c.lat,c.lon,c);
}
function showHits(){
  res.innerHTML=hits.map((c,i)=>'<div class="'+(i===sel?"sel":"")+'" data-i="'+i+'">'+(c.value?c.name:c.n)+'<span>'+(c.value?c.region:c.c)+'</span></div>').join("");
  res.classList.toggle("open",hits.length>0);
}
let seq=0,timer=0;
q.addEventListener("input",()=>{const t=norm(q.value.trim());sel=0;
  if(!t){hits=[];return showHits()}
  if(live){clearTimeout(timer);const my=++seq;timer=setTimeout(async()=>{
    try{const r=await (await fetch(API.places+"?q="+encodeURIComponent(q.value.trim()))).json();
      if(my!==seq)return;if(!r.ok)throw new Error(r.error);hits=r.places.map(p=>{const parts=String(p.value).split(",").map(x=>x.trim());
        // The site's place list gives the provider's full name only, "Lisbon, Portugal":
        // the first part is the place, the rest where it is.
        return {value:p.value,name:p.name||parts[0],region:p.region||parts.slice(1).join(", ")}});showHits()}
    catch(e){live=false;q.dispatchEvent(new Event("input"))}},200);return}
  const starts=CITIES.filter(c=>norm(c.n).startsWith(t)),has=CITIES.filter(c=>!norm(c.n).startsWith(t)&&norm(c.n).includes(t));
  hits=[...starts.sort((a,b)=>b.pop-a.pop),...has.sort((a,b)=>b.pop-a.pop)].slice(0,8);showHits()});
q.addEventListener("keydown",e=>{
  if(e.key==="ArrowDown"){sel=Math.min(hits.length-1,sel+1);showHits();e.preventDefault()}
  else if(e.key==="ArrowUp"){sel=Math.max(0,sel-1);showHits();e.preventDefault()}
  else if(e.key==="Enter"&&hits[sel])choose(hits[sel]);
  else if(e.key==="Escape")res.classList.remove("open")});
res.addEventListener("mousedown",e=>{const d=e.target.closest("[data-i]");if(d){e.preventDefault();choose(hits[+d.dataset.i])}});
q.addEventListener("blur",()=>setTimeout(()=>res.classList.remove("open"),100));
paint();
// Inside a chart, the panel's Personality and Design are the sides: the body's
// off-s-* classes. Both off draws neither side (bothOff, declared with st).
if(opts.planets){
  const readChart=()=>{
    const c=document.body.classList;
    const offP=c.contains("off-s-personality"),offD=c.contains("off-s-design");
    st.side=offP&&!offD?"design":offD&&!offP?"personality":"both";
    bothOff=offP&&offD;
    tr.on=c.contains("mod-transit");tr.alone=c.contains("tr-alone");
    const relNow=c.contains("mod-relation");if(relNow!==rel.on){rel.on=relNow;renderName()}
    // only where the buttons mean something: a pair, or a chart and its sky
    const pm=relNow||c.contains("mod-transit");
    party.a=!pm||!c.contains("off-party-a");party.b=!pm||!c.contains("off-party-b");
    if(tr.on)loadSky();
  };
  // A new moment on the date picker: new transit lines, and the place's
  // timeline counted again from it, at once rather than when the lines land.
  // The pair the Relationship view casts, or none: their sky arrives with it.
  document.addEventListener("delphi:connection",e=>{const c=e.detail;setPartner(c&&c.world,c&&c.b&&c.b.name)});
  if(opts.connection)setPartner(opts.connection.world,opts.connection.b&&opts.connection.b.name);
  document.addEventListener("delphi:transit",e=>{tr.at=e.detail.iso;if(tr.on){loadSky();if(here)renderHere()}});
  readChart();
  // Follow at once, not on the next frame: a browser tab in the background
  // runs no frames, and the view would sit out of step with the panel.
  let last="";
  new MutationObserver(()=>{const k=document.body.className;if(k===last)return;last=k;readChart();paint()})
    .observe(document.body,{attributes:true,attributeFilter:["class"]});
  paint();
}
// The chart's Reset puts this view back as it opened, too.
const resetWorld=()=>{view.k=1;view.tx=0;view.ty=0;clampView();here=null;pinned.clear();relOpen=false;
  st.lines=new Set(BODIES.filter(b=>!START_OFF.includes(b)));st.angles=new Set(ANGLES);st.extras=new Set();st.trx=new Set();
  finding=false;want.clear();conts.clear();findMode="each";comparing=false;st.parans.clear();renderFind();renderCompare();paint()};
// For the checks (the tooltip sweep and the parity test): what this view drew
// and how it names it.
// ---- On a phone ------------------------------------------------------------
// The map keeps its full height and the screen travels across it: the stage
// scrolls sideways, filling the phone below the controls, and opens on the
// birthplace. A place chosen is brought into view, and its details come up
// from the bottom (world.css). Kaycee, 2026-10-11, on the mockup: "that looks
// much better."
const stageEl=root.querySelector(".w-stage");
const phone=()=>window.matchMedia("(max-width: 760px)").matches;
function centerOn(lon){
  if(!phone())return;
  const s=svg.getBoundingClientRect().width/(ML+W+MR);
  stageEl.scrollLeft=Math.max(0,(ML+X(lon))*s-stageEl.clientWidth/2);
}
function fitPhone(){
  if(!phone()){stageEl.style.height="";return}
  const top=stageEl.getBoundingClientRect().top+window.scrollY;
  stageEl.style.height=Math.max(340,window.innerHeight-top-8)+"px";
}
let fitted=false;
function fitOnce(){if(fitted||!root.offsetParent)return;fitted=true;fitPhone();centerOn(BIRTH[0])}
window.addEventListener("resize",fitPhone);
window.addEventListener("orientationchange",()=>setTimeout(fitPhone,300));
// Search results float over everything on a phone, under the box they belong
// to, because the row they sit in scrolls sideways and would cut them off.
q.addEventListener("input",()=>{if(!phone()){res.style.top="";return}res.style.top=(q.getBoundingClientRect().bottom+6)+"px"});
new MutationObserver(fitOnce).observe(root.closest("body")||document.body,{attributes:true,attributeFilter:["class"]});
requestAnimationFrame(fitOnce);setTimeout(fitOnce,300);

// ---- Gates on the angles ----------------------------------------------------
// Every place has its own Midheaven and Ascendant for the birth moment, and
// every zodiac degree belongs to a gate and line (the Rave wheel: Gate 41
// Line 1 begins at 302 degrees, 5.625 degrees a gate). So the map can be
// coloured by the gate each place puts on an angle: the Midheaven, which
// depends only on longitude, in stripes; the Ascendant, which bends with
// latitude, in bands. Gates the person carries are gold. Checked against her
// natal chart: Midheaven Pisces 8 degrees 52, Ascendant Cancer 2 degrees 33.
// A rough version for her to see, 2026-10-11; what it means is hers to say.
const WHEEL=[41,19,13,49,30,55,37,63,22,36,25,17,21,51,42,3,27,24,2,23,8,20,16,35,45,12,15,52,39,53,62,56,31,33,7,4,29,59,40,64,47,6,46,18,48,57,32,50,28,44,1,43,14,34,9,5,26,11,10,58,38,54,61,60];
const OBL=23.4393*RAD;
const gateOfLon=v=>{const r=((v-302)%360+360)%360,i=Math.floor(r/5.625);return {gate:WHEEL[i],line:Math.floor((r-i*5.625)/0.9375)+1,i}};
const n360=x=>((x%360)+360)%360;
const mcAt=(gast,lon)=>{const r=(gast+lon)*RAD;return n360(Math.atan2(Math.sin(r),Math.cos(r)*Math.cos(OBL))/RAD)};
const ascAt=(gast,lon,lat)=>{const r=(gast+lon)*RAD;return n360(Math.atan2(Math.cos(r),-(Math.sin(r)*Math.cos(OBL)+Math.tan(lat*RAD)*Math.sin(OBL)))/RAD)};
const carried=()=>{const s=new Set();for(const sd of ["personality","design"])for(const v of Object.values(GATE_OF[sd]||{}))s.add(+String(v).split(".")[0]);return s};
// one side at a time: both together would be two sets of stripes over each other
const gateSide=()=>st.side==="design"?"design":"personality";
var gatesKey=""; // var, not let: paint() can run before this line is reached
function drawGates(){
  const g=document.getElementById("w-gates");if(!g)return;
  // Nothing on: return before touching anything declared further down, since
  // the first paint runs while the map is still being set up.
  if(!st.gates.size){if(gatesKey){g.replaceChildren();gatesKey=""}return}
  const key=[...st.gates].sort().join(",")+"|"+gateSide();
  if(key===gatesKey)return;gatesKey=key;g.replaceChildren();
  if(!st.gates.size)return;
  const gast=D.sky[gateSide()].gast,mine=carried();
  const fillFor=(gate,i)=>mine.has(gate)?"rgba(199,154,46,.30)":(i%2?"rgba(132,80,149,.10)":"rgba(132,80,149,.03)");
  if(st.gates.has("ASC")){
    // a picture, cell by cell, laid under the lines like the Find My Places wash
    const cw=720,ch=Math.round(cw*(TOP-BOTTOM)/360),cv=document.createElement("canvas");cv.width=cw;cv.height=ch;
    const c2=cv.getContext("2d"),img=c2.createImageData(cw,ch);
    for(let y=0;y<ch;y++){const lat=TOP-(y+.5)/ch*(TOP-BOTTOM);
      for(let x=0;x<cw;x++){const lon=-180+(x+.5)/cw*360,q=gateOfLon(ascAt(gast,lon,lat)),o=(y*cw+x)*4;
        if(mine.has(q.gate)){img.data[o]=199;img.data[o+1]=154;img.data[o+2]=46;img.data[o+3]=80}
        else{img.data[o]=132;img.data[o+1]=80;img.data[o+2]=149;img.data[o+3]=q.i%2?26:8}}}
    c2.putImageData(img,0,0);
    g.append(mk("image",{x:0,y:0,width:W,height:H,preserveAspectRatio:"none",href:cv.toDataURL()}));
  }
  if(st.gates.has("MC")){
    let start=-180,cur=gateOfLon(mcAt(gast,-180));
    const close=(to)=>{const x0=(start+180)/360*W,x1=(to+180)/360*W;
      g.append(mk("rect",{x:x0,y:0,width:Math.max(0,x1-x0),height:H,fill:fillFor(cur.gate,cur.i),stroke:"rgba(132,80,149,.25)","stroke-width":.4,"vector-effect":"non-scaling-stroke"}));
      const t=mk("text",{x:(x0+x1)/2,y:12,"text-anchor":"middle","font-size":8,"font-weight":600,fill:mine.has(cur.gate)?"#8a6a14":"#6b6790"});t.textContent=cur.gate;g.append(t)};
    for(let lon=-180;lon<=180;lon+=0.05){const q=gateOfLon(mcAt(gast,lon));if(q.gate!==cur.gate){close(lon);start=lon;cur=q}}
    close(180);
  }
}
// What a hover over the map says when the gates are showing: the gate and
// line on each angle shown, here, for the side shown.
function gateTip(e){
  const [fx,fy]=frameAt(e.clientX,e.clientY);if(fx<0||fx>W||fy<0||fy>H)return"";
  const lon=((fx-view.tx)/view.k)/W*360-180,lat=TOP-((fy-view.ty)/view.k)/H*(TOP-BOTTOM),gast=D.sky[gateSide()].gast,mine=carried();
  const row=(name,v)=>{const q=gateOfLon(v);return '<div class="w-row">'+SIDE[gateSide()]+" "+name+" · Gate "+q.gate+"."+q.line+(mine.has(q.gate)?' <span class="w-pill ang">Yours</span>':"")+"</div>"};
  return "<b>"+fmtLat(lat)+", "+fmtLon(lon)+"</b>"+(st.gates.has("MC")?row("Midheaven",mcAt(gast,lon)):"")+(st.gates.has("ASC")?row("Ascendant",ascAt(gast,lon,lat)):"");
}

// Until she approves it, the Gates menu shows on her own chart only, so a
// republish for anything else cannot carry a rough draft to clients.
if(opts.token!=="ab56c6178d82629b47e07557ed7f5a4d"){const gm=root.querySelector('[data-dd="gates"]');if(gm)gm.remove()}

// Local space last: it reads state declared further down than the map.
buildLS();paint();
joinAccount();

root.world = { D: D, LN: LN, PR: PR, describe: describe, state: st, reset: resetWorld };
}

window.DelphiWorld = {
  // Geometry is fetched once and kept; a chart may open and close the view.
  _geo: null,
  mount: function (root, D, opts) {
    opts = opts || {};
    if (root.dataset.mounted) return;
    root.dataset.mounted = "1";
    root.classList.add("world");
    var go = function (G) { root.innerHTML = markup(G, !!opts.planets, !!opts.findHost, D.person); init(root, D, G, opts); };
    if (this._geo) return go(this._geo);
    var self = this;
    fetch(opts.geometry).then(function (r) { if (!r.ok) throw new Error("world " + r.status); return r.json(); })
      .then(function (G) { self._geo = G; go(G); })
      .catch(function (e) { root.dataset.mounted = ""; root.textContent = "The map could not be loaded."; console.error(e); });
  },
  geometry: { linesFromSky: linesFromSky, paransFromSky: paransFromSky },
};
})();
