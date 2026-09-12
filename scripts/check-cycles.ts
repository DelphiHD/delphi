/**
 * Does the Node cycle maths agree with the Swiss Ephemeris one?
 *
 * lib/chart/cycles.ts is the reference: Python, Swiss Ephemeris, validated
 * against Maia Mechanics to the minute. It cannot run where a website chart is
 * built, so lib/hd/cycles-node.ts does the same arithmetic locally. This is the
 * check that the second one is allowed to exist.
 *
 * Run: npx tsx scripts/check-cycles.ts
 */

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { computeCycles } from "@/lib/chart/cycles";
import { cyclesFor } from "@/lib/hd/cycles-node";
import { getChart } from "@/lib/mybodygraph";
import { longitudeOf } from "@/lib/hd/gate-longitude";

const BIRTHS = [
  { label: "1983 Utah", date: "1983-06-17", time: "06:29", tz: "America/Denver", place: "Ogden, Utah, United States" },
  { label: "1962 Boston", date: "1962-01-08", time: "23:14", tz: "America/New_York", place: "Boston, Massachusetts, United States" },
  { label: "2004 Sydney", date: "2004-11-30", time: "04:05", tz: "Australia/Sydney", place: "Sydney, Australia" },
  { label: "1923 Italy", date: "1923-10-16", time: "12:00", tz: "Europe/Rome", place: "Rome, Italy" },
  { label: "1972 Palermo", date: "1972-11-25", time: "12:00", tz: "Europe/Rome", place: "Palermo, Sicily, Italy" },
];

const lonOf = (c: any, planet: string): number | null => {
  const a = (c.activations?.personality ?? []).find((p: any) => p.planet === planet);
  return a ? longitudeOf(a.gate, a.line, a.color, a.tone, a.base) : null;
};

const daysApart = (a: string, b: string) =>
  Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

async function main() {
  let worst = 0;
  let rows = 0;

  for (const b of BIRTHS) {
    const chart = await getChart({
      birthDate: b.date, birthTime: b.time, timezone: b.tz, locationQuery: b.place,
    });
    const reference = await computeCycles(chart.birth.utcDate);
    const mine = await cyclesFor({
      birthUtc: chart.birth.utcDate,
      natal: {
        Saturn: lonOf(chart, "Saturn")!,
        Uranus: lonOf(chart, "Uranus")!,
        Chiron: lonOf(chart, "Chiron"),
      },
    });

    const pairs: [string, { firstPass: string; allPasses: string[] }][] = [
      ["Saturn Return", reference.saturnReturn],
      ["Uranus Opposition", reference.uranusOpposition],
      ["Kiron Return", reference.chironReturn],
      ["Second Saturn Return", reference.secondSaturnReturn],
    ];

    console.log(`\n${b.label}`);
    for (const [label, ref] of pairs) {
      const got = mine.find((m) => m.label === label);
      if (!ref.firstPass) { console.log(`  ${label.padEnd(21)} reference has none`); continue; }
      if (!got) { console.log(`  ${label.padEnd(21)} MISSING in the node version`); worst = 999; continue; }
      const off = daysApart(ref.firstPass, got.firstPass);
      const passes = `${got.allPasses.length} vs ${ref.allPasses.length} passes`;
      if (got.allPasses.length !== ref.allPasses.length) worst = 999;
      worst = Math.max(worst, off); rows++;
      console.log(`  ${label.padEnd(21)} ref ${ref.firstPass}  node ${got.firstPass}  ${String(off).padStart(3)} day(s)  ${passes}`);
    }
  }
  console.log(`\n${rows} cycles compared, worst disagreement ${worst} day(s)`);
  if (worst > 1) { console.error("Too far apart to trust. Not shipping this."); process.exit(1); }

}

main();
