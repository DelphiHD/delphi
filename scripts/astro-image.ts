/**
 * Render one person's astrology wheel straight to a PNG.
 *
 * Kaycee, 2026-08-31, needing an image of a client's wheel with the chart page's
 * Save Image button broken on every chart but her own: "I just need an image of
 * Sarah Marie's astrology chart somehow. I'll just screenshot I guess."
 * Screenshotting a chart she can render properly is not an acceptable answer, so
 * this makes the same wheel the page draws, at print resolution, from the
 * terminal.
 *
 *   npx tsx scripts/astro-image.ts <slug>
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { CLIENTS, clientOutputDir, placeForLookup } from "./client-roster";
import { getAstro } from "@/lib/astro";
import { getChart, getTimezoneForLocation } from "@/lib/mybodygraph";
import { renderWheel } from "./astro-wheel";

async function main() {
  const slug = process.argv[2];
  const brief = CLIENTS[slug];
  if (!brief) {
    console.error(`usage: npx tsx scripts/astro-image.ts <slug>\nknown: ${Object.keys(CLIENTS).join(", ")}`);
    process.exit(1);
  }

  const place = placeForLookup(brief);
  const astro = await getAstro({ birthDate: brief.birthDate, birthTime: brief.birthTime, place });

  // The design side is the same person at the design moment; the HD response
  // carries that instant exactly, so the wheel shows both sides the way the
  // chart page does.
  let design = null;
  let carried: number[] = [], personality: number[] = [], designGates: number[] = [];
  try {
    const tz = await getTimezoneForLocation(place);
    const hd = await getChart({
      birthDate: brief.birthDate, birthTime: brief.birthTime, timezone: tz, locationQuery: place,
    } as never) as unknown as {
      designUtcDate?: string;
      activations?: { personality?: { gate: number }[]; design?: { gate: number }[] };
    };
    const p = (hd.activations?.personality ?? []).map((a) => a.gate);
    const d = (hd.activations?.design ?? []).map((a) => a.gate);
    personality = [...new Set(p)];
    designGates = [...new Set(d)];
    carried = [...new Set([...p, ...d])];
    if (hd.designUtcDate) {
      design = await getAstro({ birthDate: brief.birthDate, birthTime: brief.birthTime, place, atUtc: hd.designUtcDate });
    }
  } catch (e) {
    console.log(`  design side unavailable (${(e as Error).message}); drawing the personality wheel alone`);
  }

  let svg = renderWheel(astro, brief.name, design, "aries", carried, personality, designGates);

  // Chiron and Lilith are not in Montserrat, and the renderer draws .notdef
  // boxes rather than reaching for another font on its own. Naming the symbol
  // families in the font stack gives it somewhere to go for those two glyphs
  // while every other character stays in Montserrat.
  svg = svg.replace(
    /font-family="Montserrat, 'Helvetica Neue', sans-serif"/g,
    `font-family="Montserrat, 'Apple Symbols', 'Arial Unicode MS', 'Helvetica Neue', sans-serif"`,
  );

  // Montserrat carries no Chiron or Lilith glyph, so those two came out as empty
  // boxes in the first render. A symbol font goes in alongside it to catch them.
  const fontFiles = [
    "/Library/Fonts/Montserrat-Regular.ttf",
    join(process.env.HOME ?? "", "Library/Fonts/Montserrat-Regular.ttf"),
    join(process.cwd(), "assets/fonts/Montserrat-Regular.ttf"),
    "/System/Library/Fonts/Apple Symbols.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  ].filter((p) => existsSync(p));

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: 2400 },          // print resolution, not a screenshot
    font: { fontFiles, loadSystemFonts: true, defaultFontFamily: "Montserrat" },
  }).render().asPng();

  const dir = clientOutputDir(brief);
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `${brief.name} - Astrology Wheel.png`);
  writeFileSync(out, png);
  console.log(`\n✓ ${out}`);
  console.log(`  ${Math.round(png.length / 1024)} KB, 2400px wide`);
}
main();
