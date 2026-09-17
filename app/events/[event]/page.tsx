/**
 * An event's room, in numbers.
 *
 * Kaycee, 2026-09-14: a published stats page for everyone who signed up through an
 * event's link. Stats only: no names and no links to anybody's chart ("don't link
 * people's charts on the events page. Just the stats, no names for now").
 *
 * The counts are cast from each chart's birth data through the provider, the same
 * authority the charts use, and the page is rebuilt at most every few minutes so a
 * room of sign-ups is not re-cast on every view.
 *
 * Its own address, /events/<event>. The QR code's /e/<event> is never touched: it
 * still leads to the sign-up form.
 */

import { notFound } from "next/navigation";
import { Montserrat } from "next/font/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { getChart } from "@/lib/mybodygraph";
import { readSplit } from "@/lib/hd/split-kind";
import { longitudeOf } from "@/lib/hd/gate-longitude";
import { loadLibraryChunks } from "@/lib/hd/chunks-source";
import { CENTER_GATES, type Center } from "@/lib/hd/gate-center";
import { crossKey, crossName } from "@/lib/hd/cross-key";
import { windowFor, type Accuracy } from "@/lib/hd/time-accuracy";

export const revalidate = 300;

const font = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600"] });

const EVENTS: Record<string, { name: string; when: string; where: string }> = {
  bfki: { name: "The Big Fucking Kick It", when: "September 14 to 18, 2026", where: "Lava Hot Springs, Idaho" },
};

const CENTER_FROM_API: Record<string, Center> = {
  head: "head", ajna: "ajna", throat: "throat", g: "g", heart: "heart",
  "solar plexus": "solar-plexus", sacral: "sacral", spleen: "spleen", root: "root",
};
const CENTER_NAME: Record<Center, string> = {
  head: "Head", ajna: "Ajna", throat: "Throat", g: "G / Identity", heart: "Ego / Heart",
  spleen: "Spleen", "solar-plexus": "Solar Plexus", sacral: "Sacral", root: "Root",
};
const CENTER_ORDER: Center[] = ["head", "ajna", "throat", "g", "heart", "spleen", "solar-plexus", "sacral", "root"];
const TYPE_ORDER = ["Generator", "Manifesting Generator", "Projector", "Manifestor", "Reflector"];
const DEF_ORDER = ["Single", "Simple Split", "Wide Split", "Triple Split", "Quadruple Split", "No Definition"];

interface Person { type: string; authority: string; definition: string; profile: string; cross: string; crossKey: string; variables: string; defined: Set<Center>; gates: Set<number>; sign: string; place: string; age: number | null }

const SILENT = new Set(["Chiron", "Lilith"]);

/**
 * The four arrows as Kaycee writes them, "PLR DRR": Motivation and Perspective
 * on the Personality side, Determination and Environment on the Design side.
 *
 * They move with the minute, so a birth time that is not exact has none to
 * report. Kaycee, 2026-09-17: "we won't have it for the unknown birth times,
 * you can just list those as unknown."
 */
function variableCode(v: { motivation: { arrow: string }; perspective: { arrow: string };
  determination: { arrow: string }; environment: { arrow: string } }, accuracy: Accuracy, birthTime: string): string {
  if (windowFor(accuracy, birthTime || null) !== null) return "Unknown";
  const a = (x: { arrow: string }) => (x.arrow === "left" ? "L" : "R");
  return `P${a(v.motivation)}${a(v.perspective)} D${a(v.determination)}${a(v.environment)}`;
}

/** The provider's authority, named the way her library names it. */
function authorityName(value: string, type: string): string {
  const a = value.trim().toLowerCase();
  if (a === "ego") return type === "Manifestor" ? "Ego Manifested" : "Ego Projected";
  if (a === "lunar") return "Lunar";
  if (a === "mental" || a === "none" || a === "environment") return "Environment";
  if (a === "self" || a === "self projected" || a === "self-projected") return "Self Projected";
  return value.trim();
}

/** Her Delphi Basic text for everything the page counts, for the hovers. */
interface Tips { type: Record<string, string>; authority: Record<string, string>; definition: Record<string, string>;
  profile: Record<string, string>; center: Record<string, { themes: string; defined: string; undefined: string; open: string }>;
  cross: Record<string, { page: string; text: string }>; crossNumbered: Set<string> }
