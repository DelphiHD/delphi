/**
 * Does our 88-degree design calculation agree with bodygraph.com's?
 *
 * A return chart needs a design side of its own, and nobody computes that for
 * us: the provider only does it for a birth. So the way to trust ours is to
 * point it at real births, where the provider has already published its answer,
 * and see whether the two land on the same minute.
 *
 * Run: npx tsx scripts/check-return-design.ts
 */

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { getChart } from "@/lib/mybodygraph";
import { designMomentFor } from "@/lib/hd/return-chart";

const BIRTHS = [
  { label: "1983 Utah", date: "1983-06-17", time: "06:29", tz: "America/Denver", place: "Ogden, Utah, United States" },
  { label: "1962 Boston", date: "1962-01-08", time: "23:14", tz: "America/New_York", place: "Boston, Massachusetts, United States" },
  { label: "2004 Sydney", date: "2004-11-30", time: "04:05", tz: "Australia/Sydney", place: "Sydney, Australia" },
  { label: "1923 Italy", date: "1923-10-16", time: "12:00", tz: "Europe/Rome", place: "Rome, Italy" },
  { label: "1972 Palermo", date: "1972-11-25", time: "12:00", tz: "Europe/Rome", place: "Palermo, Sicily, Italy" },
  { label: "1956 Vienna", date: "1956-05-06", time: "18:30", tz: "Europe/Vienna", place: "Vienna, Austria" },
];

async function main() {
  let worst = 0;
  console.log("birth              provider's design         ours                      apart");
  for (const b of BIRTHS) {
    const chart = await getChart({
      birthDate: b.date, birthTime: b.time, timezone: b.tz, locationQuery: b.place,
    });
    const theirs = new Date(chart.birth.designUtcDate);
    const ours = designMomentFor(chart.birth.utcDate);
    if (!ours) { console.log(`${b.label.padEnd(18)} ours could not be computed`); worst = 9e9; continue; }
    const mins = Math.round(Math.abs(theirs.getTime() - ours.getTime()) / 60000);
    worst = Math.max(worst, mins);
    const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + "Z";
    console.log(`${b.label.padEnd(18)} ${fmt(theirs).padEnd(25)} ${fmt(ours).padEnd(25)} ${mins} min`);
  }
  console.log(`\nworst disagreement: ${worst} minute(s)`);
  if (worst > 60) { console.error("Too far apart to build a return chart on."); process.exit(1); }
}

main();
