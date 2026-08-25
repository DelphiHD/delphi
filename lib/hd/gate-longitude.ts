/**
 * Rave I'Ching wheel geometry.
 *
 * Maps the 64 Human Design gates to their fixed positions on the ecliptic.
 * Source of truth for both:
 *   - the mandala renderer (lib/render/mandala.ts)
 *   - any future longitude → gate.line lookup (e.g. transit calculation).
 *
 * Anchor: Gate 41 Line 1 starts at 2°00'00" Aquarius (ecliptic longitude 302°).
 * Confirmed against Kaycee's Black Book reference, 2026-05-27.
 *
 * Each gate spans 5.625° of the ecliptic (360° / 64 gates).
 * Each line spans 0.9375° within its gate (5.625° / 6 lines).
 *
 * Wheel direction: gates run in increasing ecliptic longitude, which
 * corresponds to counter-clockwise around the visual mandala when
 * Gate 41 is at the top. This matches the Delphi mandala template at
 * ~/Desktop/Delphi Brand Assets/Mandala Development/Mandala Template.png.
 */

export const WHEEL_ANCHOR_LONGITUDE = 302;
export const GATE_ARC_DEGREES = 5.625;
export const LINE_ARC_DEGREES = 0.9375;

/**
 * Gates in the order they appear around the wheel, starting at the anchor.
 * WHEEL_SEQUENCE[0] is the anchor gate (41); WHEEL_SEQUENCE[N] is at
 * longitude (302 + N * 5.625) mod 360.
 */
export const WHEEL_SEQUENCE: readonly number[] = [
  41, 19, 13, 49, 30, 55, 37, 63, 22, 36,
  25, 17, 21, 51, 42,  3, 27, 24,  2, 23,
   8, 20, 16, 35, 45, 12, 15, 52, 39, 53,
  62, 56, 31, 33,  7,  4, 29, 59, 40, 64,
  47,  6, 46, 18, 48, 57, 32, 50, 28, 44,
   1, 43, 14, 34,  9,  5, 26, 11, 10, 58,
  38, 54, 61, 60,
];

export interface GateRange {
  /** 1-64. */
  gate: number;
  /** 0-63: position on the wheel relative to the anchor. */
  wheelIndex: number;
  /** Ecliptic longitude where Line 1 starts (degrees, 0-360). */
  start: number;
  /** Ecliptic longitude where Line 6 ends (degrees, 0-360). May wrap. */
  end: number;
  /** Length 6: lines[i] is the longitude where Line (i+1) starts. */
  lines: readonly number[];
}

function normalize(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

const wheelIndexByGate = new Map<number, number>(
  WHEEL_SEQUENCE.map((gate, i) => [gate, i]),
);

export const GATE_RANGES: readonly GateRange[] = WHEEL_SEQUENCE.map(
  (gate, wheelIndex) => {
    const start = normalize(WHEEL_ANCHOR_LONGITUDE + wheelIndex * GATE_ARC_DEGREES);
    const end = normalize(start + GATE_ARC_DEGREES);
    const lines = Array.from({ length: 6 }, (_, k) =>
      normalize(start + k * LINE_ARC_DEGREES),
    );
    return { gate, wheelIndex, start, end, lines };
  },
);

export const RANGE_BY_GATE: ReadonlyMap<number, GateRange> = new Map(
  GATE_RANGES.map((r) => [r.gate, r]),
);

/**
 * Given a planet's exact ecliptic longitude, return which gate.line it
 * activates. Inverse of the line-start table.
 */
export function gateLineFromLongitude(longitude: number): {
  gate: number;
  line: number;
} {
  const fromAnchor = normalize(longitude - WHEEL_ANCHOR_LONGITUDE);
  const wheelIndex = Math.floor(fromAnchor / GATE_ARC_DEGREES);
  const intoGate = fromAnchor - wheelIndex * GATE_ARC_DEGREES;
  const line = Math.min(6, Math.floor(intoGate / LINE_ARC_DEGREES) + 1);
  return { gate: WHEEL_SEQUENCE[wheelIndex], line };
}

/**
 * Given a gate (1-64), return its wheel index (0-63) — its position
 * counter-clockwise from the anchor (Gate 41).
 */
export function wheelIndexOf(gate: number): number {
  const i = wheelIndexByGate.get(gate);
  if (i === undefined) {
    throw new Error(`gate ${gate} is not in 1..64`);
  }
  return i;
}

/**
 * Reconstruct a planet's exact ecliptic longitude from its full Human Design
 * fixing (gate.line.color.tone.base). Each level subdivides the one above by 6:
 * a line spans 0.9375°, a color 1/6 of that, a tone 1/6 of a color, a base 1/6
 * of a tone, so the fixing pins longitude to ~0.0007°. This lets the transit
 * animation interpolate smooth planetary motion from a handful of samples
 * instead of casting the sky hundreds of times.
 */
export function longitudeOf(
  gate: number,
  line: number,
  color = 1,
  tone = 1,
  base = 1,
): number {
  const range = RANGE_BY_GATE.get(gate);
  if (!range) throw new Error(`gate ${gate} is not in 1..64`);
  const lineStart = range.lines[line - 1];
  const fracIntoLine = (color - 1) / 6 + (tone - 1) / 36 + (base - 1) / 216;
  return normalize(lineStart + fracIntoLine * LINE_ARC_DEGREES);
}
