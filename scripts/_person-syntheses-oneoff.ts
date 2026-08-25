// One-off: generate ONLY the individual transit syntheses (the "Who Feels It
// Most" per-person prose) for a date, as a clean shareable file. Decoupled from
// the sync and the full report: it reads the already-synced gate/channel bodies
// and today's cached natal charts, so it runs in a minute or two. Delete after use.
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

import type { Chart } from "@/lib/chart/types";
import { castSkyAt, assertTraditionalBodies } from "@/lib/transit/sky";
import { loadLibraryNames, type LibraryNames } from "@/lib/hd/library-names";
import { loadLibrary, type Library } from "@/lib/hd/library";
import { rankImpacts, type ClientImpact } from "@/lib/transit/impact";
import { buildPersonReads } from "@/lib/report/transit";
import { CLIENTS } from "./client-roster";

const date = process.env.TRANSIT_DATE ?? "2026-07-29";
const apiKey = process.env.ANTHROPIC_API_KEY!;

function loadNatal(slug: string): Chart | null {
  const p = resolve(".cache", "charts", `${slug}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Chart) : null;
}

// Same per-person input builder as the full report (kept in sync by hand for this
// one-off): definition + completions + U-shape READ rule + grounded source.
function personReadItems(impacts: ClientImpact[], names: LibraryNames, library: Library) {
  const items: { key: string; label: string; source: string }[] = [];
  for (const i of impacts) {
    if (!i.completions.length && !i.reinforcements) continue;
    let rule: string;
    if (i.definition.type === "split" && i.definition.splitKind === "simple") {
      rule = "READ: simple split. If a completion below is marked BRIDGES SPLIT, lead with it, today's field temporarily closes the gap in their definition and that bridge is the single thing most worth watching. Otherwise read through the open center a transit lights.";
    } else if (i.definition.type === "triple" || i.definition.type === "quadruple") {
      rule = "READ: many islands, so bridging is background noise. Read their conditioning through which OPEN CENTER a transit lights today.";
    } else {
      rule = "READ: read their conditioning through which OPEN CENTER a transit lights today.";
    }
    const comps = i.completions.map((c) =>
      `- ${c.planet} in gate ${c.transitGate} (${names.gate(c.transitGate)}) completes channel ${c.channelId} ${c.channelName} with their natal ${c.natalGate} (${names.gate(c.natalGate)})`
      + (c.bridgesSplit ? "; BRIDGES SPLIT" : "")
      + (c.definesOpenCenter ? `; lights their open ${c.center} center` : `; ${c.center} center`)
      + ` [${c.duration}]`).join("\n");
    const label = `${i.name} — ${i.definitionLabel}\n${rule}\nCompletions today:\n${comps || `(no channel completions; ${i.reinforcements} natal gate(s) reinforced)`}`;
    const srcParts: string[] = [];
    const seen = new Set<string>();
    for (const c of i.completions) {
      const ch = library.channel(c.transitGate, c.natalGate);
      if (ch && !seen.has(`ch${c.channelId}`)) { seen.add(`ch${c.channelId}`); srcParts.push(`CHANNEL ${c.channelId} ${ch.title}\n${ch.body}`); }
      const g = library.gate(c.transitGate);
      if (g && !seen.has(`g${c.transitGate}`)) { seen.add(`g${c.transitGate}`); srcParts.push(`GATE ${c.transitGate} ${g.title}\n${g.body}`); }
    }
    items.push({ key: `person:${i.slug}`, label, source: srcParts.join("\n\n") || "(no additional source)" });
  }
  return items;
}

async function main() {
  const names = loadLibraryNames();
  const library = loadLibrary();
  const now = await castSkyAt(date, "12:00", "UTC");
  assertTraditionalBodies(now.positions, "one-off syntheses");

  const people: { client: { slug: string; name: string }; chart: Chart }[] = [];
  for (const c of Object.values(CLIENTS)) {
    const chart = loadNatal(c.slug);
    if (chart) people.push({ client: { slug: c.slug, name: c.name }, chart });
  }
  console.log(`${people.length} natal charts loaded from cache`);
  const impacts = rankImpacts(people, now.positions);

  const items = personReadItems(impacts, names, library);
  const identityMd = readFileSync("docs/IDENTITY.md", "utf8");
  const voiceMd = readFileSync("docs/VOICE.md", "utf8");
  console.log(`Writing ${items.length} individual syntheses (Haiku 4.5)…`);
  const reads = await buildPersonReads({ people: items, identityMd, voiceMd, apiKey, hardCostCeilingCents: 80 });
  console.log(`  ${Object.keys(reads).length}/${items.length} returned`);

  const out: string[] = [`# Individual Transit Syntheses`, ``, `**${date}** · Delphi HD`, ``, `---`, ``];
  let rank = 0;
  for (const i of impacts) {
    rank++;
    const r = reads[`person:${i.slug}`];
    if (!r) continue;
    out.push(`## ${i.name}`, ``, r, ``);
  }
  const dir = resolve(homedir(), "Desktop", "HD Reports", "Transits");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, `${date} - Individual Transit Syntheses.md`);
  writeFileSync(path, out.join("\n").replace(/[—―]/g, ", "));
  console.log(`\n✓ published: ${path}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
