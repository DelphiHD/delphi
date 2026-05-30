// Populate HD Planets with v1 properties + structured callout body.
//
// For the 13 existing planet entries: UPDATE properties only, APPEND a callout
// containing structured per-planet content (Kaycee's existing body content is
// preserved). For Chiron (not yet in the database): CREATE as new entry.
//
// Source: planetary-conditioning-extract.md.

import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync("/Users/dorothygale/delphi/.env.local", "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g, "")]; })
);

const NOTION_TOKEN = env.NOTION_TOKEN;
const HEADERS = {
  "Authorization": `Bearer ${NOTION_TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json",
};
const PLANETS_DS_ID = "26ce3fad-caaa-80a7-a363-000b711da6c6";

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function throttle() { return sleep(400); }

function richText(text, max = 1900) {
  if (!text) return [{ type: "text", text: { content: " " } }];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push({ type: "text", text: { content: remaining.slice(0, max) } });
    remaining = remaining.slice(max);
  }
  return chunks;
}

function paragraphs(text) {
  return (text || "").split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p).map((p) => ({
    object: "block", type: "paragraph", paragraph: { rich_text: richText(p) },
  }));
}

function toggle(summary, prose) {
  return { object: "block", type: "toggle",
    toggle: { rich_text: [{ type: "text", text: { content: summary } }], children: paragraphs(prose).slice(0, 100) } };
}

function callout(title, toggles) {
  return { object: "block", type: "callout",
    callout: { icon: { type: "emoji", emoji: "🪐" },
      rich_text: [{ type: "text", text: { content: title } }], children: toggles } };
}

async function listPlanets() {
  const r = await fetch(`https://api.notion.com/v1/databases/26ce3fadcaaa800f9611c428ce9f3383/query`, {
    method: "POST", headers: HEADERS, body: JSON.stringify({ page_size: 100 }),
  });
  const j = await r.json();
  const m = new Map();
  for (const p of j.results) {
    const t = (p.properties?.Name?.title || []).map(x => x.plain_text).join("").trim();
    m.set(t, p.id);
  }
  return m;
}

async function updatePageProperties(pageId, properties) {
  const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH", headers: HEADERS, body: JSON.stringify({ properties }),
  });
  if (!r.ok) return { ok: false, error: `${r.status}: ${(await r.text()).slice(0,300)}` };
  return { ok: true };
}

async function appendBlocks(pageId, blocks) {
  const r = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: "PATCH", headers: HEADERS, body: JSON.stringify({ children: blocks }),
  });
  if (!r.ok) return { ok: false, error: `${r.status}: ${(await r.text()).slice(0,300)}` };
  return { ok: true };
}

async function createPage(parentDsId, properties, blocks) {
  const r = await fetch(`https://api.notion.com/v1/pages`, {
    method: "POST", headers: HEADERS,
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: parentDsId },
      properties,
      children: blocks,
    }),
  });
  if (!r.ok) return { ok: false, error: `${r.status}: ${(await r.text()).slice(0,300)}` };
  const j = await r.json();
  return { ok: true, id: j.id };
}

