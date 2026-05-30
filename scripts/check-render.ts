import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
const svg = readFileSync("/Users/dorothygale/Desktop/Mandala Renderer Output/Matt Report/matt-full.svg", "utf8");
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 1600 },
  font: { loadSystemFonts: true },
});
const png = resvg.render().asPng();
writeFileSync("/tmp/matt-resvg.png", png);
console.log("wrote /tmp/matt-resvg.png");
