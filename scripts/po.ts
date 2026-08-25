// One-command pipeline for a client's Planetary Overview deliverable.
// Runs: generate markdown → render docx → export mandala PNGs.
// All output lands in ~/Desktop/HD Reports/<Client Name>/.
//
//   npx tsx scripts/po.ts <slug>
//
// Example:
//   npx tsx scripts/po.ts brit

import { spawnSync } from "node:child_process";
import { clientFromSlug } from "./client-roster";

function run(label: string, args: string[]): void {
  console.log(`\n──── ${label} ────`);
  const r = spawnSync("npx", ["tsx", ...args], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

const slug = process.argv[2];
const client = clientFromSlug(slug);

console.log(`\n=== Planetary Overview pipeline for ${client.name} (${client.slug}) ===`);

run("1/3  Generate markdown", ["scripts/generate-report.ts", slug, "planetary"]);
run("2/3  Render docx",        ["scripts/render-planetary-docx.ts", slug]);
run("3/3  Export mandala PNGs", ["scripts/export-mandala-pngs.ts", slug]);

console.log(`\n✓ Done. Output in ~/Desktop/HD Reports/${client.name}/`);
