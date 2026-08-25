/**
 * The 36 channels of the Human Design bodygraph, as gate pairs.
 *
 * Canonical reference geometry, same tier of source-of-truth as
 * lib/hd/gate-longitude.ts and lib/hd/gate-center.ts. A channel forms when
 * BOTH of its gates are activated. This table lets us answer, deterministically
 * and without a database round-trip, "if gate X is transiting, which channel
 * partners would it complete?" — the core of transit impact scoring.
 *
 * Names are Ra Uru Hu's standard channel keynotes. If Kaycee corrects a name
 * to her preferred phrasing, edit it here and nowhere else.
 * Verify against the Black Book when convenient.
 */

export interface ChannelDef {
  /** Gate pair, always stored low-high. */
  gates: [number, number];
  /** Standard channel keynote. */
  name: string;
}

export const CHANNELS: readonly ChannelDef[] = [
  { gates: [1, 8], name: "Inspiration" },
  { gates: [2, 14], name: "The Beat" },
  { gates: [3, 60], name: "Mutation" },
  { gates: [4, 63], name: "Logic" },
  { gates: [5, 15], name: "Rhythm" },
  { gates: [6, 59], name: "Mating" },
  { gates: [7, 31], name: "The Alpha" },
  { gates: [9, 52], name: "Concentration" },
  { gates: [10, 20], name: "Awakening" },
  { gates: [10, 34], name: "Exploration" },
  { gates: [10, 57], name: "Perfected Form" },
  { gates: [11, 56], name: "Curiosity" },
  { gates: [12, 22], name: "Openness" },
  { gates: [13, 33], name: "The Prodigal" },
  { gates: [16, 48], name: "The Wave Length" },
  { gates: [17, 62], name: "Acceptance" },
  { gates: [18, 58], name: "Judgment" },
  { gates: [19, 49], name: "Synthesis" },
  { gates: [20, 34], name: "Charisma" },
  { gates: [20, 57], name: "The Brain Wave" },
  { gates: [21, 45], name: "Money" },
  { gates: [23, 43], name: "Structuring" },
  { gates: [24, 61], name: "Awareness" },
  { gates: [25, 51], name: "Initiation" },
  { gates: [26, 44], name: "Surrender" },
  { gates: [27, 50], name: "Preservation" },
  { gates: [28, 38], name: "Struggle" },
  { gates: [29, 46], name: "Discovery" },
  { gates: [30, 41], name: "Recognition" },
  { gates: [32, 54], name: "Transformation" },
  { gates: [34, 57], name: "Power" },
  { gates: [35, 36], name: "Transitoriness" },
  { gates: [37, 40], name: "Community" },
  { gates: [39, 55], name: "Emoting" },
  { gates: [42, 53], name: "Maturation" },
  { gates: [47, 64], name: "Abstraction" },
];

/** Normalized "low-high" channel id, e.g. channelId(45, 21) === "21-45". */
export function channelId(a: number, b: number): string {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${lo}-${hi}`;
}

interface GateChannel {
  /** The other gate in the channel. */
  partner: number;
  name: string;
  id: string;
}

const CHANNELS_BY_GATE = new Map<number, GateChannel[]>();
for (const ch of CHANNELS) {
  const [a, b] = ch.gates;
  const id = channelId(a, b);
  (CHANNELS_BY_GATE.get(a) ?? CHANNELS_BY_GATE.set(a, []).get(a)!).push({ partner: b, name: ch.name, id });
  (CHANNELS_BY_GATE.get(b) ?? CHANNELS_BY_GATE.set(b, []).get(b)!).push({ partner: a, name: ch.name, id });
}

/**
 * Every channel that includes `gate`, with the partner gate that would
 * complete it. Empty for gates that sit in no channel (there are none in a
 * valid 1-64 chart, but the map only holds gates that appear above).
 */
export function channelsForGate(gate: number): readonly GateChannel[] {
  return CHANNELS_BY_GATE.get(gate) ?? [];
}
