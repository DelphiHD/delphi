/**
 * The QR code an event organiser gets sent.
 *
 * Once a code is printed on a card, put in a slide, or forwarded to somebody
 * else's mailing list, it is out of our hands forever. So this points at a short
 * permanent address and nothing else: charts.delphihd.com/e/<event>. What sits
 * behind that address can change every week without a single code going stale.
 *
 * Drawn to match the event's own artwork rather than a stock black square on
 * white, because it is going next to that artwork. Dark ground, bone-white code,
 * the event's gold for the type.
 *
 * Two files, because organisers ask for different things and it is easier to
 * send both than to be asked twice:
 *   - a card, artwork with the event's name and the instruction
 *   - a plain code on a transparent ground, for dropping into their own design
 *
 * Run: npx tsx scripts/event-qr.ts bfki
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";

const SITE = "https://charts.delphihd.com";

interface Event {
  slug: string;
  name: string;
  when: string;
  where: string;
  /** What the card tells somebody they are about to do. */
  action: string;
  line: string;
}

const EVENTS: Record<string, Event> = {
  bfki: {
    slug: "bfki",
    name: "The Big Fucking Kick It",
    when: "September 14 to 18, 2026",
    where: "Lava Hot Springs, Idaho",
    action: "Pre-register for the Human Design workshop",
    line: "Scan it, answer four questions, get your chart. Do it before you lose signal.",
  },
};

// The event's own palette, read off its poster.
const INK = "#12100e";        // the dark of the artwork
const BONE = "#efe7d8";       // its off-white lettering
const GOLD = "#e0a419";       // its gold
const DIM = "#b9ad99";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The code itself, as SVG paths we can colour and place ourselves. */
async function codeSvg(url: string, dark: string): Promise<{ inner: string; size: number }> {
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",   // survives being printed badly and photographed worse
    margin: 0,
    color: { dark, light: "#00000000" },
  });
  const size = Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1] ?? 0);
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return { inner, size };
}

async function main() {
  const slug = (process.argv[2] ?? "").toLowerCase();
  const ev = EVENTS[slug];
  if (!ev) {
    console.error(`No such event: ${slug || "(none given)"}. Known: ${Object.keys(EVENTS).join(", ")}`);
    process.exit(1);
  }

  const url = `${SITE}/e/${ev.slug}`;
  const out = join(
    process.env.HOME ?? ".",
    "Desktop", "HD Reports", "Events", ev.name,
  );
  mkdirSync(out, { recursive: true });

  // ── the card ────────────────────────────────────────────────────────────
  const W = 1080, H = 1350;
  const q = await codeSvg(url, BONE);
  const qSize = 620;
  const qx = (W - qSize) / 2, qy = 366;
  const scale = qSize / q.size;

  const card = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c1813"/>
      <stop offset="1" stop-color="${INK}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" fill="none" stroke="${GOLD}" stroke-opacity=".5" stroke-width="3"/>

  <text x="${W / 2}" y="132" text-anchor="middle" fill="${GOLD}"
        font-family="Helvetica Neue, Arial, sans-serif" font-size="27" font-weight="700" letter-spacing="7">DELPHI HUMAN DESIGN</text>

  <text x="${W / 2}" y="228" text-anchor="middle" fill="${BONE}"
        font-family="Helvetica Neue, Arial, sans-serif" font-size="62" font-weight="800" letter-spacing="1">KNOW THYSELF.</text>

  <text x="${W / 2}" y="290" text-anchor="middle" fill="${DIM}"
        font-family="Helvetica Neue, Arial, sans-serif" font-size="28" letter-spacing="2">${esc(ev.action)}</text>

  <rect x="${qx - 26}" y="${qy - 26}" width="${qSize + 52}" height="${qSize + 52}" fill="#ffffff" fill-opacity=".04" rx="10"/>
  <g transform="translate(${qx} ${qy}) scale(${scale})">${q.inner}</g>

  <text x="${W / 2}" y="${qy + qSize + 108}" text-anchor="middle" fill="${BONE}"
        font-family="Helvetica Neue, Arial, sans-serif" font-size="46" font-weight="800" letter-spacing="1">${esc(ev.name.toUpperCase())}</text>
  <text x="${W / 2}" y="${qy + qSize + 156}" text-anchor="middle" fill="${GOLD}"
        font-family="Helvetica Neue, Arial, sans-serif" font-size="26" font-weight="600" letter-spacing="3">${esc(ev.when.toUpperCase())} &#183; ${esc(ev.where.toUpperCase())}</text>

  <text x="${W / 2}" y="${qy + qSize + 216}" text-anchor="middle" fill="${DIM}"
        font-family="Helvetica Neue, Arial, sans-serif" font-size="24">${esc(ev.line)}</text>

  <text x="${W / 2}" y="${H - 54}" text-anchor="middle" fill="${DIM}"
        font-family="Helvetica Neue, Arial, sans-serif" font-size="25" letter-spacing="1">${esc(url.replace("https://", ""))}</text>
</svg>`;

  // ── the bare code, for their own layout ────────────────────────────────
  const p = await codeSvg(url, INK);
  const plain = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 ${p.size} ${p.size}">${p.inner}</svg>`;

  writeFileSync(join(out, `${ev.slug}-registration-card.svg`), card);
  writeFileSync(join(out, `${ev.slug}-qr-plain.svg`), plain);
  await QRCode.toFile(join(out, `${ev.slug}-qr-plain.png`), url, {
    errorCorrectionLevel: "H", margin: 2, width: 1400,
    color: { dark: INK, light: "#ffffffff" },
  });

  console.log(`${ev.name}`);
  console.log(`  points at: ${url}`);
  console.log(`  folder:    ${out}`);
  console.log(`  card:      ${ev.slug}-registration-card.svg`);
  console.log(`  plain:     ${ev.slug}-qr-plain.svg and .png`);
}

main();
