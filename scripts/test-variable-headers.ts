// Smoke test: verify the deterministic variable headers match Kaycee's spec.

import { buildVariableHeader } from "@/lib/chart/variables";

const cases = [
  // Tennyson's expected per Kaycee's correction in the v4.2 errors page:
  { args: { variable: "Determination" as const, colorNumber: 3, toneNumber: 3, arrow: "left" as const },
    expected: "Digestion - Color 3: Thirst, Left Arrow | Active: Hot, Tone 3: Outer Vision" },

  // Other cases for sanity
  { args: { variable: "Environment" as const, colorNumber: 1, toneNumber: 4, arrow: "right" as const },
    expected: "Environment - Color 1: Caves, Right Arrow | Passive, Tone 4: Inner Vision" },
  { args: { variable: "Motivation" as const, colorNumber: 1, toneNumber: 3, arrow: "left" as const },
    expected: "Motivation - Color 1: Fear, Left Arrow | Active, Tone 3: Action, Transference: Need" },
  { args: { variable: "Perspective" as const, colorNumber: 1, toneNumber: 4, arrow: "right" as const },
    expected: "Perspective - Color 1: Survival, Right Arrow | Passive, Tone 4: Meditation, Distraction: Wanting" },
  { args: { variable: "Determination" as const, colorNumber: 1, toneNumber: 6, arrow: "right" as const },
    expected: "Digestion - Color 1: Cave Diet, Right Arrow | Passive: Alternating, Tone 6: Touch" },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const got = buildVariableHeader(c.args);
  const ok = got === c.expected;
  console.log(`${ok ? "✓" : "✗"} ${JSON.stringify(c.args)}`);
  console.log(`    got:      ${got}`);
  if (!ok) console.log(`    expected: ${c.expected}`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass}/${pass + fail} pass`);
process.exit(fail === 0 ? 0 : 1);
