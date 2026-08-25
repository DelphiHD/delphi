// Kaycee's established gate and line names, loaded from the synced Notion
// library cache (.cache/chunks.json). This is the same source the interactive
// chart uses, so transit output speaks in her vocabulary ("The Creative",
// "Deliverance") rather than the generic Ra placeholders in gate-names.ts.
//
// Node-only (reads the filesystem); call from scripts, never from app/client code.

import { readFileSync, existsSync } from "node:fs";
import { gateName as staticGateName } from "@/lib/hd/gate-names";

/** Channel metadata for a standardized header, from the synced HD Channels DB. */
export interface ChannelMeta {
  /** Full established name, e.g. "44 - 26: The Channel of Surrender". */
  name: string;
  /** "Channel Type" property, e.g. "PROJECTED". Empty if not set. */
  type: string;
  /** Circuit the channel belongs to (from the "Circuit" relation, resolved by the
   *  sync to the linked circuit page name). Empty if not set. */
  circuit: string;
  /** "Keynote" property, e.g. "a design of a Transmitter". Empty if not set. */
  keynote: string;
}

export interface LibraryNames {
  /** Established gate keynote, e.g. gate(40) -> "Deliverance". */
  gate(n: number): string;
  /** Established line name, e.g. line(62, 1) -> "Routine". Empty if unknown. */
  line(g: number, l: number): string;
  /** DBHD plain-language function for the gate, from the "Function - DBHD - The 9
   *  Centers" property, e.g. func(53) -> "Pressure to begin, to start new things."
   *  Empty if not in the library yet. */
  func(g: number): string;
  /** Channel metadata by its two gates, either order. Null if not in the library. */
  channel(a: number, b: number): ChannelMeta | null;
}

export function loadLibraryNames(path = ".cache/chunks.json"): LibraryNames {
  const gates = new Map<number, string>();
  const lines = new Map<string, string>();
  const funcs = new Map<number, string>();
  const channels = new Map<string, ChannelMeta>();

  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, "utf8"));
      const arr: Array<Record<string, unknown>> = Array.isArray(data)
        ? data
        : (data.chunks || Object.values(data)[0]);
      for (const c of arr) {
        const kind = c.source_kind;
        const title = String(c.title ?? "").trim();
        if (kind === "gate" && c.gate_number != null) {
          // "40: Deliverance" -> "Deliverance"
          const name = title.replace(/^\s*\d+\s*:\s*/, "").trim();
          if (name) gates.set(Number(c.gate_number), name);
          const md = c.metadata as Record<string, string> | undefined;
          const fn = md?.["Function - DBHD - The 9 Centers"];
          if (fn && String(fn).trim()) funcs.set(Number(c.gate_number), String(fn).trim());
        } else if (kind === "line" && c.gate_number != null && Number(c.line_number) >= 1) {
          // "62.1 Routine" -> "Routine"
          const name = title.replace(/^\s*\d+\.\d+\s*/, "").trim();
          if (name) lines.set(`${c.gate_number}.${c.line_number}`, name);
        } else if (kind === "channel") {
          // Title/Name like "44 - 26: The Channel of Surrender". Key by the gate
          // pair, low-high, so lookup works in either order. Type + Keynote come
          // from the synced HD Channels metadata.
          const md = c.metadata as Record<string, string> | undefined;
          const name = String(md?.["Name"] ?? title).trim();
          const m = name.match(/(\d+)\s*-\s*(\d+)/) ?? title.match(/(\d+)\s*-\s*(\d+)/);
          if (m) {
            const [lo, hi] = [Number(m[1]), Number(m[2])].sort((x, y) => x - y);
            // Circuit comes from a relation the sync resolves to the linked circuit
            // page name; match any property whose name contains "circuit" so the
            // exact label in Notion (Circuit / Circuitry / ...) does not matter.
            let circuit = "";
            if (md) {
              for (const [k, v] of Object.entries(md)) {
                if (/circuit/i.test(k) && String(v).trim()) { circuit = String(v).trim(); break; }
              }
            }
            channels.set(`${lo}-${hi}`, {
              name,
              type: String(md?.["Channel Type"] ?? "").trim(),
              circuit,
              keynote: String(md?.["Keynote"] ?? "").trim(),
            });
          }
        }
      }
    } catch {
      /* fall through to static fallback */
    }
  }

  return {
    gate: (n) => gates.get(n) ?? staticGateName(n),
    line: (g, l) => lines.get(`${g}.${l}`) ?? "",
    func: (g) => funcs.get(g) ?? "",
    channel: (a, b) => {
      const [lo, hi] = [a, b].sort((x, y) => x - y);
      return channels.get(`${lo}-${hi}`) ?? null;
    },
  };
}
