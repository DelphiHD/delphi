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
import type { Center } from "@/lib/hd/gate-center";

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

interface Person { type: string; authority: string; definition: string; profile: string; defined: Set<Center> }

async function room(event: string): Promise<Person[]> {
  const db = createAdminClient();
  const { data } = await db.from("charts")
    .select("birth_date, birth_time, birth_timezone")
    .eq("source", event);
  const people: Person[] = [];
  for (const r of data ?? []) {
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
        gates: [...c.activations.personality, ...c.activations.design].map((a) => a.gate),
      });
      let definition = /^no\b/i.test(c.definition.value.trim()) ? "No Definition"
        : c.definition.value.replace(/\s*Definition\s*$/i, "").trim();
      if (definition === "Split" && split.kind) definition = split.kind === "simple" ? "Simple Split" : "Wide Split";
      people.push({
        type: c.type.value,
        authority: c.authority.value,
        definition,
        profile: (c.profile.value.match(/\d\s*\/\s*\d/) ?? [""])[0].replace(/\s/g, ""),
        defined,
      });
    } catch {
      // one chart the provider cannot cast is left out of the counts, not the page
    }
  }
  return people;
}

function Bars({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <section className="card">
      <h2>{title}</h2>
      {rows.map(([k, n]) => (
        <div className="row" key={k}>
          <span className="label">{k}</span>
          <span className="track"><i style={{ width: `${(n / max) * 100}%` }} /></span>
          <b>{n}</b>
          <em>{total ? Math.round((n / total) * 100) : 0}%</em>
        </div>
      ))}
    </section>
  );
}

export default async function EventStats({ params }: { params: Promise<{ event: string }> }) {
  const { event } = await params;
  const slug = (event ?? "").toLowerCase();
  const ev = EVENTS[slug];
  if (!ev) notFound();
  const people = await room(slug);
  const total = people.length;
  const tally = (keys: string[] | null, of: (p: Person) => string): [string, number][] => {
    const n = new Map<string, number>();
    for (const p of people) { const k = of(p); if (k) n.set(k, (n.get(k) ?? 0) + 1); }
    const list = keys ?? [...n.keys()].sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0));
    return list.map((k) => [k, n.get(k) ?? 0]);
  };

  return (
    <main className={`events ${font.className}`}>
      <style>{`
        .events { min-height: 100vh; background: #fbf8fc; color: #1c1a2e; padding: 32px 20px 48px; }
        .events .wrap { max-width: 1080px; margin: 0 auto; }
        .events .brand { font-size: 12px; letter-spacing: .22em; text-transform: uppercase; color: #845095; }
        .events h1 { font-size: 30px; font-weight: 600; margin: 8px 0 2px; }
        .events .sub { color: #6b6478; font-size: 14px; }
        .events .count { display: flex; align-items: baseline; gap: 10px; margin: 22px 0 18px; }
        .events .count b { font-size: 64px; font-weight: 600; color: #845095; line-height: 1; }
        .events .count span { font-size: 18px; color: #6b6478; }
        .events .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
        .events .card { background: #fff; border: 1px solid rgba(132,80,149,.18); border-radius: 16px; padding: 14px 16px; }
        .events h2 { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #845095; font-weight: 600; margin: 0 0 8px; }
        .events .row { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1fr) 26px 40px; gap: 8px; align-items: center; font-size: 14px; padding: 4px 0; }
        .events .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .events .track { height: 10px; background: #f1eaf5; border-radius: 5px; overflow: hidden; }
        .events .track i { display: block; height: 100%; background: #845095; border-radius: 5px; }
        .events .row b { text-align: right; font-weight: 600; }
        .events .row em { font-style: normal; font-size: 12px; color: #6b6478; text-align: right; }
        .events .foot { text-align: center; margin-top: 28px; font-size: 11px; letter-spacing: .3em; text-transform: uppercase; color: #9a93a8; }
      `}</style>
      <div className="wrap">
        <div className="brand">Delphi Human Design</div>
        <h1>{ev.name}</h1>
        <div className="sub">{ev.when} · {ev.where}</div>
        <div className="count"><b>{total}</b><span>{total === 1 ? "chart in the room" : "charts in the room"}</span></div>
        <div className="grid">
          <Bars title="Type" rows={tally(TYPE_ORDER, (p) => p.type)} total={total} />
          <Bars title="Authority" rows={tally(null, (p) => p.authority)} total={total} />
          <Bars title="Definition" rows={tally(DEF_ORDER, (p) => p.definition)} total={total} />
          <Bars title="Profile" rows={tally(null, (p) => p.profile)} total={total} />
          <Bars title="Defined Centers" rows={CENTER_ORDER.map((c) => [CENTER_NAME[c], people.filter((p) => p.defined.has(c)).length])} total={total} />
        </div>
        <div className="foot">Know Thyself</div>
      </div>
    </main>
  );
}