async function tips(): Promise<Tips> {
  const out: Tips = { type: {}, authority: {}, definition: {}, profile: {}, center: {}, cross: {}, crossNumbered: new Set() };
  try {
    const chunks = await loadLibraryChunks();
    const basic = (m: Record<string, unknown>) => String(m["Delphi Basic"] ?? m["Delphi Basic Description"] ?? "").trim();
    const CENTER_TITLE: Record<string, Center> = { "Root": "root", "Spleen": "spleen", "Sacral": "sacral", "Solar Plexus (Emotional)": "solar-plexus",
      "Ego (Heart, Will)": "heart", "G (Identity)": "g", "Throat": "throat", "Ajna": "ajna", "Head": "head" };
    for (const c of chunks) {
      const m = (c.metadata ?? {}) as Record<string, unknown>;
      const t = String(c.title ?? "").trim();
      if (c.source_kind === "type") out.type[t] = basic(m);
      if (c.source_kind === "definition" && basic(m)) out.definition[t] = basic(m);
      if (c.source_kind === "profile") out.profile[t.split(":")[0].trim()] = basic(m);
      if (c.source_kind === "cross" && basic(m)) {
        const k = crossKey(`${t} ${String(m.Cross ?? "")}`);
        if (k && !out.cross[k]) out.cross[k] = { page: t, text: basic(m) };
        // a cross whose versions are numbered in her library ("RAC of Eden 2")
        if (/\s\d+$/.test(t)) out.crossNumbered.add(`${k.charAt(0)}|${crossName(t)}`);
      }
      if (c.source_kind === "authority") {
        const name = t === "Lunar Authority" ? "Lunar" : t.startsWith("Environment") ? "Environment" : t;
        out.authority[name] = basic(m);
      }
      if (c.source_kind === "center" && CENTER_TITLE[t]) {
        out.center[CENTER_TITLE[t]] = { themes: String(m.Themes ?? "").trim(), defined: String(m["Delphi Defined Basic"] ?? "").trim(),
          undefined: String(m["Delphi Undefined Basic"] ?? "").trim(), open: String(m["Delphi Open Basic"] ?? "").trim() };
      }
    }
  } catch {
    // no library, no hovers: the numbers still show
  }
  return out;
}

function Tip({ text, children }: { text?: string; children: React.ReactNode }) {
  if (!text) return <>{children}</>;
  return <span className="tipwrap" tabIndex={0}>{children}<span className="tip" role="tooltip">{text}</span></span>;
}

// Just for fun (Kaycee, 2026-09-14): Sun sign, where people were born, and ages.
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
function signOf(sun?: { gate: number; line: number; color?: number; tone?: number; base?: number }): string {
  if (!sun) return "";
  return SIGNS[Math.floor(longitudeOf(sun.gate, sun.line, sun.color ?? 1, sun.tone ?? 1, sun.base ?? 1) / 30) % 12];
}
/** "Lodi, California, United States" -> "California"; outside the US, the country. */
function regionOf(place: string): string {
  const parts = place.split(",").map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return "";
  const country = parts[parts.length - 1];
  if (/^(united states|usa|us)$/i.test(country) && parts.length >= 2) return parts[parts.length - 2];
  return country;
}
function ageOf(birthDate: string): number | null {
  const b = new Date(birthDate + "T12:00:00Z");
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) a--;
  return a;
}
const AGE_BANDS: [string, number, number][] = [["Under 20", 0, 19], ["20s", 20, 29], ["30s", 30, 39], ["40s", 40, 49], ["50s", 50, 59], ["60s", 60, 69], ["70 and up", 70, 200]];

