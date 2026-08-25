// Reads the synced HD library (.cache/chunks.json) and serves the actual body
// content for gates, lines, and channels. This is what makes the transit report
// GROUNDED: the narrative interprets only from these entries (Kaycee's curated
// material), never from the model's own knowledge.
//
// Node-only (reads the filesystem); call from scripts, never app/client code.

import { readFileSync, existsSync } from "node:fs";

export interface LibEntry {
  title: string;
  body: string;
}

interface RawChunk {
  source_kind: string;
  title?: string;
  body?: string;
  gate_number?: number | null;
  line_number?: number | null;
}

export interface Library {
  gate(n: number): LibEntry | null;
  line(g: number, l: number): LibEntry | null;
  /** Channel by its two gates, either order. */
  channel(a: number, b: number): LibEntry | null;
  /** First entry of a kind whose title contains substr (case-insensitive). Used
   *  for type / authority / profile / definition / cross lookups by value. */
  matchByTitle(kind: string, substr: string): LibEntry | null;
  /** True when the library file was found and parsed. */
  loaded: boolean;
}

function clean(body: string): string {
  return body.replace(/\r/g, "").trim();
}

export function loadLibrary(path = ".cache/chunks.json"): Library {
  const gates = new Map<number, LibEntry>();
  const lines = new Map<string, LibEntry>();
  const channels = new Map<string, LibEntry>();
  const byKind = new Map<string, LibEntry[]>();
  let loaded = false;

  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, "utf8"));
      const arr: RawChunk[] = Array.isArray(data) ? data : (data.chunks ?? []);
      for (const c of arr) {
        const body = clean(String(c.body ?? ""));
        if (!body) continue;
        const entry: LibEntry = { title: String(c.title ?? ""), body };
        (byKind.get(c.source_kind) ?? byKind.set(c.source_kind, []).get(c.source_kind)!).push(entry);
        if (c.source_kind === "gate" && c.gate_number != null) {
          gates.set(Number(c.gate_number), entry);
        } else if (c.source_kind === "line" && c.gate_number != null && Number(c.line_number) >= 1) {
          lines.set(`${c.gate_number}.${c.line_number}`, entry);
        } else if (c.source_kind === "channel") {
          // Titles look like "44 - 26: The Channel of Surrender". Key by the two
          // leading gate numbers, low-high, so lookup works in either order.
          const m = String(c.title ?? "").match(/(\d+)\s*-\s*(\d+)/);
          if (m) {
            const [lo, hi] = [Number(m[1]), Number(m[2])].sort((x, y) => x - y);
            channels.set(`${lo}-${hi}`, entry);
          }
        }
      }
      loaded = true;
    } catch {
      /* leave loaded = false */
    }
  }

  return {
    loaded,
    gate: (n) => gates.get(n) ?? null,
    line: (g, l) => lines.get(`${g}.${l}`) ?? null,
    channel: (a, b) => {
      const [lo, hi] = [a, b].sort((x, y) => x - y);
      return channels.get(`${lo}-${hi}`) ?? null;
    },
    matchByTitle: (kind, substr) => {
      const needle = substr.trim().toLowerCase();
      if (!needle) return null;
      const list = byKind.get(kind) ?? [];
      return list.find((e) => e.title.toLowerCase().includes(needle)) ?? null;
    },
  };
}
