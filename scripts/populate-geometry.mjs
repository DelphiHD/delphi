// Populate 2 new conceptual entries in HD Geometry:
//   - "Cross Math: 7/1/4 Hexagram Structure"
//   - "Cross as Incarnation Purpose"
//
// Does NOT touch existing 3 angle entries (Right, Left, Juxtaposition) — Kaycee's content.

import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync("/Users/dorothygale/delphi/.env.local", "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g, "")]; })
);
const HEADERS = {
  "Authorization": `Bearer ${env.NOTION_TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};
const GEOMETRY_DS = "325e3fad-caaa-809e-9c75-000b07d412a7";

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function throttle() { return sleep(400); }

function richText(text, max = 1900) {
  if (!text) return [{ type: "text", text: { content: " " } }];
  const out = []; let r = text;
  while (r.length > 0) { out.push({ type: "text", text: { content: r.slice(0, max) } }); r = r.slice(max); }
  return out;
}
function paragraphs(text) {
  return (text || "").split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p)
    .map((p) => ({ object: "block", type: "paragraph", paragraph: { rich_text: richText(p) } }));
}
function toggle(summary, prose) {
  return { object: "block", type: "toggle",
    toggle: { rich_text: [{ type: "text", text: { content: summary } }], children: paragraphs(prose).slice(0, 100) } };
}
function callout(emoji, title, toggles) {
  return { object: "block", type: "callout",
    callout: { icon: { type: "emoji", emoji }, rich_text: [{ type: "text", text: { content: title } }], children: toggles } };
}

const P = {
  title: (s) => ({ title: [{ type: "text", text: { content: s } }] }),
  text: (s) => ({ rich_text: [{ type: "text", text: { content: s } }] }),
};

async function createPage(parentDsId, properties, blocks) {
  const r = await fetch(`https://api.notion.com/v1/pages`, {
    method: "POST", headers: HEADERS,
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: parentDsId },
      properties, children: blocks,
    }),
  });
  if (!r.ok) return { ok: false, error: `${r.status}: ${(await r.text()).slice(0,400)}` };
  const j = await r.json();
  return { ok: true, id: j.id };
}

const ENTRIES = [
  // First entry skipped — already created.
  /*
  {
    name: "Cross Math: 7/1/4 Hexagram Structure",
    props: {
      "DBHD Description": P.text("Each hexagram on the mandala wheel supports 12 cross variations distributed as 7 Right Angle + 1 Juxtaposition + 4 Left Angle. Within each angle's count, half are Foundation crosses and half are Changing crosses, distinguished by where the Personality Sun falls within a line's 56'15\" arc."),
    },
    emoji: "🔢",
    body_title: "Cross Math — the 7/1/4 hexagram structure",
    toggles: [
      ["The structure",
        "Each of the 64 hexagrams on the mandala wheel supports 12 cross variations. The distribution is: 7 Right Angle Cross variations + 1 Juxtaposition Cross variation + 4 Left Angle Cross variations. Within each angle's count, half of the variations are Foundation crosses and half are Changing crosses, distinguished by where the Personality Sun falls within the line's arc."],
      ["Line math (Foundation vs Changing)",
        "Each of the 6 lines in a hexagram has an arc of 56'15\". Within that arc, the Foundation portion is 48'45\" (the main body of the line, its basic nature). The last 7'30\" of every line is the Changing portion — a transition field where the line's nature begins to transform toward the next. Whether a chart's Personality Sun falls in the Foundation or Changing portion of its line determines whether the chart sits on a Foundation or Changing cross."],
      ["Naming convention",
        "Each cross has two names: a thematic name (e.g., 'The Cross of the Vessel of Love' — describes the cross's overarching theme across line variations) and a structural name (e.g., 'The Cross of Introspection' — describes the specific line variation active). The thematic name describes the hexagram-level theme; the structural name describes which Profile-line variant of that theme the chart actually carries."],
      ["Total cross count",
        "64 hexagrams × 12 variations = 768 theoretical cross-variation positions. Not all are unique cross-name entities; the same thematic cross name spans multiple line variations. The actual count of named crosses in the IHDS source is roughly 192."],
    ],
  },
  */
  {
    name: "Cross as Incarnation Purpose",
    props: {
      "DBHD Description": P.text("The Incarnation Cross is the chart's purpose — built from the four gates of Personality Sun + Personality Earth + Design Sun + Design Earth. NOT Sun/Earth + Nodes (correction per Kaycee 2026-05-28). The Cross is purpose; Type/Strategy/Authority is mechanics."),
    },
    emoji: "🎯",
    body_title: "Cross as Incarnation Purpose",
    toggles: [
      ["The four cross gates",
        "The Incarnation Cross is built from the four gates of: Personality Sun + Personality Earth + Design Sun + Design Earth. The Sun/Earth axis on each side (Personality and Design) gives the 4 cross gates. The 4 gates together form a cross figure on the mandala wheel — Personality axis perpendicular to Design axis."],
      ["Purpose, not mechanics",
        "The Cross is the chart's PURPOSE in incarnating. Type, Strategy, and Authority are its MECHANICS. Reading the Cross is reading what the chart is here to be / do / become; reading Type/Strategy/Authority is reading how the chart operates moment to moment. These two readings must remain distinct — the Cross is not 'a mission to pursue,' it is 'the naturally resulting function of the design lived correctly.'"],
      ["The 70% programming carrier convergence",
        "The Sun/Earth axis carries 70% of all programming (per Ra). The Cross is built from this 70%-programming carrier on BOTH sides (Personality and Design). So the Cross is the convergence of the chart's dominant programming into a single purpose-shape — not a peripheral overlay but the chart's structural spine."],
      ["Angle determines the geometry of the purpose",
        "Personality Sun's position within the 88° offset from the Design Sun determines whether the chart's Cross is Right Angle (Personal Destiny — the lower-trigram lines), Juxtaposition (Fixed Fate — the 4/1 only), or Left Angle (Trans-personal Karma — the 5th and 6th line Personality Sun positions). The angle is structural; it should be included in every discussion of the Cross."],
      ["The Quarter context",
        "Each Cross belongs to one of the four Quarters: Initiation, Civilization, Duality, Mutation. The Quarter is determined by where the Personality Sun's gate sits on the wheel. The Quarter frames the kind of work the Cross is here to do. The Cross discussion should include the Quarter context."],
    ],
  },
];

let ok = 0, err = 0;
for (const e of ENTRIES) {
  process.stdout.write(`  ${e.name.padEnd(50)}  `);
  const props = { "Name": P.title(e.name), ...e.props };
  const co = callout(e.emoji, e.body_title, e.toggles.map(([s, p]) => toggle(s, p)));
  const r = await createPage(GEOMETRY_DS, props, [co]);
  if (r.ok) { ok++; console.log(`✓`); }
  else { err++; console.log(`✗ ${r.error}`); }
  await throttle();
}
console.log(`\nDone. OK: ${ok}. Errors: ${err}.`);
