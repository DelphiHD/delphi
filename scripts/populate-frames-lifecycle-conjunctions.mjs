// Populate the 3 new planetary-content databases:
//   - HD Planetary Frames (7 entries)
//   - HD Lifecycle Phases (7 entries)
//   - HD Planetary Conjunctions (8 entries)
//
// Each entry: properties + callout-with-toggle body.

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

const FRAMES_DS = "5e4bd953-f87c-4b51-b5c5-884cab40963a";
const LIFECYCLE_DS = "e7ce62e9-82c9-4670-b2e3-207c5cb66170";
const CONJUNCTIONS_DS = "c445bc8c-fe27-4838-a5df-7f781e3425aa";

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function throttle() { return sleep(400); }

function richText(text, max = 1900) {
  if (!text) return [{ type: "text", text: { content: " " } }];
  const out = [];
  let r = text;
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

const P = {
  title: (s) => ({ title: [{ type: "text", text: { content: s } }] }),
  text: (s) => ({ rich_text: [{ type: "text", text: { content: s } }] }),
  select: (s) => ({ select: { name: s } }),
  multi: (arr) => ({ multi_select: arr.map((n) => ({ name: n })) }),
};

// ─────────────────────────────────────────────────────────────────────────────
// HD Planetary Frames — 7 entries
// ─────────────────────────────────────────────────────────────────────────────

const FRAMES = [
  {
    name: "The Programming Frame",
    props: {
      "Frame Type": P.select("Conceptual"),
      "Used in PO Section": P.multi(["Opening"]),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets"]),
      "Delphi Basic Description": P.text("The conceptual gate the advanced reader walks through before the per-planet sections. Establishes that planetary 'influence' is mechanical neutrino programming, not symbolic divinity."),
    },
    emoji: "🌌",
    title: "The Programming Frame",
    toggles: [
      ["What it is",
        "Programming is delivered by neutrinos — extremely fine matter produced by stars and capable of passing through bodies and through the Earth itself. We receive ~70% of our neutrinos from the Sun; the rest comes from the deeper star field, filtered (interfered with) by intervening planets. Each planet is a filtering crystal with a specific signature; that signature is what we call 'Jupiter,' 'Saturn,' 'Venus.' The bodygraph is the static blueprint. The planetary configuration at the two imprint moments (birth, and 88 days of solar arc prior) gives that blueprint a specific orientation."],
      ["How to apply in the PO Opening",
        "Use this frame to establish — in 1-2 short paragraphs at the top of the report — that the report is reading mechanical conditioning, not making predictions or mystical claims. Conditioning operates through the unactivated gates: places where planetary activation creates definition the chart doesn't carry consistently. Strategy is the only protection against being run by the programming."],
      ["Key Ra phrases worth carrying",
        "'It's all part of the machinery. It's all part of the way in which the Maya operates.' / 'We are reactive. And it's fast. Fast enough that we can claim it's ours. But it's not.' / 'The planets are our local programming agents.'"],
    ],
  },
  {
    name: "The Depersonalisation Practice",
    props: {
      "Frame Type": P.select("Method"),
      "Used in PO Section": P.multi(["Opening"]),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh"]),
      "Delphi Basic Description": P.text("How the report is meant to be READ. Reading the planetary stamp is not 'identifying with it' — it is recognising the orientation of the vehicle you are riding in."),
    },
    emoji: "🛻",
    title: "The Depersonalisation Practice",
    toggles: [
      ["What it is",
        "Ra: 'Depersonalise — in the sense that you become much more an observer of events.' The reader is the passenger, not the driver. The point of seeing the mechanic is to let go, not to gain control. 'Knowledge is information. It's not power.' The whole report should be received in this stance."],
      ["How to apply in the PO 'How to Use This Report' section",
        "Frame the experience: this is a per-thread reference, returned to when an activation shows up in life. Not a single read; not an identity. Recognise weather passing through your specific openings rather than identifying with each activation as 'me.' The frame guards against the typical not-self pattern of reading planetary content as personality traits."],
    ],
  },
  {
    name: "The Three Lenses",
    props: {
      "Frame Type": P.select("Method"),
      "Used in PO Section": P.multi(["Opening", "Per-planet H3s"]),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh"]),
      "Delphi Basic Description": P.text("Ra's three lenses for reading any planetary activation: personal impact, world impact, and generational impact (children born under the same stamp)."),
    },
    emoji: "🔭",
    title: "The Three Lenses",
    toggles: [
      ["What it is",
        "Ra's working method for any planetary activation: 1) How does it impact me personally? — the chart's specific stamp; 2) What does it mean generally? — the world layer; 3) Who are the beings born under this stamp? — the generational layer. For the PO, the personal lens is primary throughout; the generational lens carries weight only for the outer planets (Pluto, Neptune, Uranus), where a planet's slow movement means a whole generation shares the same gate stamp."],
      ["How to apply per-planet",
        "Inner planets (Mercury, Venus, Mars, Moon): personal lens dominates; generational lens is irrelevant (cycles too short to define a generation). Social planets (Jupiter, Saturn): personal lens with some life-stage timeline context. Outer planets (Uranus, Neptune, Pluto): personal lens grounded in the generational lens — your Pluto truth-question is shared with millions; what makes it yours is how it threads with your chart's other activations."],
    ],
  },
  {
    name: "The Trigger Map and Hanging Gates Mechanic",
    props: {
      "Frame Type": P.select("Hanging Gates Mechanic"),
      "Used in PO Section": P.multi(["Hanging Gates"]),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh"]),
      "Delphi Basic Description": P.text("Per Kaycee's design choice (Option 2): describe the energy of the activated hanging gate in the chart FIRST, then explain the dynamic of the missing partner gate that would complete the channel. HD Gates' 'if hanging' content is the foundation."),
    },
    emoji: "🎯",
    title: "Hanging Gates — the activated energy plus the missing partner",
    toggles: [
      ["What it is",
        "A hanging gate is an activated gate that does not connect through to a complete channel within the chart's own definition. Ra calls these 'gates that are sticking out in no-man's land. Looking for something on the other side.' The hanging gate is a primary conditioning surface — where the chart most strongly meets and is shaped by other people who carry the partner gate."],
      ["How to apply per Kaycee's design (CRITICAL)",
        "FIRST: describe what the activated hanging gate's energy IS in the chart — what the design carries from that gate's signature. SECOND: name the partner gate that would complete the channel, and the dynamic the chart experiences when that partner is supplied by another person or by planetary transit. The HD Gates database carries 'if hanging' content for each gate — that is the foundation for the activated-gate-energy description; expand from there."],
      ["What NOT to do",
        "Do NOT lead with 'this hanging gate is conditioned through openness' or similar deficit-framing. The activated energy comes first; the partner-dynamic is the second layer. Ra's framing is positive: the gate carries real signature; the conditioning aspect is contextual."],
    ],
  },
  {
    name: "The Uranian Cycle and Nine-Centred Being Architecture",
    props: {
      "Frame Type": P.select("Conceptual"),
      "Used in PO Section": P.multi(["Timeline (Saturn-Jupiter)"]),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Understanding the Planets", "Lifecycles"]),
      "Delphi Basic Description": P.text("The 84-year Uranian cycle is the architecture of the nine-centred being (post-1781 framework). Uranus opposition at ~42 splits the life into Node-governed halves. Saturn cycles fit 3-into-1 with the Uranian cycle."),
    },
    emoji: "⚙️",
    title: "The Uranian Cycle — life-architecture for the nine-centred being",
    toggles: [
      ["What it is",
        "Since Uranus's discovery in 1781, humanity has lived under a new 84-year life cycle. The 'Rave half-life' (Uranus opposition) is between 38 and 44 — the structural midpoint of the life. From Understanding the Planets: 'In the mysticism of matrixes, the ancient seven chakra format evolving for millennia transformed into a nine-centred Rave with Uranus' discovery.' Three Saturn cycles of 28 years each roughly fit one 84-year Uranian cycle. The Nodes split (South = first half, North = second half) is set by this Uranian architecture, not by node math alone."],
      ["How to apply in the Timeline section",
        "Frame the timeline as Uranian-cycle architecture, not as a list of returns. Saturn Return (~29), Uranus Opposition (~38-44), Kiron Return (~50-51), Second Saturn Return (~58), Uranus Return (~84) are beats within the cycle. The cycle itself is what gives them meaning — without it, they're isolated events."],
      ["Cultural note worth keeping",
        "Ra notes humanity has not yet fully adapted to the Uranian cycle — most of us are still raised culturally on the old Saturnian cycle (mature by 30, retire by 60). The boomer generation's slow maturation is the vanguard of the new cycle, not an anomaly."],
    ],
  },
  {
    name: "The No Choice Mechanic",
    props: {
      "Frame Type": P.select("Conceptual"),
      "Used in PO Section": P.multi(["Closing"]),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh"]),
      "Delphi Basic Description": P.text("The through-line of all of Ra's planetary material: recognising no-choice is recognising you are a passenger. Knowledge for surrender, not knowledge for power."),
    },
    emoji: "🌀",
    title: "The No Choice Mechanic",
    toggles: [
      ["What it is",
        "Ra: 'There is no choice. It is what it is.' The repeated through-line. Recognising no-choice is recognising you are a passenger in a vehicle, not the driver. The goal of seeing the planetary mechanism is not to gain control — it is to release the illusion of control. 'Live the experiment. The truth will be self-evident.'"],
      ["How to apply in the PO Closing",
        "The Closing should not synthesize the report into a 'now go do X' instruction. That contradicts the entire frame. Closing should return the reader to themselves as the chart they are, with the chart's mechanics named, and a final invitation: live strategy. Nothing more is required. No goals; no future-orientation; no self-improvement framing."],
    ],
  },
  {
    name: "Birth-Imprint vs Transit Translation Key",
    props: {
      "Frame Type": P.select("Birth-Imprint Translation"),
      "Used in PO Section": P.multi(["Opening"]),
      "Profile Applicability": P.select("Universal"),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets"]),
      "Delphi Basic Description": P.text("Internal agent instruction. Most of Ra's planetary material was delivered in transit-analysis context. The PO is birth-imprint analysis. This frame defines how to translate transit material into birth-imprint readings without drift."),
    },
    emoji: "🧭",
    title: "Birth-Imprint vs Transit — the translation key",
    toggles: [
      ["What it is",
        "Ra's source material on planetary conditioning is almost entirely transit-analysis material: 'When Pluto comes to the 26th gate for 3 years…' For the PO report, the same per-planet meanings apply, but the framing must shift from 'when planet X transits gate Y' to 'your planet X is permanently stamped at gate Y from the moment of imprinting.' The Edinburgh keywords (Truth, Veil, etc.) transport directly. The watch-the-Ephemeris methodology does NOT transport."],
      ["How to apply (agent-only instruction)",
        "This frame is not retrieved as content for the report body. It is loaded into the prompt as an agent-level translation rule: whenever generating prose about a planet, suppress transit-language and use stamp-language. Examples of forbidden phrases in the report: 'when X transits,' 'for the next three years,' 'currently,' 'right now.' Examples of correct phrases: 'your X sits at,' 'your design carries,' 'the stamp at the moment of imprinting.'"],
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HD Lifecycle Phases — 7 entries
// ─────────────────────────────────────────────────────────────────────────────

const LIFECYCLE = [
  {
    name: "Childhood (the Uranian Cycle phase 1)",
    props: {
      "Phase or Transition": P.select("Phase"),
      "Approximate Age": P.text("Birth to ~28-29"),
      "Profile Applicability": P.select("Universal with 6-line amplification"),
      "Reading-Timing Rule": P.text("Not given as a standalone reading; the phase is recognised from outside it"),
      "Source Citations": P.multi(["Lifecycles", "Way of the Mind"]),
      "Delphi Basic Description": P.text("The full child-process under the new Uranian cycle. Until Saturn Return, the design is still in childhood — the opportunity, without pressure, to grasp the world. Modern culture forces premature adulthood at 15; this phase rejects that."),
    },
    emoji: "🌱",
    title: "Childhood — the Uranian Cycle's first phase",
    toggles: [
      ["What happens (Universal)",
        "Ra (Lifecycles): 'The child process has been extended to the full Saturn cycle.' Under the post-1781 Uranian framework, childhood now runs to Saturn Return. The first 28-29 years are 'the most difficult.' This is the trial-and-error phase under Saturn's old-style governance. The design is meeting the world for the first time at the cellular level."],
      ["The cultural-vs-actual mismatch",
        "Our culture still operates on the old Saturnian-cycle assumption that adulthood begins at adolescence. Ra: 'We're trapping them in the old Saturnian cycle. We're in a different realm.' The 15-year-old expected to know who they'll become, the 25-year-old who feels behind — both are operating against an outdated structural map."],
      ["6-line amplification",
        "For charts with a 6th line in their Personality OR Design Sun, this phase is explicitly the '3rd line phase' — trial and error felt as pessimism. For non-6-line charts, the cellular-childhood is still present; the explicit 3rd-line-pessimism framing belongs only to 6-line charts."],
    ],
  },
  {
    name: "Saturn Return (~29)",
    props: {
      "Phase or Transition": P.select("Transition"),
      "Approximate Age": P.text("~28-29; metamorphic process actually spans 26 to ~33"),
      "Profile Applicability": P.select("Universal"),
      "Reading-Timing Rule": P.text("Give the reading mid-30s, NOT at the actual return. Ra: 'It's much more important once somebody has actually gotten into it.' 3-5 years after the return is the sweet spot."),
      "Source Citations": P.multi(["Lifecycles"]),
      "Delphi Basic Description": P.text("The structural mandate becomes legible. 'The necessary optimism to realign the life.' Saturn Return is a light-reading, not a darkness-reading."),
    },
    emoji: "🔆",
    title: "Saturn Return — the universal first major transition",
    toggles: [
      ["What it is (Universal)",
        "Saturn Return is when Saturn returns to the gate it occupied at birth, ~28-29 years later. Universally applicable. Ra (Lifecycles): 'When I look at somebody's Saturn Return, what I see in the cycle is through not so much rose-colored glasses, but I see it as the necessary optimism to realign the life. I do not do darkness, I do light.' The structural mandate the design has been working under becomes legible at this point — what Saturn has been hammering becomes nameable."],
      ["Reading-timing rule (critical)",
        "Ra: 'I don't think that a Saturn Return should be given until you have somebody who is at least into or close to the middle of their 30s. It's not like you're going to help them by telling them about it before. They're still dealing with the closing of the Saturnian cycle; you're not ready to really understand what kind of transition can take place.' The metamorphic process spans 26 to ~33; the actual return is the core of a spiral, not the moment of insight."],
      ["6-line specific note",
        "For 6th-line beings, Saturn Return is also the explicit gateway 'going on the roof' — see The Roof Phase entry. The 'roof' language is 6-line specific. The structural-mandate reckoning is universal. Do not let roof-language leak into non-6-line reports — Saturn Return for a non-6-line chart is the universal optimism-realignment described above, not a 'going on the roof' moment."],
    ],
  },
  {
    name: "The Roof Phase — Living Your Own Life",
    props: {
      "Phase or Transition": P.select("Phase"),
      "Approximate Age": P.text("Saturn Return (~29) → Kiron Return (~50-51)"),
      "Profile Applicability": P.select("6-line specific"),
      "Reading-Timing Rule": P.text("6-line beings only — explicit 'roof' framing must not appear in non-6-line reports"),
      "Source Citations": P.multi(["Lifecycles"]),
      "Delphi Basic Description": P.text("6-LINE SPECIFIC PHASE. The aloof, observational phase between Saturn Return and Kiron Return. Most dynamic and most successful phase for 6th-line beings. Do NOT use roof-language in non-6-line reports."),
    },
    emoji: "🏠",
    title: "The Roof Phase — 6-LINE SPECIFIC",
    toggles: [
      ["What it is (6-LINE ONLY)",
        "Ra (Lifecycles): 'This going up on the roof, all of this is about the opportunity to begin to experiment with living your own life. This is where the optimism has to come from. It says that until you get to the roof stage, you don't have your own life.' The Roof Phase is the aloof, observational stage between Saturn Return and Kiron Return. For 6th-line beings, this is 'the most dynamic phase of a 6th line being's life… the core of where they build their success in life.' Recommended: 'Do well when you're on the roof and save and invest because it's not going to be the same when you come off the roof.'"],
      ["CRITICAL — Profile Applicability",
        "This phase and its language are 6-line specific. Do NOT reference 'the roof phase,' 'going on the roof,' 'aloof stage,' or related terminology in reports for charts that do not contain a 6th line. The universal aspects of this age range (~29-50) belong to the Uranus Opposition entry and to the Saturn Return universal reading — NOT to this entry. Per Kaycee: 'this critical 6-line information doesn't leak over into other profiles. This is something that keeps happening in the foundation reports.'"],
      ["For non-6-line charts in the same age range",
        "Use the Uranus Opposition entry (~38-44) as the key beat in this stretch. The structural-mandate reckoning of Saturn Return continues to deepen. The chart's purpose continues to find legibility. None of this requires roof-language."],
    ],
  },
  {
    name: "Uranus Opposition (~38-44)",
    props: {
      "Phase or Transition": P.select("Transition"),
      "Approximate Age": P.text("~38-44 (Rave half-life)"),
      "Profile Applicability": P.select("Universal"),
      "Reading-Timing Rule": P.text("Read anywhere within the 38-44 window; the still-point framing applies throughout"),
      "Source Citations": P.multi(["Understanding the Planets", "Lifecycles"]),
      "Delphi Basic Description": P.text("The still-point between breaths — the structural midpoint of the entire 84-year Uranian cycle. Prana shifts from in to out. The Nodes' primary governance effectively switches from South to North."),
    },
    emoji: "🌗",
    title: "Uranus Opposition — the still-point",
    toggles: [
      ["What it is (Universal)",
        "From Understanding the Planets: 'The midpoint of our life cycle, the Uranus Opposition, falls between the ages of 38 and 44. This is the fulcrum of the 2 geometries of our life… It is a time of great change in our lives; the so-called midlife crisis.' This is the structural midpoint of the 84-year Uranian cycle. Prana shifts from in (developmental) to out (maturation, true flowering). 'It is only really after our Uranus Opposition that we can really begin to make our full contribution to the world.'"],
      ["What changes (Universal)",
        "The Nodes' primary governance effectively switches: the South Node theme (first-half trajectory) yields, the North Node theme (second-half trajectory) takes over. Ra is explicit it's not a strict switch — both themes are present the whole life — but dominance shifts here. The design's relationship to its own purpose reorients from cellular-learning toward cellular-flowering."],
      ["Reading-Timing Rule",
        "Anywhere in the 38-44 window. The still-point framing applies throughout. The reading is universal across all profiles."],
    ],
  },
  {
    name: "Kiron Return (~50-51)",
    props: {
      "Phase or Transition": P.select("Transition"),
      "Approximate Age": P.text("~50-51; reading valid 3.5 years before through 3.5 years after"),
      "Profile Applicability": P.select("Universal"),
      "Reading-Timing Rule": P.text("Valid 3.5 years before through 3.5 years after the actual return. 7-year window. Ra: 'We're basically dealing with a process of 3½ years into it and 3½ across it.'"),
      "Source Citations": P.multi(["Lifecycles"]),
      "Delphi Basic Description": P.text("The last marker on the road. 'Coming off the roof' (for 6-line beings) / entering true maturity (universal). Vulnerability emerges as the Roof's protection ends."),
    },
    emoji: "🗝️",
    title: "Kiron Return — the last marker",
    toggles: [
      ["What it is (Universal)",
        "Ra (Lifecycles): 'The Kiron is the last marker on the road.' Universally applicable. Beyond the Kiron Return, the design enters the True Maturity phase. The Personality and Design Chiron positions name what the design is here to BECOME at this stage. See HD Planets entry for Chiron."],
      ["Reading-timing rule (critical)",
        "Ra: 'I say 3½ years because basically whenever we're looking at these kinds of cycle points, we're basically dealing with a process of 3½ years into it and 3½ across it. The 7-year cycle with the point in the middle gives you a kind of going in and getting in as a way of timing.' Reading is valid 3.5 years before the actual return through 3.5 years after. Last-chance framing: 'one last chance for the dance, see it right and take the opportunity to experiment in time.'"],
      ["Vulnerability framing (Universal)",
        "Ra: 'There are risks to not being correct when you come off the roof. There are dangers to your well-being, both psychic and physical. Mutative beings being mutative are much more vulnerable than others.' The protective stage that came before ends; the chart's vulnerability to incorrect strategy increases. Read Kiron's gate as both the flowering theme AND the place vulnerability emerges if the design isn't living correctly."],
      ["6-line specific overlay",
        "For 6th-line beings, the Kiron Return is the explicit transition from the Roof Phase to the Kiron Phase — 'coming off the roof.' The mystical-death framing applies to 6-line beings specifically. Universal Kiron Return = entering true maturity; 6-line Kiron Return = coming off the roof into the post-roof life."],
    ],
  },
  {
    name: "The Kiron Phase — True Maturity",
    props: {
      "Phase or Transition": P.select("Phase"),
      "Approximate Age": P.text("Kiron Return (~50-51) → Uranus Return (~84)"),
      "Profile Applicability": P.select("Universal with 6-line amplification"),
      "Reading-Timing Rule": P.text("The chart-bearer lives this phase; no separate reading required beyond the Kiron Return reading"),
      "Source Citations": P.multi(["Lifecycles", "Way of the Mind"]),
      "Delphi Basic Description": P.text("The new flowering, the real maturity, the ~30 years post-Kiron. Ra's predicted period of 'remarkable examples that humanity has ever had.' Mercury / Venus / Neptune (the Diamond / survival mechanisms) get left behind."),
    },
    emoji: "🪷",
    title: "The Kiron Phase — True Maturity",
    toggles: [
      ["What it is (Universal)",
        "Ra (Lifecycles): 'Then finally at the Kiron, this magical coming off the roof, the new flowering, the real maturity. The theme of the mature being is where the fulfillment of purpose takes place.' This is the ~30 years between Kiron Return and Uranus Return — Ra's predicted era of 'some of the most remarkable examples that humanity has ever had in all kinds of things.' For nine-centred beings living correctly, this is the differentiated-uniqueness phase."],
      ["The formula by phase (from Way of the Mind)",
        "Pre-Saturn (Childhood): formula = 'Strategy and Authority, Dietary Regimen' (the basics). Saturn to Kiron (Roof + universal mid-life): formula = 'the Story Line rooted in the Environment and Perspective.' Post-Kiron: 'There is no formula for post-Kiron. The learning is over. You no longer belong to the homogenized frame.' Awareness takes over; the passenger is liberated from the mundane mind."],
      ["What gets left behind (from Way of the Mind)",
        "Post-Kiron, the design 'leaves behind the Mercury and the Venus and the Neptune' — the Diamond planets that served as survival mechanisms. The Diagonal axis (Saturn, Mars, Pluto, Uranus) — the awareness/mutation quartet — takes precedence. This is structural, not metaphorical: the design's relationship to the Diamond planets shifts."],
      ["6-line amplification",
        "For 6th-line beings specifically, this is the 'mystical death' period — leaving behind both the 3rd line phase (childhood) and the 6th line phase (roof). 'Neither this nor that.' For non-6-line charts, the universal true-maturity framing applies; the mystical-death language belongs only to 6-line charts."],
    ],
  },
  {
    name: "Second Saturn Return (~58) and Uranus Return (~84)",
    props: {
      "Phase or Transition": P.select("Transition"),
      "Approximate Age": P.text("~58 (Second Saturn) and ~84 (Uranus Return)"),
      "Profile Applicability": P.select("Universal"),
      "Reading-Timing Rule": P.text("Same mid-cycle timing rule as first Saturn Return; Uranus Return generally not read (very few live to it; framing uncertain)"),
      "Source Citations": P.multi(["Lifecycles"]),
      "Delphi Basic Description": P.text("Less weight than Kiron in Ra's framework. Second Saturn Return is a recursion of the structural mandate at depth within the Kiron Phase. Uranus Return closes the 84-year cycle."),
    },
    emoji: "🕯️",
    title: "Second Saturn Return and Uranus Return — the terminal markers",
    toggles: [
      ["Second Saturn Return (~58)",
        "Ra (Lifecycles): 'Oh yes, you can look at the second Saturn. If you live long enough you can look at three of them. But the fact is that this [Kiron] is the last major marker.' Second Saturn Return is a recursion of the first Saturn Return's structural-mandate theme, now read at the depth of the Kiron Phase. The same mid-cycle reading-timing rule applies: read 3-5 years after the actual return, not at the moment."],
      ["Uranus Return (~84)",
        "The closing of the 84-year Uranian cycle. Ra: 'Maybe the third Saturn is actually an expression in a way that we have never been able to see Saturn in terms of the closing of the life cycle. That I don't really know.' Very few live to this transition with the awareness to be read. Modern lifespan trends suggest more will. Framing remains uncertain. For most charts the Uranus Return is best treated as a beat to acknowledge in the timeline, not as a full reading."],
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HD Planetary Conjunctions — 8 entries
// ─────────────────────────────────────────────────────────────────────────────

const CONJUNCTIONS = [
  {
    name: "Neptune veils the conjunct planet",
    props: {
      "Planets Involved": P.multi(["Neptune"]),
      "Conjunction Type": P.select("Same gate"),
      "Behavior": P.text("Any planet sitting in the same gate as Neptune is partially veiled. The conjunct planet's meaning is obscured — you can see evidence of its activation but cannot fix what it is."),
      "Apply When": P.text("Any chart where Neptune shares a gate with another planet (Personality or Design)."),
      "Source Citations": P.multi(["Edinburgh", "Understanding the Planets"]),
      "Delphi Basic Description": P.text("Neptune veils anything conjunct it. Recognise the veil; do not try to lift it. The conjunct planet's signature operates through mystery."),
    },
    emoji: "🌫️",
    title: "Neptune veils the conjunct planet",
    toggles: [
      ["Behavior",
        "Ra: 'If you have Neptune conjunct a planet — in other words if your Neptune is standing beside something in a gate — it's also veiling that other object.' The conjunct planet retains its signature but the design cannot get a fix on its operation. Mercury+Neptune: communication veiled, 'out of the blue comes some kind of funny comment and I've no idea where it came from.' Sun+Neptune: the chart's conscious purpose carrier itself is veiled."],
      ["When to apply",
        "Report should detect any natal conjunction with Neptune (Personality or Design) and surface the veiling in BOTH the Neptune section AND the section of the other planet involved. Neptune's veil is a permanent stamp on the natal — it does not lift when Neptune transits move."],
    ],
  },
  {
    name: "Mars + Pluto — immature truth",
    props: {
      "Planets Involved": P.multi(["Mars", "Pluto"]),
      "Conjunction Type": P.select("Same gate"),
      "Behavior": P.text("Mars supplies immaturity to Pluto's truth-mechanism. The design carries a permanent immaturity in how it holds the generational truth — half-truths, Martian truths instead of mature truth."),
      "Apply When": P.text("Mars and Pluto share a gate (Personality or Design)."),
      "Source Citations": P.multi(["Edinburgh"]),
      "Delphi Basic Description": P.text("Mars's immaturity compounds with Pluto's truth-stance. The truth-bearing in the design carries a juvenile quality — sharp but not seasoned."),
    },
    emoji: "🎯",
    title: "Mars + Pluto — immature truth",
    toggles: [
      ["Behavior",
        "Ra (on the 2003 Mars-conjunct-Pluto in the 26th gate): 'You have the immaturity of Mars with the truth of Pluto. So right now we are not getting any mature truth from anybody. We're getting a lot of half-truths. And more than that we're getting Martian truths.' Applied to birth-stamp: a person carrying Mars+Pluto in the same gate carries a permanent immaturity in how they hold the generational truth-question. Powerful and juicy when correct; reactive and sharp when not."],
    ],
  },
  {
    name: "Saturn + Mars + Pluto stack",
    props: {
      "Planets Involved": P.multi(["Saturn", "Mars", "Pluto"]),
      "Conjunction Type": P.select("Same gate"),
      "Behavior": P.text("Compound conjunction: punishment + immaturity + truth all converge on one gate. Read all three signatures stacked."),
      "Apply When": P.text("All three planets share a gate. Rare but Ra discusses it explicitly (he carries Mars, Pluto, Saturn in the 7th gate)."),
      "Source Citations": P.multi(["Edinburgh"]),
      "Delphi Basic Description": P.text("All three Diagonal-axis planets stack at one gate. The gate carries the design's mature-truth-via-punishment dynamic — concentrated awareness work."),
    },
    emoji: "🎲",
    title: "Saturn + Mars + Pluto stack",
    toggles: [
      ["Behavior",
        "Ra (in self-reference): 'I have Mars, Pluto and Saturn in the 7th gate.' All three Diagonal-axis planets converge on one gate. The signatures compound: Pluto's truth-question (generational), Mars's immaturity in approaching it, Saturn's consequence-engine when broken. Read as: the design has concentrated awareness-work at this gate, with the Saturn-Mars-Pluto compound shaping how that work expresses."],
    ],
  },
  {
    name: "Venus + Jupiter — moral law collapsed",
    props: {
      "Planets Involved": P.multi(["Venus", "Jupiter"]),
      "Conjunction Type": P.select("Same gate"),
      "Behavior": P.text("Values (Venus) and codified law (Jupiter) collapsed into a single gate. Babylonian-tradition conjunction; the true moral law as one stamp."),
      "Apply When": P.text("Venus and Jupiter share a gate (Personality or Design)."),
      "Source Citations": P.multi(["Edinburgh"]),
      "Delphi Basic Description": P.text("Values and law as one point. The Babylonian conjunction tradition: 'the embodiment of the way to the ancient mind. That is the true moral law.'"),
    },
    emoji: "⚖️",
    title: "Venus + Jupiter — moral law collapsed",
    toggles: [
      ["Behavior",
        "Ra: 'The Babylonians understood. In Babylonian astrology, how incredible the conjunction of Venus and Jupiter. This is the embodiment of the way to the ancient mind. That is the true moral law.' A chart with Venus and Jupiter in the same gate carries the moral law collapsed into a single point — values and the codified law are not separate stages but one stamp. Saturn's punishment-where-broken still applies; what's collapsed is the values→law process."],
    ],
  },
  {
    name: "Planet conjunct Node — stellar programming overridden",
    props: {
      "Planets Involved": P.multi(["North Node", "South Node"]),
      "Conjunction Type": P.select("Node + Planet"),
      "Behavior": P.text("CRITICAL: any planet sitting at the same gate as a Node eliminates the Node's trans-cellular stellar programming. The planet's signature replaces the Node's window."),
      "Apply When": P.text("Any chart where a planet shares a gate with North Node or South Node (Personality or Design)."),
      "Source Citations": P.multi(["Understanding the Planets"]),
      "Delphi Basic Description": P.text("From Understanding the Planets: 'Whenever a planet is conjunct a Node, it effectively eliminates the stellar programming.' The Node's window-to-the-starfield is closed; the planet's stamp dominates."),
    },
    emoji: "🪟",
    title: "Planet conjunct Node — the stellar window closes",
    toggles: [
      ["Behavior (critical new conjunction rule)",
        "From Understanding the Planets (per Kaycee): 'Whenever a planet is conjunct a Node, it effectively eliminates the stellar programming.' So a chart with Personality Jupiter at the same gate.line as the Personality North Node carries Jupiter's lawgiver imprint INSTEAD OF the trans-cellular star-field information at that point on the geometry. The Node is 'still there' as a geometric position but the planet's imprint dominates the reading."],
      ["When to apply",
        "Report must detect any natal conjunction between a planet and a Node (Personality or Design). The detection should surface in BOTH the planet's section AND the Node's section. The Node section should explicitly note the stellar-window-closure when this conjunction is present. Per Kaycee: a dedicated conjunctions callout section in the report should include this case prominently."],
    ],
  },
  {
    name: "Sun + Node — primary programming meets trajectory",
    props: {
      "Planets Involved": P.multi(["Sun", "North Node", "South Node"]),
      "Conjunction Type": P.select("Node + Planet"),
      "Behavior": P.text("Special weight: the chart's 70% programming carrier IS the trans-cellular trajectory marker. Subset of the planet-conjunct-Node rule, but uniquely load-bearing."),
      "Apply When": P.text("Personality Sun or Design Sun conjunct North Node or South Node."),
      "Source Citations": P.multi(["Understanding the Planets"]),
      "Delphi Basic Description": P.text("When the Sun (70% programming carrier) sits at the same gate as a Node, the chart's conscious purpose IS the geometric trajectory marker. Highest weight in the conjunction set."),
    },
    emoji: "☀️",
    title: "Sun + Node — primary programming as trajectory",
    toggles: [
      ["Behavior",
        "This is the most load-bearing application of the planet-conjunct-Node rule. When the Sun's gate is also a Node's gate, the chart's primary programming carrier (70% of all conditioning) is the same point as the geometric trajectory marker. The Node's trans-cellular stellar window closes; what flows through that geometric position is the chart's conscious purpose. The chart's life-direction and its programming-carrier are unified at that point."],
      ["Application",
        "If Personality Sun + Personality North Node share a gate, the second-half-of-life trajectory IS the chart's conscious purpose carrier — they cannot be read as separate readings. If Personality Sun + Personality South Node share a gate, the first-half-of-life trajectory is unified with conscious purpose. Same logic for Design Sun + Design Node combinations at the unconscious level."],
    ],
  },
  {
    name: "Earth + Saturn — material-plane compounding",
    props: {
      "Planets Involved": P.multi(["Earth", "Saturn"]),
      "Conjunction Type": P.select("Thematic pairing"),
      "Behavior": P.text("Not strictly a same-gate rule — a thematic pairing. Both planets work the material plane. When their gates are thematically adjacent in the chart, the material-plane stamp compounds."),
      "Apply When": P.text("Earth and Saturn share a gate, share a channel, or sit in materially-resonant gates of the same chart."),
      "Source Citations": P.multi(["Edinburgh"]),
      "Delphi Basic Description": P.text("Ra: 'If you were to find a planetary association closest to Saturn, it's the Earth.' Both work the material plane. Where their gates compound thematically, the material-plane stamp intensifies."),
    },
    emoji: "🪨",
    title: "Earth + Saturn — material-plane pairing",
    toggles: [
      ["Behavior",
        "Ra: 'Saturn is deeply connected with the material plane and if you were to find a planetary association closest to Saturn, it's the Earth. The Earth and Saturn have a deep connection to each other; they're both deeply concerned about the material plane.' This is not a strict same-gate conjunction rule — it's a thematic-pairing rule. When the Earth and Saturn gates are materially-resonant within the chart (same gate, same channel, or sharing material-themed centers), the material-plane stamp compounds."],
    ],
  },
  {
    name: "Diamond vs Diagonal axis conjunctions (v2 framework)",
    props: {
      "Planets Involved": P.multi(["Mercury", "Venus", "Jupiter", "Neptune", "Saturn", "Mars", "Pluto", "Uranus"]),
      "Conjunction Type": P.select("Thematic pairing"),
      "Behavior": P.text("Within Way of the Mind's Magic Square framework: Mercury+Venus+Jupiter+Neptune = Diamond (survival mechanisms). Saturn+Mars+Pluto+Uranus = Diagonal (awareness/mutation). Conjunctions within an axis vs across compound differently."),
      "Apply When": P.text("v2 only — flagged for future enrichment, not v1 retrieval."),
      "Source Citations": P.multi(["Way of the Mind"]),
      "Delphi Basic Description": P.text("v2 ONLY. Way of the Mind organises 8 of the planets into Diamond (survival) and Diagonal (awareness). Conjunctions read differently within vs across these axes. Not used in v1 reports."),
    },
    emoji: "💎",
    title: "Diamond vs Diagonal — v2 framework",
    toggles: [
      ["The framework (Way of the Mind)",
        "8 of the planets organise into two axes within the Magic Square: Diamond (Mercury, Venus, Jupiter, Neptune) = survival mechanisms used by the mundane mind. Diagonal (Saturn, Mars, Pluto, Uranus) = awareness/mutation axis. The Moon sits at the center. Post-Kiron, the Diamond gets left behind."],
      ["Conjunction implications",
        "Within-axis conjunctions (e.g., Mercury+Neptune = both Diamond) compound the survival-mechanism quality. Within-axis on the Diagonal (e.g., Mars+Pluto) compounds awareness/mutation work. Cross-axis conjunctions tend to read as the awareness planet teaching the survival planet (e.g., Saturn+Mercury, Pluto+Venus)."],
      ["Why v2",
        "v1 PO reports already handle the most consequential conjunctions through entries above (Neptune-veiling, Mars-Pluto, etc.). Adding Diamond/Diagonal framework doubles the conceptual surface of the conjunctions section. Reserve for v2 once v1 quality is established."],
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

const mode = process.argv.includes("--commit") ? "commit" : "dry";
console.log(`Mode: ${mode}`);
console.log();

async function processBatch(label, dsId, entries) {
  console.log(`=== ${label}: ${entries.length} entries ===`);
  if (mode === "dry") {
    for (const e of entries) console.log(`  CREATE "${e.name}" (${e.toggles.length} toggles)`);
    console.log();
    return { ok: 0, err: 0 };
  }
  let ok = 0, err = 0;
  for (const e of entries) {
    process.stdout.write(`  ${e.name.slice(0, 60).padEnd(60)}  `);
    const props = { "Name": P.title(e.name), ...e.props };
    const co = callout(e.emoji, e.title, e.toggles.map(([s, p]) => toggle(s, p)));
    const r = await createPage(dsId, props, [co]);
    if (r.ok) { ok++; console.log(`✓`); }
    else { err++; console.log(`✗ ${r.error}`); }
    await throttle();
  }
  console.log();
  return { ok, err };
}

const r1 = await processBatch("HD Planetary Frames", FRAMES_DS, FRAMES);
const r2 = await processBatch("HD Lifecycle Phases", LIFECYCLE_DS, LIFECYCLE);
const r3 = await processBatch("HD Planetary Conjunctions", CONJUNCTIONS_DS, CONJUNCTIONS);

console.log(`=== TOTAL ===`);
console.log(`  OK: ${r1.ok + r2.ok + r3.ok}  Errors: ${r1.err + r2.err + r3.err}`);
