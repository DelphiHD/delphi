// Compute Saturn / Uranus opposition / Chiron / 2nd Saturn return dates from a
// birth UTC datetime, accounting for retrograde passes, by shelling out to
// scripts/compute-returns.py (which uses pyswisseph). Output validated against
// Maia Mechanics to the minute on 12 of 12 sample data points across 3 charts.
//
// We shell out rather than re-implement an ephemeris in TypeScript because
// (a) swisseph in C / Python is the gold-standard astrology library and has
// JPL planetary data baked in, (b) the Node.js ephemeris ports are weaker
// and incomplete, and (c) we already use Python 3 via subprocess for PDF
// parsing — the pattern is established.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ReturnCycle {
  firstPass: string;          // YYYY-MM-DD, the canonical return date (matches Maia Mechanics)
  firstPassDatetime: string;  // ISO with UTC time, second-precision
  allPasses: string[];        // 1 or 3 entries: the full retrograde dance
  status: "Passed" | "Current" | "Upcoming" | "unknown";
  windowEnd: string | null;
}

export interface Cycles {
  saturnReturn:        ReturnCycle;
  uranusOpposition:    ReturnCycle;
  chironReturn:        ReturnCycle;
  secondSaturnReturn:  ReturnCycle;
}

interface RawCycle {
  first_pass: string | null;
  first_pass_datetime: string | null;
  all_passes: string[];
  status: string;
  window_end: string | null;
}

interface RawCycles {
  saturn_return:        RawCycle;
  uranus_opposition:    RawCycle;
  chiron_return:        RawCycle;
  second_saturn_return: RawCycle;
}

function normalize(raw: RawCycle): ReturnCycle {
  return {
    firstPass:          raw.first_pass ?? "",
    firstPassDatetime:  raw.first_pass_datetime ?? "",
    allPasses:          raw.all_passes ?? [],
    status:             (["Passed", "Current", "Upcoming"].includes(raw.status)
                         ? raw.status
                         : "unknown") as ReturnCycle["status"],
    windowEnd:          raw.window_end,
  };
}

export async function computeCycles(birthUtcIso: string, nowUtcIso?: string): Promise<Cycles> {
  const args = ["scripts/compute-returns.py", birthUtcIso];
  if (nowUtcIso) args.push(nowUtcIso);
  const { stdout } = await execFileAsync("python3", args, { maxBuffer: 4 * 1024 * 1024 });
  const raw = JSON.parse(stdout) as RawCycles;
  return {
    saturnReturn:        normalize(raw.saturn_return),
    uranusOpposition:    normalize(raw.uranus_opposition),
    chironReturn:        normalize(raw.chiron_return),
    secondSaturnReturn:  normalize(raw.second_saturn_return),
  };
}

// Formatted block for the chart spec. The model reads these as canonical.
// Per Maia Mechanics convention, the first pass is the headline date; the
// full retrograde-dance window appears in parentheses when there are 3 passes.
export function formatCyclesBlock(c: Cycles): string {
  const fmt = (label: string, cy: ReturnCycle): string => {
    if (!cy.firstPass) return `  ${label}: unknown`;
    const passes = cy.allPasses.length > 1
      ? ` (full window: ${cy.allPasses[0]} → ${cy.allPasses[cy.allPasses.length - 1]}, ${cy.allPasses.length} passes)`
      : "";
    return `  ${label}: ${cy.firstPass} | ${cy.status}${passes}`;
  };
  const lines: string[] = [];
  lines.push("## Cycles (exact return dates, validated against Maia Mechanics)");
  lines.push(fmt("Saturn Return       ", c.saturnReturn));
  lines.push(fmt("Uranus Opposition   ", c.uranusOpposition));
  lines.push(fmt("Chiron Return       ", c.chironReturn));
  lines.push(fmt("Second Saturn Return", c.secondSaturnReturn));
  return lines.join("\n");
}
