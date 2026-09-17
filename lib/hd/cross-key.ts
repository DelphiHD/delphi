/**
 * How a cross is told apart: its angle, its Personality Sun, and its four gates.
 *
 * The gates alone never identify a cross. Her Crosses database holds a
 * Juxtaposition and an angled cross on the same four gates for fifty quads, and
 * keying on the gates alone put the wrong cross's words on twenty charts
 * (2026-09-16). The same rules live in scripts/energy-flow-diagram.ts.
 */

/** "Left Angle Cross of Demands (52/58 | 21/48)" reads "L#52#21/48/52/58". */
export function crossKey(v: string): string {
  const m = v.match(/\(([\d\s/|]+)\)/);
  if (!m) return "";
  const a = /\b(lac|left angle)\b/i.test(v) ? "L" : /\b(rac|right angle)\b/i.test(v) ? "R"
    : /\b(jc|juxtaposition)\b/i.test(v) ? "J" : "";
  const g = m[1].split(/[^0-9]+/).filter(Boolean);
  if (!a || g.length !== 4) return "";
  return `${a}#${g[0]}#${[...g].sort((x, y) => Number(x) - Number(y)).join("/")}`;
}

/** "Left Angle Cross of Demands (52/58 | 21/48)" and "LAC of Demands 2" are both "demands". */
export function crossName(v: string): string {
  return v.toLowerCase()
    .replace(/\((?:[\d\s/|]+)\)/g, "")
    .replace(/^\s*(the\s+)?(right angle|left angle|juxtaposition)\s+cross\s+of\s+/, "")
    .replace(/^\s*(rac|lac|jc)\s+of\s+/, "")
    .replace(/\bthe\b/g, "")
    .replace(/\d+/g, "")
    .replace(/[^a-z]/g, "");
}