// Notion property helpers
const P = {
  title: (s) => ({ title: [{ type: "text", text: { content: s } }] }),
  text: (s) => ({ rich_text: [{ type: "text", text: { content: s } }] }),
  select: (s) => ({ select: { name: s } }),
  multi: (arr) => ({ multi_select: arr.map((n) => ({ name: n })) }),
  checkbox: (b) => ({ checkbox: !!b }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Entry data — 14 planets (13 existing + Chiron)
// ─────────────────────────────────────────────────────────────────────────────

const PLANET_ENTRIES = [
  {
    name: "Sun",
    properties: {
      "Layer": P.select("Fundamental (Sun/Earth)"),
      "Family Archetype": P.text("Father"),
      "Edinburgh Keyword": P.text("Programming (70% of all conditioning)"),
      "Way of the Mind Keyword": P.text(""),
      "Cycle Math": P.text("5.7 days per gate; 365.25 days full wheel; no return in standard life cycle (annual cycle)"),
      "Has Return in Life": P.checkbox(false),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets", "Way of the Mind"]),
      "Delphi Basic Description": P.text("The Sun is the conscious carrier of the design's purpose, the window through which the chart's light shines into the world. With the Earth as its polarity, it delivers 70 percent of all programming."),
    },
    body: {
      title: "Sun — Birth-Imprint Reading",
      toggles: [
        ["Birth-Imprint Reading",
          "The Sun is the conscious purpose-carrier of the design. Its gate is the chart's primary keynote: 70 percent of all programming arrives through the Sun-Earth polarity (Ra: 'the Sun is a programming agent whereas the Earth grounds that programming into form'). The Personality Sun's line and tone determine the conscious purpose. The Design Sun, 88 days of solar arc prior, carries the same purpose stamped at the body's unconscious level — Ra calls this the inheritance from the father."],
        ["Personality side (conscious)",
          "The Personality Sun is the window through which the very light of who you are shines out on the world. Its gate is where the conscious self emerges. When the Personality Sun sits in an undefined center, Ra observes the light is 'locked up in a room with all the shutters closed' — the person cannot find consistent access to 70 percent of who they are without external definition. Flag this in any chart where the Personality Sun's center is undefined."],
        ["Design side (unconscious)",
          "The Design Sun stamps the same purpose at the unconscious, somatic level. Ra: 'Look at your own design sun, and you will see the theme that you have inherited from your father.' This is archetypal inheritance — the body carries the father's-line theme without conscious awareness, expressed through behavior the design enacts before the mind can intervene."],
        ["Relation to the Incarnation Cross",
          "The Sun is one of the four Cross gates (Personality Sun + Personality Earth + Design Sun + Design Earth). The Sun's reading in the Planetary Overview should not duplicate the Cross section; instead it focuses on the Sun as the conscious-purpose carrier specifically. Cross-reference the chart's Cross section for the full purpose-shape reading."],
        ["Conjunctions involving the Sun",
          "Sun conjunct another planet in the same gate amplifies that planet's signature with the chart's primary programming weight. Particularly load-bearing: Sun conjunct Mercury (the communicator-of-purpose), Sun conjunct a Node (the trajectory marker becomes the conscious-purpose marker — Ra: trans-cellular geometry meets the 70 percent programming carrier). See HD Planetary Conjunctions for the full rule set."],
      ],
    },
  },
  {
    name: "Earth",
    properties: {
      "Layer": P.select("Fundamental (Sun/Earth)"),
      "Family Archetype": P.text("Mother (the true mother in HD; corrects astrology's placement of yin on the Moon)"),
      "Edinburgh Keyword": P.text("Grounding (the true mother)"),
      "Way of the Mind Keyword": P.text(""),
      "Cycle Math": P.text("5.7 days per gate; mirrors the Sun's annual cycle, six months out of phase"),
      "Has Return in Life": P.checkbox(false),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets", "Way of the Mind"]),
      "Delphi Basic Description": P.text("The Earth grounds the Sun's programming into form. It is the chart's gravitational home and the archetype of the Mother. Without the Earth, the Sun's light has nowhere to land."),
    },
    body: {
      title: "Earth — Birth-Imprint Reading",
      toggles: [
        ["Birth-Imprint Reading",
          "The Earth grounds the Sun's 70 percent programming into the material plane. Ra: 'Within design, because we have the presence of the Earth, we have the presence of the true mother.' The Earth is always opposite the Sun in the wheel. Where the Sun broadcasts the purpose, the Earth makes that purpose physically inhabitable. The Earth-Saturn thematic pairing matters: both are 'deeply concerned about the material plane.'"],
        ["Personality side (conscious)",
          "The Personality Earth is the conscious grounding for the chart's purpose — where the Personality Sun's broadcast lands in the body's day-to-day experience. Conscious balance, the integrative path. The Earth in conscious form is where the chart's purpose touches down into actual behavior."],
        ["Design side (unconscious)",
          "The Design Earth is the unconscious grounding — what came down from the mother as somatic inheritance. Ra: the Mother's-line theme stamped at the body level, expressed through how the body comes to grips with form before the mind can name it."],
        ["Relation to the Incarnation Cross",
          "The Earth is the second of the four Cross gates. With Personality Sun + Personality Earth + Design Sun + Design Earth, the Earth completes the chart's grounding spine. The Earth's gate in the Cross signals where the chart's purpose finds its physical foothold."],
        ["Conjunctions involving the Earth",
          "Earth conjunct Saturn carries thematic compound — both work the material plane. Earth conjunct a Node ties the grounding axis to the trans-cellular trajectory. See HD Planetary Conjunctions."],
      ],
    },
  },
  {
    name: "Moon",
    properties: {
      "Layer": P.select("Inner (Operating System)"),
      "Family Archetype": P.text("Eldest Daughter (carries responsibility to both Mother/Earth and Father/Sun)"),
      "Edinburgh Keyword": P.text("Driver (the great force that pushes us)"),
      "Way of the Mind Keyword": P.text("Focus"),
      "Cycle Math": P.text("29.5 days full wheel; ~half day per gate; ~2 hours per line"),
      "Has Return in Life": P.checkbox(true),
      "Profile Applicability": P.select("Type-specific"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets", "Way of the Mind"]),
      "Delphi Basic Description": P.text("The Moon is the great driver — the force that pushes the design toward illumination, lunar month after lunar month. For Reflector charts, the Moon is the primary programming cycle, not the Sun/Earth."),
    },
    body: {
      title: "Moon — Birth-Imprint Reading",
      toggles: [
        ["Birth-Imprint Reading",
          "Ra: 'The Moon drives us all; it's the great driver. It's the great force that pushes us.' The Moon's gate in your design is where you are driven. Way of the Mind adds the dimension of 'focus' — the Moon both pushes and concentrates attention. The Earth-Moon relationship is foundational: without the Moon, no terrestrial life. The Moon creates the gravity field; our bodies (70% water) move with its pull."],
        ["Personality side (conscious)",
          "The Personality Moon is the conscious driver — where the design is pushed in waking life, where attention naturally goes. The lunar pull on the chart's day-to-day experience."],
        ["Design side (unconscious)",
          "The Design Moon stamps the somatic drive — what the body is pushed toward unconsciously. The mammalian rhythm that operates below mental awareness."],
        ["Reflector type-specific reading",
          "Reflectors are true lunar types. Ra: 'They are not solar, not as determined in that way by the programming of the Sun/Earth as they are by the Moon.' For a Reflector chart, the Moon takes precedence over Sun/Earth — the lunar cycle is the primary programming cycle. The Moon position determines the trajectory the Reflector follows month to month."],
        ["Conjunctions involving the Moon",
          "Moon's fast cycle means natal conjunctions point at specific moments where the driving force compounded with another planet's signature. Moon + Node conjunction is structurally significant. See HD Planetary Conjunctions."],
      ],
    },
  },
  {
    name: "Mercury",
    properties: {
      "Layer": P.select("Inner (Operating System)"),
      "Family Archetype": P.text("Eldest Son (Father's reflected light; closest to the Sun)"),
      "Edinburgh Keyword": P.text("Communication (the essence of what must be communicated)"),
      "Way of the Mind Keyword": P.text(""),
      "Cycle Math": P.text("Fast inner planet; ~88-day revolution around the Sun (matches the Design imprint window)"),
      "Has Return in Life": P.checkbox(true),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets", "Way of the Mind"]),
      "Delphi Basic Description": P.text("Mercury is the essence of what must be communicated — and uniquely, the engineer of the Design imprint itself. Mercury's 88-day revolution corresponds to the 88-day Design programming window."),
    },
    body: {
      title: "Mercury — Birth-Imprint Reading",
      toggles: [
        ["Birth-Imprint Reading",
          "Ra: 'The messenger of the gods. The great communicator. The essence of what we have to communicate. Each of us has something very special that we are here to communicate to the other.' Mercury's gate shows what the design must communicate. Mercury is the conscious-purpose carrier of message and meaning."],
        ["Mercury as engineer of the Design imprint (critical)",
          "From Understanding the Planets: 'Mercury has a revolution around the sun of 88 days, thus it has a direct correlation with the 88/89 day period during which the personality crystal is programmed. In this context, Mercury is God of the mental plane and as such is the creator of the Maya.' Mercury's role goes beyond communication: it is the planet that engineers the 88-day Design stamp itself. The Design crystal is programmed during one Mercury revolution. This makes Mercury structurally load-bearing for the entire design framework."],
        ["Personality side (conscious)",
          "The Personality Mercury is what the conscious mind has to articulate. Where the design's voice belongs in the world."],
        ["Design side (unconscious)",
          "The Design Mercury is what the body knows it must say even when the mind can't formulate it — surprising statements that arrive from below conscious awareness."],
        ["Conjunctions involving Mercury",
          "Mercury conjunct Neptune: communication veiled. Ra: 'You don't really get what has to be communicated. If you look for it you never find it. Out of the blue comes some kind of funny comment and I've no idea where it came from. Hidden behind the veil of Neptune.' Mercury conjunct Sun amplifies the chart's central conscious-communication weight."],
      ],
    },
  },
  {
    name: "Venus",
    properties: {
      "Layer": P.select("Social (Saturn/Jupiter)"),
      "Family Archetype": P.text("Youngest Daughter (worldly daughter; rebellion; mutation of set values)"),
      "Edinburgh Keyword": P.text("Values / Morality (the heart of conditioning before it becomes law)"),
      "Way of the Mind Keyword": P.text("Standard"),
      "Cycle Math": P.text("Fast inner planet by orbit, but Ra groups Venus conceptually with Jupiter as the moral pair"),
      "Has Return in Life": P.checkbox(true),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets", "Way of the Mind"]),
      "Delphi Basic Description": P.text("Venus establishes the values that Jupiter will turn into law. Where Mars is cool iron, Venus carries the fire of rebellion. She is the moral conditioning element — the heart of your prejudice as much as of your virtue."),
    },
    body: {
      title: "Venus — Birth-Imprint Reading",
      toggles: [
        ["Birth-Imprint Reading",
          "Ra: 'Venus establishes values. Long before a law can be written in stone, it had to grow out of cultural values. The commandments that were carved into stone were already cultural values that had been established. They had been established by Venus.' Venus is fixed in 46 of 64 gates (exalted or detriment) — one of the most prevalent line-fixing planets. Way of the Mind names her the Standard. Where Venus sits in your design is where your morality lives."],
        ["The Venus-Jupiter pair (Ra's framework)",
          "Venus and Jupiter cannot be separated. Venus establishes the moral value; Jupiter codifies it as law. Their conjunction (when in the same gate) is what the Babylonians called the embodiment of the true moral law. Saturn punishes where Venus's moral truth is dishonored. The PO Cross section should treat these three as a structural triad when their gates align."],
        ["Personality side (conscious)",
          "The Personality Venus is the conscious value-set the chart carries — your standards, the rhythms you find aesthetically right. Also: 'the heart of your prejudice. The core of your deception. Your deviousness. Your hypocrisy. Your cruelty.' Values shape behavior; behavior expresses bias."],
        ["Design side (unconscious)",
          "The Design Venus carries the unconscious value-set inherited at the body level. Often shapes attraction and aversion before the mind can name why."],
        ["Conjunctions involving Venus",
          "Venus + Jupiter same gate: moral law collapsed into a single point — values and codified law as one. Venus is one of the Diamond planets (with Mercury, Jupiter, Neptune) in Way of the Mind's framework — the survival-mechanism quartet, left behind post-Kiron."],
      ],
    },
  },
  {
    name: "Mars",
    properties: {
      "Layer": P.select("Inner (Operating System)"),
      "Family Archetype": P.text("Youngest Son (free of responsibility; immature; cool iron, not active force)"),
      "Edinburgh Keyword": P.text("Immaturity (powerful but immature; juicy energy)"),
      "Way of the Mind Keyword": P.text("Mutation (the center of mutation to awareness)"),
      "Cycle Math": P.text("Fast inner planet; present in 61 of 64 gates (exalted or detriment)"),
      "Has Return in Life": P.checkbox(true),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets", "Way of the Mind"]),
      "Delphi Basic Description": P.text("Mars is permanently immature in the design — and where the fountain of youth lives once you are correct. Passive until aroused, then uncontrollable. Way of the Mind names Mars the center of mutation."),
    },
    body: {
      title: "Mars — Birth-Imprint Reading",
      toggles: [
        ["Birth-Imprint Reading",
          "Ra: 'Mars for me will always be a 14-year-old boy. It's a very immature energy. But saying that it's immature isn't to say that it's not powerful.' Mars is present in 61 of 64 gates. The two Mars positions show where you are permanently immature — and where the fountain of youth refreshes you when you live correctly. Way of the Mind adds: Mars is the center of mutation to awareness; the engine of how the design's awareness itself changes across the life."],
        ["Personality side (conscious)",
          "The Personality Mars is conscious juvenile energy — where the design stays young, where impulse precedes thought. Once you are correct, this is generative. Not correct: violent overreaction, refusal to mature."],
        ["Design side (unconscious)",
          "The Design Mars is somatic immature drive — body-level impulses that act before the mind can intervene. From Understanding the Planets: 'Mars is passive until aroused. It is a misleading myth to see Mars as an active force. Once prodded, Martian energy quickly builds momentum at the expense of awareness.'"],
        ["Conjunctions involving Mars",
          "Mars + Pluto same gate: 'immaturity of Mars with the truth of Pluto' — half-truths, Martian truths instead of mature truth. Mars + Saturn: immaturity meets the punisher. Mars + Sun: the chart's primary programming carries the juvenile signature. See HD Planetary Conjunctions."],
      ],
    },
  },
  {
    name: "Jupiter",
    properties: {
      "Layer": P.select("Social (Saturn/Jupiter)"),
      "Family Archetype": P.text("(not in the family hierarchy; Ra: 'the king of kings, the lord')"),
      "Edinburgh Keyword": P.text("The Lawgiver (Moses carving the word into stone)"),
      "Way of the Mind Keyword": P.text("Rules"),
      "Cycle Math": P.text("11.86 years full cycle (~12 years); Jupiter returns at ~12, 24, 36, 48, 60, 72"),
      "Has Return in Life": P.checkbox(true),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets", "Way of the Mind"]),
      "Delphi Basic Description": P.text("Jupiter is the law you must obey to receive the law's reward. Where Jupiter sits in your design is the heart of your personal law. Honor it and Jupiter rewards; break it and you pay where Saturn sits."),
    },
    body: {
      title: "Jupiter — Birth-Imprint Reading",
      toggles: [
        ["Birth-Imprint Reading",
          "Ra: 'Jupiter in the simplest language is the great lawgiver. Jupiter is Moses carving the word into stone.' From Understanding the Planets: 'In Human Design, Jupiter represents our own personal laws. Wherever Jupiter is in your chart, this is the law that you must obey in your life.' Jupiter is binary — can bullshit you into hell or make you rich in spirit and material. Way of the Mind: Rules."],
        ["Personality side (conscious)",
          "The Personality Jupiter is the conscious law of the chart — the rule you must live by to feel correct. Honoring it brings Jupiter's beneficence; breaking it brings consequences (which land at Saturn's gate, not Jupiter's)."],
        ["Design side (unconscious)",
          "The Design Jupiter is the somatic law — the rule the body operates by without needing the mind to articulate it. The lawful order of the design's behavior."],
        ["The Venus-Jupiter pair, and Saturn's role",
          "Jupiter codifies what Venus values into law. Saturn punishes where Jupiter's law is broken. The triad must be read together: values, law, consequence."],
        ["Cycle and reading rule",
          "Jupiter's ~12-year cycle defines outer development. Each Jupiter return is a new law-era — 'the tablets get shattered every cycle and a new law is built upon their remains.' For chart-bearer readings, Jupiter return ages (~12, 24, 36, 48, 60) are real life-stage beats."],
      ],
    },
  },
  {
    name: "Saturn",
    properties: {
      "Layer": P.select("Social (Saturn/Jupiter)"),
      "Family Archetype": P.text("(not in the family hierarchy; Cronos)"),
      "Edinburgh Keyword": P.text("Punishment (where you pay for not-self ignorance)"),
      "Way of the Mind Keyword": P.text("Constraint"),
      "Cycle Math": P.text("28 days per line; ~29.5 years full cycle; Saturn return ~29-30; second Saturn return ~58"),
      "Has Return in Life": P.checkbox(true),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets", "Way of the Mind", "Lifecycles"]),
      "Delphi Basic Description": P.text("Saturn is the modern alarm system — the shadow that sounds first when you stray from your strategy. The two Saturn positions show where life will punish you for being not-self. Honor the moral law and Saturn leaves you alone."),
    },
    body: {
      title: "Saturn — Birth-Imprint Reading",
      toggles: [
        ["Birth-Imprint Reading",
          "Ra: 'If you're clean Saturn is so wonderful. It doesn't praise you. It doesn't pat you on the head. It leaves you alone. There is no greater reward than being left alone by Saturn.' The two Saturn positions show where life punishes you for being not-self. From Understanding the Planets (post-1781 update): 'Saturn, our shadow, always sounds the alarm first. This is the modern Saturn's most important role, to warn us when we stray from our essential mechanics.' Saturn punishes WHERE Saturn is, not where Jupiter is — the consequence lands at Saturn's gate."],
        ["Personality side (conscious)",
          "The Personality Saturn is the conscious experience of constraint — where the design feels the alarm fire when it strays. Recognize the signal and adjust strategy; ignore it and the punishment compounds."],
        ["Design side (unconscious)",
          "The Design Saturn is the somatic alarm — where the body knows you have gone off-track before the mind names it."],
        ["The modern Saturn (post-1781)",
          "Ra: 'Three Saturn cycles of 28 years each are roughly in line with the new Uranian cycle. Saturn will continue to program limitation, but no longer the limitation that marks the outer life and our actual lifespan. Saturn is now beginning to impact far more on our inner cycles of development.' The Saturn that historically determined the lifespan now serves the inner-development cycle within the larger 84-year Uranian frame."],
        ["Saturn Return reading rule",
          "Saturn Return reading should be given mid-30s, not at 28-29. Ra: 'It's much more important... once somebody has actually gotten into it. The advantage of doing the Saturn Return three or four years after the actual date is that they can begin to sense the dynamics.' Saturn Return is the necessary optimism to realign the life — light, not darkness. See HD Lifecycle Phases."],
        ["Conjunctions involving Saturn",
          "Saturn + Earth thematic pairing (both material-plane). Saturn + Mars + Pluto stack (compound: punishment + immaturity + truth all converging). Saturn in the Diagonal axis (with Mars, Pluto, Uranus) per Way of the Mind."],
      ],
    },
  },
  {
    name: "Uranus",
    properties: {
      "Layer": P.select("Outer (Generational)"),
      "Family Archetype": P.text("(not in the family hierarchy; original sky God; father of Cronos, grandfather of Zeus)"),
      "Edinburgh Keyword": P.text("Light from darkness / Unusualness (Prometheus)"),
      "Way of the Mind Keyword": P.text("Side Track (the unique track for this design)"),
      "Cycle Math": P.text("479 days per gate average; ~84 years full wheel; Uranus opposition at ~38-44 splits the life"),
      "Has Return in Life": P.checkbox(true),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets", "Way of the Mind", "Lifecycles"]),
      "Delphi Basic Description": P.text("Uranus is where light emerges from darkness in the design — the totally different track from the homogenized world. The 84-year Uranian cycle is the architecture of the nine-centred being; Uranus opposition at ~42 is the structural midpoint."),
    },
    body: {
      title: "Uranus — Birth-Imprint Reading",
      toggles: [
        ["Birth-Imprint Reading",
          "Ra: 'Uranus for me is like Prometheus, it brings you that chance to see the light. That is its unusualness. It opens up this potential for light.' Way of the Mind refines: Uranus is the Side Track — the unique track this design walks, diverging from the homogenized educational/social path. Every obstacle the chart meets at the Uranus gate is its opportunity for light, IF the design is living correctly."],
        ["Personality side (conscious)",
          "The Personality Uranus is the conscious unusualness — where the chart's path visibly diverges from the standard. Where conscious differentiation lives."],
        ["Design side (unconscious)",
          "The Design Uranus is the somatic unusualness — the body's diverging track, often expressed as discomfort with conventional structure before the mind can name why."],
        ["The Uranian Cycle architecture (universal)",
          "From Understanding the Planets: 'Since the moment of Uranus' discovery in 1781 the quality of life on this planet for our species has improved at an astonishing rate. The Uranian cycle of 84 years has become a universally attainable human longevity standard.' This 84-year cycle is the architecture of the new nine-centred being. The Rave half-life is between 38 and 44 — Uranus opposition. See HD Lifecycle Phases."],
        ["Uranus Opposition (~38-44) — the midpoint",
          "From Understanding the Planets: 'The midpoint of our life cycle, the Uranus Opposition, falls between the ages of 38 and 44. This is the fulcrum of the 2 geometries of our life.' It is only after the Uranus Opposition that the design can begin to make its full contribution. Prana shifts from in to out. The Nodes effectively switch primary governance — South Node theme yields, North Node theme takes over."],
        ["Conjunctions involving Uranus",
          "Uranus in the Diagonal axis (with Saturn, Mars, Pluto) per Way of the Mind — the awareness/mutation quartet. Uranus sets the South Node / North Node split through the 84-year cycle."],
      ],
    },
  },
  {
    name: "Neptune",
    properties: {
      "Layer": P.select("Outer (Generational)"),
      "Family Archetype": P.text("Grandmother (Design Neptune = direct inheritance from grandmothers)"),
      "Edinburgh Keyword": P.text("The Veil (the seven veils; mystery)"),
      "Way of the Mind Keyword": P.text("Mis-information (the protective veil — what you're not supposed to look at)"),
      "Cycle Math": P.text("940 days per gate; ~164 years full wheel — no return in a human life"),
      "Has Return in Life": P.checkbox(false),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets", "Way of the Mind"]),
      "Delphi Basic Description": P.text("Neptune veils what it touches — and what is conjunct it. Where Neptune sits in your design is where mystery lives, where you are meant to experience wonder rather than solve the problem. Design Neptune carries grandmother-line inheritance."),
    },
    body: {
      title: "Neptune — Birth-Imprint Reading",
      toggles: [
        ["Birth-Imprint Reading",
          "Ra: 'Neptune veils. I like this word. The seven veils. The mystery of Neptune is not here to be solved. It's here to be experienced with wonder. Neptune is the only truly magical force you meet all the time.' Way of the Mind reframes Neptune's veil as Mis-information — protective; what you are NOT supposed to look at. If you don't look, you experience what you need to experience. Where Neptune is in your design is where your magic lives — Ra: 'we are not Hobbits. Be yourself. And the mysteries are revealed.'"],
        ["Personality side (conscious)",
          "The Personality Neptune is conscious mystery — where the mind cannot get a fix, where wonder belongs. Trying to solve it leads to confusion and delusion."],
        ["Design side (unconscious, grandmother-line)",
          "From Understanding the Planets: 'The Design Neptune is a direct inheritance from the grandmothers.' Yin quality. Genetically we have more in common with grandparents than with parents — the design carries the grandmothers' inherited mystery at the body level. (Frame as archetypal inheritance, not literal genetic claim.)"],
        ["Conjunctions involving Neptune (critical)",
          "Neptune veils any planet in the same gate. If Mercury sits with Neptune, communication is veiled — comments arrive without origin. If a Node sits with Neptune, the trans-cellular stellar window is veiled — though the new conjunction rule applies (planet conjunct Node eliminates stellar programming, with Neptune the veiling now compounds). Neptune is in the Diamond axis (with Mercury, Venus, Jupiter) per Way of the Mind. See HD Planetary Conjunctions."],
        ["Generational note",
          "Neptune's 164-year cycle exceeds a human life. Any line of Neptune that has not been transited within a living person's range carries no functional aspect — Ra is explicit. Same caveat as Pluto: some Neptune positions in lookup tables describe positions no living human carries."],
      ],
    },
  },
  {
    name: "Pluto",
    properties: {
      "Layer": P.select("Outer (Generational)"),
      "Family Archetype": P.text("Crone / Dark Grandmother (Lilith, Kali; 'Grandma Pluto' who tells you the truth)"),
      "Edinburgh Keyword": P.text("Truth (the subjective truth of self)"),
      "Way of the Mind Keyword": P.text(""),
      "Cycle Math": P.text("1415 days per gate; ~248 years full wheel — no return in a human life"),
      "Has Return in Life": P.checkbox(false),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets", "Way of the Mind"]),
      "Delphi Basic Description": P.text("Pluto tells you the truth. Where Pluto sits in your design is the subjective truth of who you are — and the dark place within yourself you must eventually meet. Trans-generational; you carry it on behalf of a generation."),
    },
    body: {
      title: "Pluto — Birth-Imprint Reading",
      toggles: [
        ["Birth-Imprint Reading",
          "Ra: 'Pluto is about truth. And when I say truth, I'm talking about the subjective truth of what you are as yourself. When you look at the Pluto's in your chart, what it's saying to you is that that is where the truth is for you in this life.' From Understanding the Planets: 'Pluto requires that we each go down into our own dark side in order to find our own Truth. Wherever you see Pluto in your design, that is a dark place within yourself that you must eventually meet.' Pluto is trans-generational — you carry it on behalf of your generation."],
        ["Personality side (conscious)",
          "The Personality Pluto is the conscious truth-question of the design — the truth you can name when you have done the descent."],
        ["Design side (unconscious, crone-line)",
          "Understanding the Planets: 'Pluto is closer to a Grandmother, and at the mythological level can be associated with the dark faces of the Goddess such as Lilith, Kali or the archetype of the crone.' The 'Grandma Pluto' analogy: ask grandma the question your parents avoided, and she scares the hell out of you because she tells you the truth. Design Pluto carries the ancestral dark truth at the body level. (Frame as archetypal, not literal.)"],
        ["Generational caveat (critical)",
          "Pluto's 248-year cycle exceeds any human life. Ra (Channel of Initiation example): 'Pluto hasn't been in Aries for hundreds of years. There is no-one alive that carries the imprint of Pluto in either the 51st or the 25th gate.' Any chart's Pluto can only be in positions Pluto has actually occupied within ~248 years. The retrieval layer should flag invalid Pluto line aspects."],
        ["Conjunctions involving Pluto",
          "Pluto + Mars same gate: immature truth (Edinburgh). Pluto in the Diagonal axis (with Saturn, Mars, Uranus) per Way of the Mind — the awareness/mutation quartet. See HD Planetary Conjunctions."],
      ],
    },
  },
  {
    name: "North Node",
    properties: {
      "Layer": P.select("Trans-cellular (Nodes)"),
      "Family Archetype": P.text("(Nodes are not bodies; trans-cellular portals to extra-solar starfield)"),
      "Edinburgh Keyword": P.text("Trans-cellular portal / the road growing into (second half of life)"),
      "Way of the Mind Keyword": P.text(""),
      "Cycle Math": P.text("18.5-year full Nodal cycle; 106 days per gate; ~3.5 months per 'season'"),
      "Has Return in Life": P.checkbox(true),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets"]),
      "Delphi Basic Description": P.text("The North Node is the trajectory of the second half of life — what the design grows into after Uranus opposition. Not a planet but a trans-cellular portal carrying starfield information from beyond the solar cell."),
    },
    body: {
      title: "North Node — Birth-Imprint Reading",
      toggles: [
        ["Birth-Imprint Reading",
          "Ra: 'The Nodes of the Moon represent the track that you go down in this life. They represent the road that you're going to take.' The North Node is the trajectory of the second half of life — what the design grows into. From Understanding the Planets: 'The North Node theme is particularly relevant between the Uranus Opposition and the Kiron Return at 50 or 51.' Trans-cellular: 'a portal that links you to the whole, that links you to the totality.'"],
        ["Personality side (conscious)",
          "The Personality North Node is the conscious second-half trajectory — where the design's purpose grows into after midlife."],
        ["Design side (unconscious)",
          "The Design North Node is the somatic second-half trajectory — the body-level direction the design moves into after Uranus opposition."],
        ["The Nodes are NOT planets — critical distinction",
          "Ra: 'They are not translating instruments, or better, they are not interfering instruments. They are portals; they're like windows. And those windows are focused on a specific star field bringing in neutrino information.' The Nodes give access to extra-solar information. Conjunction rule (Understanding the Planets): 'Whenever a planet is conjunct a Node, it effectively eliminates the stellar programming.' If a planet sits at the Node's gate, the planet's signature replaces the Node's trans-cellular window."],
        ["Conjunctions involving the North Node",
          "Planet + North Node: the planet's signature dominates over the trans-cellular window. Sun + North Node is especially load-bearing — the chart's primary programming carrier IS the trajectory marker."],
      ],
    },
  },
  {
    name: "South Node",
    properties: {
      "Layer": P.select("Trans-cellular (Nodes)"),
      "Family Archetype": P.text("(Nodes are not bodies; trans-cellular portals)"),
      "Edinburgh Keyword": P.text("Trans-cellular portal / the road came in on (first half of life)"),
      "Way of the Mind Keyword": P.text(""),
      "Cycle Math": P.text("Same as North Node (18.5-year cycle; always opposite); split point = Uranus opposition ~38-44"),
      "Has Return in Life": P.checkbox(true),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets"]),
      "Delphi Basic Description": P.text("The South Node is the trajectory of the first half of life — the road the design came in on. Familiar territory; the chart's pre-Uranus-opposition orientation. Trans-cellular portal."),
    },
    body: {
      title: "South Node — Birth-Imprint Reading",
      toggles: [
        ["Birth-Imprint Reading",
          "The South Node is the trajectory of the first half of life — the road the design came in on. Ra: 'We know that the South Node is the first half of the life and the North Node is the second half of the life. This is the result of the Uranian cycle of our nine-centred being.' Familiar territory; what the design walks into the body carrying."],
        ["Personality side (conscious)",
          "The Personality South Node is the conscious first-half trajectory — where the design's purpose has its initial orientation, the road traveled before midlife maturity."],
        ["Design side (unconscious)",
          "The Design South Node is the somatic first-half trajectory — the body-level direction the design moves through before the Uranus opposition reorganization."],
        ["The split at Uranus Opposition",
          "Ra is explicit the Nodes aren't strictly a 15-year-then-15-year switch: 'I really want to get you away from that kind of linear process. It is an opposition in the sky. What goes in one goes out the other. These are magical polarities.' The South Node theme is present the whole life; it dominates the first half. Same for North in the second half."],
        ["Conjunctions involving the South Node",
          "Planet + South Node: the planet's signature replaces the trans-cellular window (per Understanding the Planets). Sun + South Node: chart's primary programming carrier IS the first-half trajectory marker."],
      ],
    },
  },
];

const CHIRON_ENTRY = {
  name: "Chiron",
  properties: {
    "Theme": P.text("True Maturity — the last marker on the road"),
    "DBHD Description": P.text("Chiron sits at the gateway between the Roof Phase and the Kiron Phase. The Personality and Design Chirons together describe the theme of true maturity — what the design is here to become once the protective Roof phase ends. Mythologically the wounded healer; in HD framed functionally as the last major beat before the Uranus Return."),
    "Layer": P.select("Outer (Generational)"),
    "Family Archetype": P.text("(not in Ra's family hierarchy)"),
    "Edinburgh Keyword": P.text("(not in Edinburgh; introduced in other Ra material)"),
    "Way of the Mind Keyword": P.text("The Last Marker on the Road"),
    "Cycle Math": P.text("~50-51 years for the return; discovered 1977"),
    "Has Return in Life": P.checkbox(true),
    "Profile Applicability": P.select("Universal"),
    "Source Citations": P.multi(["Lifecycles"]),
    "Delphi Basic Description": P.text("Chiron is the last marker on the road before the Uranus Return at ~84. The Personality and Design Chiron positions name the theme of true maturity — what the design is here to become once the Roof phase ends."),
  },
  body: {
    title: "Chiron — Birth-Imprint Reading",
    toggles: [
      ["Birth-Imprint Reading",
        "Ra (from Life-Cycles Analysis): 'The Kiron is the last marker on the road.' The Personality and Design Chirons together describe the theme of true maturity — the gateway between the Roof Phase (Saturn Return → Kiron Return) and the Kiron Phase (Kiron Return → Uranus Return ~84). Where Chiron sits in your design is what the design is here to BECOME once the protective Roof phase ends."],
      ["Personality side (conscious)",
        "The Personality Chiron is the conscious theme of true maturity — what the chart consciously inhabits post-Kiron."],
      ["Design side (unconscious)",
        "The Design Chiron is the somatic theme of true maturity — what the body becomes capable of once the Roof's protection is gone."],
      ["Timing rule for Kiron Return reading",
        "Kiron Return reading is valid 3.5 years before through 3.5 years after the actual return date — a 7-year window. Ra: 'We're basically dealing with a process of 3½ years into it and 3½ across it.' See HD Lifecycle Phases for the full phase architecture."],
      ["Vulnerability framing post-Kiron",
        "Ra: 'There are risks to not being correct when you come off the roof. There are dangers to your well-being, both psychic and physical. Mutative beings being mutative are much more vulnerable than others.' Chiron's position can be read as both the flowering theme AND the place vulnerability emerges if the design isn't living correctly."],
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const mode = process.argv.includes("--commit") ? "commit" : "dry";

console.log(`Mode: ${mode}`);
console.log(`Loading existing HD Planets…`);
const existing = await listPlanets();
console.log(`  ${existing.size} planet entries found`);
console.log();

if (mode === "dry") {
  for (const entry of PLANET_ENTRIES) {
    const id = existing.get(entry.name);
    const action = id ? "UPDATE properties + APPEND callout" : "CREATE";
    console.log(`  ${entry.name.padEnd(15)} → ${action} (${entry.body.toggles.length} toggles)`);
  }
  console.log(`  Chiron          → ${existing.get("Chiron") ? "UPDATE" : "CREATE"} (${CHIRON_ENTRY.body.toggles.length} toggles)`);
  console.log("\nDRY mode. No writes. Re-run with --commit.");
  process.exit(0);
}

let ok = 0, err = 0;
for (const entry of PLANET_ENTRIES) {
  const id = existing.get(entry.name);
  if (!id) { console.log(`  ⚠ ${entry.name}: not found in HD Planets, skipping`); err++; continue; }
  process.stdout.write(`  ${entry.name.padEnd(15)}  `);
  const pr = await updatePageProperties(id, entry.properties);
  if (!pr.ok) { console.log(`✗ properties: ${pr.error}`); err++; await throttle(); continue; }
  await throttle();
  const co = callout(entry.body.title, entry.body.toggles.map(([s, p]) => toggle(s, p)));
  const ar = await appendBlocks(id, [co]);
  if (!ar.ok) { console.log(`✗ callout append: ${ar.error}`); err++; await throttle(); continue; }
  ok++;
  console.log(`✓`);
  await throttle();
}

// Chiron — create
if (!existing.get("Chiron")) {
  process.stdout.write(`  Chiron          create… `);
  const props = { "Name": P.title("Chiron"), ...CHIRON_ENTRY.properties };
  const co = callout(CHIRON_ENTRY.body.title, CHIRON_ENTRY.body.toggles.map(([s, p]) => toggle(s, p)));
  const cr = await createPage(PLANETS_DS_ID, props, [co]);
  if (cr.ok) { ok++; console.log(`✓ (${cr.id})`); }
  else { err++; console.log(`✗ ${cr.error}`); }
}

console.log(`\nDone. OK: ${ok}. Errors: ${err}.`);