async function room(event: string): Promise<Person[]> {
  const db = createAdminClient();
  const { data } = await db.from("charts")
    .select("person_name, birth_date, birth_time, birth_timezone, birth_place, time_accuracy, created_at")
    .eq("source", event)
    .order("created_at");
  // Someone who signs up more than once is one person, counted by their newest
  // sign-up, the same rule the workshop Stage uses. Kaycee, 2026-09-17: "Only
  // count Patrick's most recent chart" (unknown birth time, he was experimenting).
  const first = (n: unknown) => String(n ?? "").trim().split(/\s+/)[0].toLowerCase();
  const rows = (data ?? []).filter((r, i, all) => !all.slice(i + 1).some((l) =>
    String(l.birth_date) === String(r.birth_date) && first(l.person_name) === first(r.person_name)));
  const people: Person[] = [];
  for (const r of rows) {
    try {
      const c = await getChart({
        birthDate: String(r.birth_date),
        birthTime: String(r.birth_time ?? "12:00").slice(0, 5),
        timezone: String(r.birth_timezone),
      });
      const defined = new Set((c.centers ?? []).filter((x) => x.defined)
        .map((x) => CENTER_FROM_API[x.name.toLowerCase()]).filter(Boolean));
      const split = readSplit({
        definedChannels: (c.channels ?? []).map((x) => x.id),
        definedCenters: [...defined],
        gates: [...c.activations.personality, ...c.activations.design].filter((a) => !SILENT.has(a.planet)).map((a) => a.gate),
      });
      let definition = /^no\b/i.test(c.definition.value.trim()) ? "No Definition"
        : c.definition.value.replace(/\s*Definition\s*$/i, "").trim();
      if (definition === "Split" && split.kind) definition = split.kind === "simple" ? "Simple Split" : "Wide Split";
      people.push({
        type: c.type.value,
        authority: authorityName(c.authority.value, c.type.value),
        definition,
        profile: (c.profile.value.match(/\d\s*\/\s*\d/) ?? [""])[0].replace(/\s/g, ""),
        // named the way the provider names it, without the gates
        cross: c.incarnationCross.value.replace(/\s*\([\d\s/|]+\)\s*$/, "").replace(/\s+/g, " ").trim(),
        crossKey: crossKey(c.incarnationCross.value),
        variables: variableCode(c.variables, String(r.time_accuracy ?? "document") as Accuracy, String(r.birth_time ?? "").slice(0, 5)),
        defined,
        // Chiron and Lilith are silent everywhere, so a gate only they hit does not count
        gates: new Set([...c.activations.personality, ...c.activations.design].filter((a) => !SILENT.has(a.planet)).map((a) => a.gate)),
        sign: signOf(c.activations.personality.find((a) => a.planet === "Sun")),
        place: regionOf(String(r.birth_place ?? "")),
        age: ageOf(String(r.birth_date)),
      });
    } catch {
      // one chart the provider cannot cast is left out of the counts, not the page
    }
  }
  return people;
}

// Each center split three ways: defined, undefined (gates but no channel), open (no gates)
function Centers({ people, tip }: { people: Person[]; tip: Tips["center"] }) {
  const total = people.length;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <section className="card wide">
      <h2>Centers</h2>
      {CENTER_ORDER.map((c) => {
        const d = people.filter((p) => p.defined.has(c)).length;
        const u = people.filter((p) => !p.defined.has(c) && CENTER_GATES[c].some((g) => p.gates.has(g))).length;
        const o = total - d - u;
        return (
          <div className="crow" key={c}>
            <span className="label"><Tip text={tip[c]?.themes}>{CENTER_NAME[c]}</Tip></span>
            <span className="stack">
              <i className="d" style={{ width: `${pct(d)}%` }} />
              <i className="u" style={{ width: `${pct(u)}%` }} />
              <i className="o" style={{ width: `${pct(o)}%` }} />
            </span>
            <em>
              <Tip text={tip[c]?.defined}>{d}</Tip> · <Tip text={tip[c]?.undefined}>{u}</Tip> · <Tip text={tip[c]?.open}>{o}</Tip>
            </em>
          </div>
        );
      })}
      <div className="key"><span className="d" />Defined <span className="u" />Undefined <span className="o" />Open</div>
    </section>
  );
}

function Bars({ title, rows, total, tip, wide }: { title: string; rows: [string, number][]; total: number; tip?: Record<string, string>; wide?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <section className={wide ? "card wide" : "card"}>
      <h2>{title}</h2>
      {rows.map(([k, n]) => (
        <div className="row" key={k}>
          <span className="label"><Tip text={tip?.[k]}>{k}</Tip></span>
          <span className="track"><i style={{ width: `${(n / max) * 100}%` }} /></span>
          <b>{n}</b>
          <em>{total ? Math.round((n / total) * 100) : 0}%</em>
        </div>
      ))}
    </section>
  );
}

