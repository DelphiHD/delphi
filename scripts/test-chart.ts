// Spot-check the mybodygraph wrapper against one of Kaycee's benchmark charts.
// Birth data below is for benchmark client #1.
// Run: npx tsx scripts/test-chart.ts

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { getChart, getTimezoneForLocation } from "../lib/mybodygraph";

async function main() {
  const location = "Ogden, Utah, United States";
  const timezone = await getTimezoneForLocation(location);
  console.log(`Resolved timezone for "${location}": ${timezone}\n`);

  const chart = await getChart({
    birthDate: "1983-06-17",
    birthTime: "06:29",
    timezone,
    locationQuery: location,
  });

  console.log("Chart:");
  console.log(JSON.stringify(chart, null, 2));

  console.log("\n--- Summary ---");
  console.log(`Type:        ${chart.type.value}`);
  console.log(`Strategy:    ${chart.strategy.value}`);
  console.log(`Authority:   ${chart.authority.value}`);
  console.log(`Profile:     ${chart.profile.value}`);
  console.log(`Definition:  ${chart.definition.value}`);
  console.log(`Cross:       ${chart.incarnationCross.value}`);
  console.log(`Quarter:     ${chart.quarter}`);
  console.log(`Signature:   ${chart.signature.value}`);
  console.log(`Not-self:    ${chart.notSelfTheme.value}`);
  console.log("");
  console.log("Variables (Kaycee's terms):");
  console.log(`  Determination: ${chart.variables.determination.arrow} (${chart.variables.determination.theme})`);
  console.log(`  Environment:   ${chart.variables.environment.arrow} (${chart.variables.environment.theme})`);
  console.log(`  Motivation:    ${chart.variables.motivation.arrow} (${chart.variables.motivation.theme})`);
  console.log(`  Perspective:   ${chart.variables.perspective.arrow} (${chart.variables.perspective.theme})`);
  console.log(`  Sense:         ${chart.variables.sense}`);
  console.log(`  Design Sense:  ${chart.variables.designSense}`);
  console.log("");
  console.log(`Centers (${chart.centers.filter((c) => c.defined).length} defined):`);
  for (const c of chart.centers) {
    console.log(`  ${c.name.padEnd(14)} ${c.defined ? "DEFINED" : "open   "} ${c.consciousness}`);
  }
  console.log("");
  console.log(`Channels (${chart.channels.length}):`);
  for (const ch of chart.channels) {
    console.log(`  ${ch.id.padEnd(8)} ${ch.consciousness}`);
  }
  console.log("");
  console.log(`Personality activations: ${chart.activations.personality.length}`);
  console.log(`Design activations:      ${chart.activations.design.length}`);

  const detriments = [...chart.activations.personality, ...chart.activations.design]
    .filter((p) => p.fixingState !== "None");
  if (detriments.length > 0) {
    console.log("\nNon-None FixingStates:");
    for (const d of detriments) {
      console.log(`  ${d.planet.padEnd(12)} ${d.gate}.${d.line} ${d.fixingState}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