/** Each cross with its versions beneath it, a version per row with its own words. */
function Crosses({ groups, total }: { groups: Map<string, Map<string, { n: number; text: string }>>; total: number }) {
  const sum = (g: Map<string, { n: number }>) => [...g.values()].reduce((t, r) => t + r.n, 0);
  const ordered = [...groups].sort((a, b) => sum(b[1]) - sum(a[1]) || a[0].localeCompare(b[0]));
  const max = Math.max(1, ...ordered.flatMap(([, g]) => [...g.values()].map((r) => r.n)));
  return (
    <section className="card wide">
      <h2>Incarnation Cross</h2>
      {ordered.map(([name, g]) => {
        const versions = [...g].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], undefined, { numeric: true }));
        return (
          <div className="xgroup" key={name}>
            {versions.length > 1 && <div className="xname">{name}<em>{sum(g)}</em></div>}
            {versions.map(([label, r]) => (
              <div className={versions.length > 1 ? "row xver" : "row"} key={label}>
                <span className="label"><Tip text={r.text}>{label}</Tip></span>
                <span className="track"><i style={{ width: `${(r.n / max) * 100}%` }} /></span>
                <b>{r.n}</b>
                <em>{total ? Math.round((r.n / total) * 100) : 0}%</em>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

export default async function EventStats({ params }: { params: Promise<{ event: string }> }) {
  const { event } = await params;
  const slug = (event ?? "").toLowerCase();
  const ev = EVENTS[slug];
  if (!ev) notFound();
  const [people, tip] = await Promise.all([room(slug), tips()]);
  const total = people.length;
  const ages = people.map((p) => p.age).filter((a): a is number => a !== null);
  // Crosses are always counted by version, because the versions are not the
  // same cross; versions of one cross sit together under its name. Kaycee,
  // 2026-09-17: "the crosses need to be split by version, always. They are not
  // the same, you can group them together though." A version is named by her
  // page ("RAC of Eden 2" is Eden 2) and carries that page's words, and only
  // when the page is the cross the provider named.
  const crossGroups = new Map<string, Map<string, { n: number; text: string }>>();
  for (const p of people) {
    if (!p.cross) continue;
    const hit = tip.cross[p.crossKey];
    const mine = hit && crossName(hit.page) === crossName(p.cross) ? hit : undefined;
    const num = mine ? (mine.page.match(/\s(\d+)$/) ?? [])[1]
      ?? (tip.crossNumbered.has(`${p.crossKey.charAt(0)}|${crossName(p.cross)}`) ? "1" : "") : "";
    const version = mine ? (num ? `${p.cross} ${num}` : p.cross)
      : `${p.cross} (${(p.crossKey.split("#")[2] ?? "").replace(/\//g, " ")})`;
    if (!crossGroups.has(p.cross)) crossGroups.set(p.cross, new Map());
    const g = crossGroups.get(p.cross)!;
    const row = g.get(version) ?? { n: 0, text: mine?.text ?? "" };
    row.n++;
    g.set(version, row);
  }
  const tally = (keys: string[] | null, of: (p: Person) => string): [string, number][] => {
    const n = new Map<string, number>();
    for (const p of people) { const k = of(p); if (k) n.set(k, (n.get(k) ?? 0) + 1); }
    const list = keys ?? [...n.keys()].sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0));
    return list.map((k) => [k, n.get(k) ?? 0]);
  };

  // the codes in order, with the unknown times last rather than mixed in
  const variableRows = tally(null, (p) => p.variables)
    .sort((a, b) => (a[0] === "Unknown" ? 1 : b[0] === "Unknown" ? -1 : b[1] - a[1] || a[0].localeCompare(b[0])));

  return (
    <main className={`events ${font.className}`}>
      <style>{`
        .events { min-height: 100vh; background: #fbf8fc; color: #1c1a2e; padding: 24px 18px 40px; }
        .events .wrap { max-width: 1040px; margin: 0 auto; }
        .events .brand { font-size: 12px; letter-spacing: .22em; text-transform: uppercase; color: #845095; }
        .events h1 { font-size: 24px; font-weight: 600; margin: 6px 0 2px; }
        .events .sub { color: #6b6478; font-size: 13px; }
        .events .count { display: flex; align-items: baseline; gap: 8px; margin: 14px 0 14px; }
        .events .count b { font-size: 44px; font-weight: 600; color: #845095; line-height: 1; }
        .events .count span { font-size: 15px; color: #6b6478; }
        .events .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; align-items: start; }
        .events .card { background: #fff; border: 1px solid rgba(132,80,149,.18); border-radius: 14px; padding: 11px 13px; }
        .events h2 { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #845095; font-weight: 600; margin: 0 0 6px; }
        .events .row { display: grid; grid-template-columns: minmax(0,1.7fr) minmax(30px,1fr) 18px 34px; gap: 8px; align-items: center; font-size: 12.5px; padding: 3px 0; }
        .events .label { white-space: normal; line-height: 1.3; }
        .events .track { height: 8px; background: #f1eaf5; border-radius: 5px; overflow: hidden; }
        .events .track i { display: block; height: 100%; background: #845095; border-radius: 5px; }
        .events .row b { text-align: right; font-weight: 600; }
        .events .row em { font-style: normal; font-size: 11px; color: #6b6478; text-align: right; }
        .events .wide { grid-column: 1 / -1; }
        .events .crow { display: grid; grid-template-columns: 110px 1fr 84px; gap: 10px; align-items: center; font-size: 12.5px; padding: 3px 0; }
        .events .stack { display: flex; height: 11px; border-radius: 6px; overflow: hidden; background: #f1eaf5; }
        .events .stack i, .events .key span { display: block; height: 100%; }
        .events .d { background: #845095; }
        .events .u { background: #c9b6e4; }
        .events .o { background: #fff; box-shadow: inset 0 0 0 1px rgba(132,80,149,.25); }
        .events .crow em { font-style: normal; font-size: 12px; color: #6b6478; text-align: right; }
        .events .key { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; color: #6b6478; }
        .events .key span { width: 12px; height: 12px; border-radius: 3px; margin-left: 10px; }
        .events .tipwrap { position: relative; cursor: help; outline: none; }
        .events .label .tipwrap { border-bottom: 1px dotted rgba(132,80,149,.45); }
        .events .crow em .tipwrap { border-bottom: 1px dotted rgba(132,80,149,.45); padding: 0 2px; }
        .events .crow em .tip { left: auto; right: 0; }
        .events .tip { display: none; position: absolute; left: 0; top: calc(100% + 6px); z-index: 20; width: min(340px, 80vw);
          background: #fff; color: #3b3550; border: 1px solid rgba(132,80,149,.25); border-radius: 12px; padding: 10px 12px;
          font-size: 13px; line-height: 1.5; white-space: normal; box-shadow: 0 10px 26px rgba(60,40,80,.16); text-transform: none; letter-spacing: normal; }
        .events .tipwrap:hover > .tip, .events .tipwrap:focus > .tip, .events .tipwrap:focus-within > .tip { display: block; }
        .events .label { overflow: visible; }
        .events .xgroup + .xgroup { border-top: 1px solid rgba(132,80,149,.08); margin-top: 3px; padding-top: 3px; }
        .events .xname { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 600; padding: 3px 0 1px; }
        .events .xname em { font-style: normal; font-size: 11px; color: #6b6478; font-weight: 400; }
        .events .xver .label { padding-left: 14px; }
        .events .foot { text-align: center; margin-top: 28px; font-size: 11px; letter-spacing: .3em; text-transform: uppercase; color: #9a93a8; }
      `}</style>
      <div className="wrap">
        <div className="brand">Delphi Human Design</div>
        <h1>{ev.name}</h1>
        <div className="sub">{ev.when} · {ev.where}</div>
        <div className="count"><b>{total}</b><span>{total === 1 ? "attendee" : "attendees"}</span></div>
        <div className="grid">
          <Bars title="Type" rows={tally(TYPE_ORDER, (p) => p.type)} total={total} tip={tip.type} />
          <Bars title="Authority" rows={tally(null, (p) => p.authority)} total={total} tip={tip.authority} />
          <Bars title="Definition" rows={tally(DEF_ORDER, (p) => p.definition)} total={total} tip={tip.definition} />
          <Bars title="Profile" rows={tally(null, (p) => p.profile)} total={total} tip={tip.profile} />
          <Bars title="Variables" rows={variableRows} total={total} />
          <Bars title="Sun Sign" rows={tally(SIGNS, (p) => p.sign)} total={total} />
          <Bars title="Born In" rows={tally(null, (p) => p.place)} total={total} />
          <Bars title={`Age${ages.length ? ` · average ${Math.round(ages.reduce((t, a) => t + a, 0) / ages.length)}` : ""}`}
            rows={AGE_BANDS.map(([k, lo, hi]) => [k, ages.filter((a) => a >= lo && a <= hi).length])} total={total} />
          <Crosses groups={crossGroups} total={total} />
          <Centers people={people} tip={tip.center} />
        </div>
        <div className="foot">Know Thyself</div>
      </div>
    </main>
  );
}
