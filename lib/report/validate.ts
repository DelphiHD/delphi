// Post-generation report validator.
//
// Takes a rendered Foundation Report (or any tier) and the canonical Data
// Pass, and emits structured pass/fail results. The report is rejected if
// any HARD failure fires; SOFT failures trigger a single auto-regeneration
// of the offending section.
//
// Mirrors the "audit subagent" step in Kaycee's manual workflow: she ran a
// validation pass at the end of every report to confirm chart-data fidelity.
// Sample from Chris's reference file: "87/87 chart-data fields matched.
// Recommendation APPROVE by audit subagent." We're rebuilding that here.

import type { DataPass } from "@/lib/chart/datapass";

export type Severity = "hard" | "soft";

export interface ValidationIssue {
  severity: Severity;
  section: string;             // which section the issue lives in (e.g. "Your Centers")
  rule: string;                // short rule id (e.g. "center-missing", "definition-mismatch")
  message: string;
  detected: string;            // what the report says
  expected?: string;           // what the Data Pass says (if relevant)
}

export interface ValidationResult {
  passed: boolean;             // false if any hard failure fires
  issues: ValidationIssue[];
  hardCount: number;
  softCount: number;
  factsChecked: number;
  factsMatched: number;
  summary: string;             // single-line headline, e.g. "87/87 fields matched. APPROVE."
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ALL_CENTER_CANONICAL = ["head", "ajna", "throat", "g", "heart", "solar plexus", "sacral", "spleen", "root"] as const;

function lowerCenterKey(headerName: string): string {
  // Normalize a center H3 header label like "Solar Plexus (Emotional)" or
  // "Ego (Heart, Will)" or "G | Identity | Defined" back to the 9 canonical
  // keys: head / ajna / throat / g / heart / solar plexus / sacral / spleen / root.
  const stripped = headerName.toLowerCase().replace(/\(.*?\)/g, "").trim();
  for (const k of ALL_CENTER_CANONICAL) {
    if (stripped === k || stripped.startsWith(k + " ") || stripped.startsWith(k + "|")) return k;
  }
  // Handle variants: "Ego" → "heart", "Splenic" → "spleen", "G center" → "g"
  if (/^ego\b/.test(stripped)) return "heart";
  if (/^splenic\b/.test(stripped)) return "spleen";
  if (/^g\b/.test(stripped)) return "g";
  return stripped;
}

// Section slicer: returns the body of the named H1 section, or null.
// Finds ALL occurrences of the H1 header, then returns the slice that has
// the most body content. This is robust against accidental tables of contents
// the model sometimes inserts at the top of the report (where every H1
// appears as a one-liner with no body between consecutive headers).
function getH1Section(text: string, h1Name: string): string | null {
  const escape = h1Name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startRe = new RegExp(`^# ${escape}[^\\n]*$`, "img");
  const matches: { startIdx: number; headerEnd: number }[] = [];
  for (const m of text.matchAll(startRe)) {
    if (m.index === undefined) continue;
    matches.push({ startIdx: m.index, headerEnd: m.index + m[0].length });
  }
  if (matches.length === 0) return null;

  // For each match, compute the slice until the next H1 (any name).
  let bestSlice: string | null = null;
  let bestBodyLength = -1;
  for (const m of matches) {
    const afterStart = text.slice(m.headerEnd);
    const nextH1 = afterStart.match(/\n# [^\n]+/);
    const endIdx = nextH1 && nextH1.index !== undefined ? m.headerEnd + nextH1.index : text.length;
    const slice = text.slice(m.startIdx, endIdx);
    const bodyLength = slice.length - (m.headerEnd - m.startIdx); // body chars after the header line
    if (bodyLength > bestBodyLength) {
      bestBodyLength = bodyLength;
      bestSlice = slice;
    }
  }
  return bestSlice;
}

// Find an H2 within an H1 section by its label prefix.
function findH2(section: string, labelPrefix: string): string | null {
  const escape = labelPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^## ${escape}[^\\n]*$`, "im");
  const m = section.match(re);
  return m ? m[0] : null;
}

function findAllH2(section: string): string[] {
  return (section.match(/^## [^\n]+$/gm) ?? []);
}

function findAllH3(section: string): string[] {
  return (section.match(/^### [^\n]+$/gm) ?? []);
}

// All valid definition labels (the set of strings the chart might be) plus
// the short forms Kaycee and the reports commonly use. Used for drift
// detection: if the report references one of these AS APPLYING TO THE READER,
// it must match the chart's actual Definition label.
//
// The short forms ("Quadruple Split", "Triple Split", "Single", etc.) are
// what slip into prose when the model gets sloppy. The full canonical labels
// ("Quadruple Split Definition") rarely appear in body prose, so matching
// only those would miss the most common drift.
// Case-insensitive so coined forms like "Quadruple-split-adjacent" still
// trigger. The "Split Definition" pattern uses a negative lookbehind to
// exclude legitimate "Triple Split Definition" / "Quadruple Split
// Definition" mentions whose "Split Definition" suffix would otherwise
// match as a substring (Meelad v1 had 4 false positives on this).
const DEFINITION_TYPE_TERMS = [
  { canonical: "Single Definition",           pattern: /\b(?:Single Definition|Single-Definition)\b/gi },
  { canonical: "Split Definition",            pattern: /(?<!Triple[\s-])(?<!Quadruple[\s-])\b(?:Simple Split|Wide Split|Broad Split|Split Definition)\b/gi },
  { canonical: "Triple Split Definition",     pattern: /\bTriple[\s-]Split\b/gi },
  { canonical: "Quadruple Split Definition",  pattern: /\bQuadruple[\s-]Split\b/gi },
  { canonical: "No Definition",               pattern: /\bNo Definition\b/gi },
];

// ─── Main entry ─────────────────────────────────────────────────────────────

export type ReportTier = "foundation" | "planetary" | "quickstart";

// Per-tier required H1 sections. Each tier has a different scope; sharing the
// validator across tiers would force false-positive "section-missing" hits.
const REQUIRED_H1_BY_TIER: Record<ReportTier, string[]> = {
  foundation: [
    "How to Use This Report",
    "Your Profile",
    "Your Type",
    "Your Strategy",
    "Your Authority",
    "Your Variables",
    "Your Incarnation Cross",
    "Your Timeline",
    "Your Definition",
    "Your Centers",
    "Your Channels",
    "Themes",
    "Gifts and Challenges",
  ],
  // Planetary list updated 2026-05-29 for the v4 restructure. The
  // Introduction, Personality Placements Table, and Design Placements Table
  // are now static-injected (Kaycee's verbatim Introduction). The Cross H1
  // is the cross's thematic name itself with a parenthetical gate string
  // (e.g. "The Left Angle Cross of The Clarion | (51/57 | 61/62)") — it
  // varies per chart so it can't be required by literal name; the post-loop
  // check below handles it via regex. Timeline MOVED to the end of the
  // report. Conjunctions is conditional and intentionally omitted.
  planetary: [
    "Introduction",
    "Personality Placements Table",
    "Design Placements Table",
    "Sun and Earth",
    "Moon Placements",
    "Nodes of the Moon",
    "Inner Planets",
    "Saturn and Jupiter",
    "Outer Planets",
    "Your Timeline",
  ],
  quickstart: [
    "How to Use This Report",
    "Variables",
    "Type, Strategy, and Authority",
    "Profile",
    "Incarnation Cross",
    "Centers",
    "Channels",
    "Definition",
    "Application",
    "Closing",
  ],
};

export function validateReport(text: string, dp: DataPass, tier: ReportTier = "foundation"): ValidationResult {
  const issues: ValidationIssue[] = [];
  let factsChecked = 0;
  let factsMatched = 0;

  const pushHard = (i: Omit<ValidationIssue, "severity">) => issues.push({ severity: "hard", ...i });
  const pushSoft = (i: Omit<ValidationIssue, "severity">) => issues.push({ severity: "soft", ...i });

  // 1. Required H1 sections must exist (tier-specific).
  const requiredH1 = REQUIRED_H1_BY_TIER[tier];
  for (const h of requiredH1) {
    factsChecked++;
    if (getH1Section(text, h)) factsMatched++;
    else pushHard({
      section: h, rule: "section-missing",
      message: `Required H1 section "# ${h}" not found in report.`,
      detected: "(missing)", expected: `# ${h}`,
    });
  }

  // 1b. Planetary-tier Incarnation Cross H1 check. The Cross H1 in v4 carries
  // the cross's thematic name itself, with a pipe-delimited gate string in
  // parens (e.g. "# The Left Angle Cross of The Clarion | (51/57 | 61/62)").
  // The literal-name match in the loop above can't catch this because the
  // name varies per chart. Look for any H1 line containing the standardized
  // "(N/N | N/N)" parenthetical.
  if (tier === "planetary") {
    factsChecked++;
    const crossH1Re = /^#\s+.*\(\s*\d+\s*\/\s*\d+\s*\|\s*\d+\s*\/\s*\d+\s*\)/m;
    if (crossH1Re.test(text)) {
      factsMatched++;
    } else {
      pushHard({
        section: "Your Incarnation Cross",
        rule: "cross-h1-missing",
        message: `Incarnation Cross H1 in standardized format not found. Expected an H1 of the form "# <Cross Thematic Name> | (P-Sun-gate/P-Earth-gate | D-Sun-gate/D-Earth-gate)" — e.g. "# The Left Angle Cross of The Clarion | (51/57 | 61/62)".`,
        detected: "(missing)",
        expected: `# <Cross Name> | (N/N | N/N)`,
      });
    }
  }

  // 2. Definition section must reference the canonical Definition label, and
  // NO other definition-type term should be used as if it applied to the
  // reader's chart anywhere else in the report.
  const expectedDefLabel = dp.split.definitionLabel; // e.g. "Split Definition"
  // The Definition section's H1 differs by tier: Foundation = "Your Definition",
  // Quickstart = "Definition". Planetary doesn't render a dedicated section.
  const definitionH1 = tier === "foundation" ? "Your Definition" : tier === "quickstart" ? "Definition" : null;
  const definitionSection = definitionH1 ? getH1Section(text, definitionH1) : null;
  if (definitionH1) {
    factsChecked++;
    if (definitionSection && definitionSection.includes(expectedDefLabel)) {
      factsMatched++;
    } else if (definitionSection) {
      pushHard({
        section: definitionH1,
        rule: "definition-not-cited",
        message: `Definition section does not cite the canonical Definition label.`,
        detected: definitionSection.slice(0, 200),
        expected: expectedDefLabel,
      });
    }
  }

  // Anywhere in the report, mentions of a wrong definition-type that implies
  // it applies to the reader's chart. We look for terms like "Quadruple Split",
  // "Triple Split", "Single Definition" anywhere in the text, then check the
  // surrounding context to filter false positives (contrastive uses like
  // "unlike a Quadruple Split chart").
  for (const term of DEFINITION_TYPE_TERMS) {
    if (term.canonical === expectedDefLabel) continue;
    const matches = [...text.matchAll(term.pattern)];
    for (const m of matches) {
      const idx = m.index ?? 0;
      const beforeWindow = text.slice(Math.max(0, idx - 60), idx).toLowerCase();
      const afterWindow  = text.slice(idx, Math.min(text.length, idx + m[0].length + 60)).toLowerCase();

      // Skip contrastive contexts. Includes comparative phrasings like
      // "Split charts are more X than Y Definition charts" where any number
      // of words can sit between 'more/less' and 'than'. Check both
      // beforeWindow alone AND the combined before+match+after window — the
      // "than" may come after the term being matched.
      if (/\b(unlike|compared to|vs\.?|rather than|in contrast to|not a|not the|not\b|whereas a|whereas the|differs from|distinct from|in common with|shares (?:\w+ )?(?:with|similarities)|closer to|more like)\b/.test(beforeWindow)) continue;
      // Skip colloquial-English fusion phrasing: "into a single definition,"
      // "fused into a single definition," "as one single definition." This
      // is English meaning "unified" — not the HD term Type-applied to the
      // reader. Only triggers on lowercase "single definition" (HD Type
      // references are typically capitalized).
      if (/\b(?:into|as|forms?|fuses?(?:\s+into)?|combine[ds]?(?:\s+into)?|merge[ds]?(?:\s+into)?|unif(?:y|ied|ying)(?:\s+into)?)\s+(?:a|one)\s*$/i.test(beforeWindow)
          && /^single[\s-]definition\b/i.test(m[0])) continue;
      if (/\b(more|less)\b[^.]{1,80}\bthan\b/.test(beforeWindow)) continue;
      // Broader: term sits inside a "more X than Y" sentence, where Y may
      // come after the term. Concatenate beforeWindow + match + afterWindow
      // and check for the pattern.
      const fullWindow = beforeWindow + m[0].toLowerCase() + afterWindow;
      if (/\b(more|less)\b[^.]{1,80}\bthan\b/.test(fullWindow)) continue;
      // Skip generic teaching context. Patterns like "A chart with a Single
      // Definition has...", "When a chart has Triple Split definition...",
      // "In a Quadruple Split design...", "For a Single Definition design..."
      // describe the type abstractly, not the reader. Drift is when the model
      // says "this Quadruple Split", "your Quadruple Split", "the Quadruple
      // Split finds", "for the Quadruple Split", which the regex below does
      // not match.
      if (/\b(a chart with|when a chart|if a chart|in a|in an|for a|for an|chart that has|charts that have|chart with|charts with|design with|designs with|a person with)\s+(?:a|an)?\s*$/i.test(beforeWindow)) continue;
      // Also: "A <Type> chart runs..." / "An <Type> design produces..." —
      // when the term sits between an indefinite article and a generic
      // noun (chart, design, configuration, person, type), it's teaching.
      // Covers v11's regression: "A Single Definition chart runs as one
      // continuous circuit. This design runs as two..." where the writer
      // contrasts the reader's actual Definition with the other type.
      if (/\b(?:a|an)\s*$/i.test(beforeWindow) && /^\s*(?:chart|design|configuration|person|type|kind)\b/i.test(afterWindow.slice(m[0].length))) continue;

      factsChecked++;
      pushHard({
        section: "(any)",
        rule: "definition-drift",
        message: `Report references "${m[0]}" in a way that may imply it applies to the reader, but the chart's actual Definition is "${expectedDefLabel}".`,
        detected: text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + m[0].length + 80)).replace(/\n/g, " "),
        expected: expectedDefLabel,
      });
    }
  }

  // 2b. Type drift (HARD): the report must not describe the reader AS a
  // different HD Type than the chart's. We catch the model substituting a
  // wrong Type into a reader-applied phrase, e.g. "allowing the Manifesting
  // Generator mechanics to run" on a Manifestor chart, or "since you're a
  // Projector" on a Generator chart.
  //
  // Strategy: look for a fixed set of reader-applied templates, fill them
  // with each non-chart Type, and flag matches. Pure comparative prose
  // ("Manifestor energy moves differently from Generator energy") is
  // intentionally NOT flagged here; it's addressed by the prompt's "drop
  // cross-Type comparisons" rule.
  const expectedType = (dp.type || "").trim();
  const OTHER_TYPES = ["Manifesting Generator", "Manifestor", "Generator", "Projector", "Reflector"]
    .filter((t) => t !== expectedType);
  // The "Generator" pattern also matches inside "Manifesting Generator", so
  // if expectedType is "Manifesting Generator" we exclude "Generator" from
  // the other-types list. (Already excluded via filter above.)
  // Conversely, if the chart IS a Generator, we still want to flag
  // "Manifesting Generator" applied to the reader. Order doesn't matter for
  // the templates themselves; we use word-boundary anchors.
  const readerAppliedTemplates: { build: (t: string) => RegExp; label: (t: string) => string }[] = [
    // Original direct-applied templates.
    { build: (t) => new RegExp(`\\byour\\s+${t}\\b(?:\\s+(?:aura|mechanic|mechanics|energy|signature|not[\\s-]self|strategy|architecture|design))?`, "gi"),
      label: (t) => `"your ${t}"` },
    { build: (t) => new RegExp(`\\byou(?:'re|\\s+are)\\s+(?:a\\s+|an\\s+)?${t}\\b`, "gi"),
      label: (t) => `"you are a ${t}"` },
    { build: (t) => new RegExp(`\\bsince\\s+you(?:'re|\\s+are)\\s+(?:a\\s+|an\\s+)?${t}\\b`, "gi"),
      label: (t) => `"since you're a ${t}"` },
    { build: (t) => new RegExp(`\\bas\\s+(?:a\\s+|an\\s+)?${t}\\b,\\s*(?:you|your)`, "gi"),
      label: (t) => `"as a ${t}, you/your"` },
    { build: (t) => new RegExp(`\\bthe\\s+${t}\\s+(?:mechanic|mechanics|aura|strategy|architecture|design|signature|not[\\s-]self|life|body)\\b`, "gi"),
      label: (t) => `"the ${t} <mechanic|aura|…>"` },
    { build: (t) => new RegExp(`\\b(?:allowing|letting|run(?:ning)?|live(?:s|d|ing)?)\\s+(?:the\\s+|your\\s+)?${t}\\s+(?:mechanic|mechanics|design|architecture)\\b`, "gi"),
      label: (t) => `"running the ${t} mechanics"` },

    // Patterns Paul v1 exposed. The first six all slipped past the original
    // template set despite being unambiguous "this Type applies to you" claims.

    // "makes you a Manifesting Generator" / "makes you an MG"
    { build: (t) => new RegExp(`\\bmakes\\s+you\\s+(?:a\\s+|an\\s+)?${t}\\b`, "gi"),
      label: (t) => `"makes you a ${t}"` },
    // "More precisely, a Manifesting Generator" / "specifically, a Projector"
    // (after a CORRECT type statement the model then contradicts itself).
    { build: (t) => new RegExp(`\\b(?:more\\s+precisely|specifically|technically|in\\s+fact|to\\s+be\\s+exact|more\\s+exactly)[,\\s]+(?:a\\s+|an\\s+)?${t}\\b`, "gi"),
      label: (t) => `"more precisely, a ${t}"` },
    // "A Manifesting Generator who is initiating..." — applies to the reader
    // as a general descriptor.
    { build: (t) => new RegExp(`\\bA\\s+${t}\\s+(?:who|that)\\b`, "g"),
      label: (t) => `"A ${t} who/that"` },
    // "The Manifesting Generator is sometimes..." / "The Projector has..."
    { build: (t) => new RegExp(`\\bThe\\s+${t}\\s+(?:is|has|are|carries|carrys|moves|works|generates|operates|completes|tends|lives|acts|sees|feels|reads|responds|carries\\b)`, "g"),
      label: (t) => `"The ${t} <is|has|…>"` },
    // "Manifesting Generators move faster than pure Generators" — plural
    // generalization that includes the reader.
    { build: (t) => new RegExp(`\\b${t}s\\b\\s+(?:move|do|run|are|have|carry|complete|work|tend|generate|operate|live|act|respond|see|feel|read|process|initiate)\\b`, "g"),
      label: (t) => `"${t}s <move|do|are|…>"` },
    // "For Manifesting Generators specifically" / "For Generators in particular"
    { build: (t) => new RegExp(`\\bFor\\s+${t}s?\\b\\s*(?:specifically|in\\s+particular|in\\s+general|generally|like\\s+you|of\\s+this\\s+kind)?`, "g"),
      label: (t) => `"For ${t}s …"` },
  ];
  for (const t of OTHER_TYPES) {
    const tEsc = t.replace(/\s+/g, "[\\s-]");
    for (const tmpl of readerAppliedTemplates) {
      const re = tmpl.build(tEsc);
      for (const m of text.matchAll(re)) {
        const idx = m.index ?? 0;
        const beforeWindow = text.slice(Math.max(0, idx - 60), idx).toLowerCase();
        const afterWindowType = text.slice(idx + m[0].length, Math.min(text.length, idx + m[0].length + 60)).toLowerCase();
        // Skip "Generator" substring matches inside "Manifesting Generator"
        // when the chart IS a Manifesting Generator. Tiff v1 surfaced this:
        // "Manifesting Generators initiate" was flagged because the regex
        // matched the "Generators initiate" substring.
        if (t === "Generator" && expectedType === "Manifesting Generator") {
          const before20 = text.slice(Math.max(0, idx - 20), idx);
          if (/Manifesting[\s-]$/i.test(before20)) continue;
        }
        // Skip contrastive: "unlike a Projector, you..." / "not a Projector"
        if (/\b(unlike|not a|not an|not the|rather than|in contrast to|whereas a|whereas an)\s*$/i.test(beforeWindow)) continue;
        // Skip generic-teaching: "A Manifestor chart runs", "An MG design produces"
        if (/\b(?:a|an)\s*$/i.test(beforeWindow) && /^\s*(?:chart|design|configuration|person|type|kind)\b/i.test(afterWindowType)) continue;
        factsChecked++;
        pushHard({
          section: "(any)",
          rule: "type-drift",
          message: `Report applies ${tmpl.label(t)} to the reader, but the chart's actual Type is "${expectedType}".`,
          detected: text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + m[0].length + 80)).replace(/\n/g, " "),
          expected: expectedType,
        });
      }
    }
  }

  // 2b-2. Type drift count-threshold backstop. The templates above catch
  // specific reader-applied phrasings, but Paul v1 showed the model can
  // still saturate the report with the wrong Type ("Manifesting Generator"
  // appeared 6 times on a Generator chart, mostly in framings the templates
  // didn't cover). When the wrong Type appears 3+ times anywhere in the
  // report, that's catastrophic drift regardless of phrasing — even if
  // every individual instance has a defensible-looking context, the
  // cumulative effect is the reader being repeatedly told they're a Type
  // they aren't.
  for (const t of OTHER_TYPES) {
    const tEsc = t.replace(/\s+/g, "[\\s-]");
    const re = new RegExp(`\\b${tEsc}s?\\b`, "g");
    // For Generator: don't double-count "Manifesting Generator" hits when
    // checking "Generator" (the longer term already counted). Suppress
    // overlaps with previously-matched ranges.
    const allMatches = [...text.matchAll(re)];
    const filteredMatches = allMatches.filter((m) => {
      const idx = m.index ?? 0;
      // If this match falls inside the same span as a longer Type term we
      // would have already counted, skip.
      // For "Generator" matching inside "Manifesting Generator", the longer
      // term starts before this match and extends to this match's end.
      const before20 = text.slice(Math.max(0, idx - 20), idx);
      if (t === "Generator" && /Manifesting[\s-]$/i.test(before20)) return false;
      // "pure Generator" on a Manifesting Generator chart is contrastive, not
      // drift: an MG report legitimately distinguishes the reader from a pure
      // Generator ("is a Manifesting Generator, not a pure Generator", "where
      // a pure Generator moves step by step"). That phrase is the reader being
      // told what they are NOT, so it must not count toward wrong-Type
      // saturation. Parker v1 surfaced this: 3 correct "pure Generator"
      // contrasts falsely tripped the 3+ backstop.
      if (t === "Generator" && expectedType === "Manifesting Generator" && /pure\s+$/i.test(before20)) return false;
      return true;
    });
    if (filteredMatches.length >= 3) {
      pushHard({
        section: "(any)",
        rule: "type-drift-saturation",
        message: `Report mentions "${t}" ${filteredMatches.length} times (3+ = catastrophic drift) — the chart's actual Type is "${expectedType}". A handful of mentions in teaching/contrastive context is fine; this many means the report is treating the reader as a ${t}.`,
        detected: filteredMatches.slice(0, 3).map((m) => {
          const idx = m.index ?? 0;
          return text.slice(Math.max(0, idx - 30), Math.min(text.length, idx + m[0].length + 60)).replace(/\n/g, " ");
        }).join(" || "),
        expected: expectedType,
      });
    }
  }

  // 3. Centers section must include all 9 centers with the correct status.
  // Foundation-only — the other tiers don't render per-center H2/H3s.
  const centersSection = tier === "foundation" ? getH1Section(text, "Your Centers") : null;
  if (centersSection) {
    const renderedHeaders = [...findAllH2(centersSection), ...findAllH3(centersSection)];
    // Build a map of canonical center -> {found, status}.
    const found = new Map<string, { headerLine: string; status: string }>();
    for (const h of renderedHeaders) {
      // Header format: "## Throat | Manifestation | Defined" or
      // "### Throat | Manifestation | Defined". Status is the last pipe field.
      const parts = h.replace(/^#+ /, "").split("|").map((s) => s.trim());
      if (parts.length < 2) continue;
      const centerLabel = parts[0];
      const status = parts[parts.length - 1].toLowerCase();
      const key = lowerCenterKey(centerLabel);
      if (ALL_CENTER_CANONICAL.includes(key as typeof ALL_CENTER_CANONICAL[number])) {
        found.set(key, { headerLine: h, status });
      }
    }

    // Expected status from Data Pass.
    const expectedByKey = new Map<string, "defined" | "undefined" | "open">();
    for (const c of dp.centers) {
      expectedByKey.set(c.canonical, c.status);
    }

    for (const k of ALL_CENTER_CANONICAL) {
      factsChecked++;
      const f = found.get(k);
      const expected = expectedByKey.get(k);
      if (!f) {
        pushHard({
          section: "Your Centers",
          rule: "center-missing",
          message: `Center "${k}" not rendered in the Centers section.`,
          detected: "(missing)",
          expected: `${k} ${expected ?? "?"}`,
        });
        continue;
      }
      if (!expected) {
        // Center rendered but Data Pass has no entry for it; very unlikely
        // (Data Pass always covers all 9). Soft-fail.
        pushSoft({
          section: "Your Centers",
          rule: "center-extraneous",
          message: `Center "${k}" rendered but no entry in Data Pass.`,
          detected: f.headerLine,
        });
        continue;
      }
      if (f.status.includes(expected)) {
        factsMatched++;
      } else {
        pushHard({
          section: "Your Centers",
          rule: "center-status-mismatch",
          message: `Center "${k}" rendered with status "${f.status}", Data Pass says "${expected}".`,
          detected: f.headerLine,
          expected,
        });
      }
    }
  }

  // 4. Timeline section: every return present with exact date.
  // Foundation-only — Quickstart and Planetary don't render a Timeline.
  const timelineSection = tier === "foundation" ? getH1Section(text, "Your Timeline") : null;
  if (timelineSection) {
    const expectedReturns: { name: string; cycle: { firstPass: string; status: string } }[] = [
      { name: "Saturn Return",        cycle: dp.cycles.saturnReturn },
      { name: "Uranus Opposition",    cycle: dp.cycles.uranusOpposition },
      { name: "Chiron Return",        cycle: dp.cycles.chironReturn },
      { name: "Second Saturn Return", cycle: dp.cycles.secondSaturnReturn },
    ];
    for (const r of expectedReturns) {
      factsChecked++;
      const h2 = findH2(timelineSection, r.name);
      if (!h2) {
        pushHard({
          section: "Your Timeline",
          rule: "return-missing",
          message: `Return "${r.name}" not rendered in Timeline.`,
          detected: "(missing)",
          expected: `## ${r.name}: ${r.cycle.firstPass}`,
        });
        continue;
      }
      // Check that the exact date appears in the H2 or just below it.
      // The Data Pass first-pass date is YYYY-MM-DD; the prompt asks for
      // human-readable date but we accept both.
      const dateLine = h2 + timelineSection.slice(timelineSection.indexOf(h2));
      const yyyymmdd = r.cycle.firstPass;
      // Build a fuzzier date matcher: e.g. "February 13, 2022" matches "2022-02-13".
      const [yyyy, mm, dd] = yyyymmdd.split("-").map((s) => parseInt(s, 10));
      const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const longForm = `${monthNames[mm - 1]} ${dd}, ${yyyy}`;
      const isoForm = yyyymmdd;
      const shortForm = `${mm}/${dd}/${yyyy}`;
      if (dateLine.includes(longForm) || dateLine.includes(isoForm) || dateLine.includes(shortForm)) {
        factsMatched++;
      } else {
        pushHard({
          section: "Your Timeline",
          rule: "return-date-mismatch",
          message: `Return "${r.name}" rendered but exact date not visible. Expected one of: "${longForm}", "${isoForm}", or "${shortForm}".`,
          detected: dateLine.slice(0, 200),
          expected: longForm,
        });
      }
    }
  }

  // 5. Channels section: every channel present, with correct center pair.
  // Foundation-only — Quickstart and Planetary render channels in different formats.
  const channelsSection = tier === "foundation" ? getH1Section(text, "Your Channels") : null;
  if (channelsSection) {
    for (const ch of dp.channels) {
      factsChecked++;
      const id = ch.id; // e.g. "21-45"
      // The H2 should contain the channel id. Allow "(21-45)" or "(21 - 45)".
      const re = new RegExp(`^## .*\\(\\s*${ch.id.replace("-", "\\s*-\\s*")}\\s*\\)`, "im");
      if (!re.test(channelsSection)) {
        pushHard({
          section: "Your Channels",
          rule: "channel-missing",
          message: `Channel ${ch.id} (${ch.name}) not rendered in Channels section.`,
          detected: "(missing)",
          expected: `## (${ch.id}) ${ch.name}`,
        });
        continue;
      }
      factsMatched++;
    }
  }

  // 6. Variables section: each of the four computed H2 headers must appear
  // VERBATIM. Foundation-only — Quickstart uses a different H2 format
  // (e.g. "## Determination: Sound") and Planetary doesn't render a Variables
  // section.
  const variablesSection = tier === "foundation" ? getH1Section(text, "Your Variables") : null;
  if (variablesSection) {
    const expectedHeaders = [
      { label: "Digestion",   header: dp.variableHeaders.determination },
      { label: "Environment", header: dp.variableHeaders.environment },
      { label: "Motivation",  header: dp.variableHeaders.motivation },
      { label: "Perspective", header: dp.variableHeaders.perspective },
    ];
    // Allow either "## <header>" or just the header appearing on an H2 line.
    // Match line-anchored; the header itself doesn't include "## ".
    for (const e of expectedHeaders) {
      factsChecked++;
      const re = new RegExp(`^## ${e.header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
      if (re.test(variablesSection)) {
        factsMatched++;
        continue;
      }
      // Diagnose: is there an H2 for this variable that's just been altered?
      const looseRe = new RegExp(`^## ${e.label}\\b[^\\n]*$`, "im");
      const altered = variablesSection.match(looseRe);
      if (altered) {
        pushHard({
          section: "Your Variables",
          rule: "variable-header-altered",
          message: `H2 header for ${e.label} does not match the canonical computed header. Copy it character-for-character.`,
          detected: altered[0],
          expected: `## ${e.header}`,
        });
      } else {
        pushHard({
          section: "Your Variables",
          rule: "variable-header-missing",
          message: `No H2 header found for ${e.label}. The Variables section must contain the canonical computed header.`,
          detected: "(missing)",
          expected: `## ${e.header}`,
        });
      }
    }
  }

  // 7. Profile drift: if the chart's profile doesn't contain a 6, the report
  // must not describe the reader's life as having a "rooftop" phase, a
  // 6-line observation period, "Role Model" qualities, or "6-line-adjacent"
  // anything. Sixth-line language is profile-jargon that's catastrophically
  // wrong on a 2/4 chart.
  //
  // Gate-line references ("the sixth line of Gate 38", "38.6") stay legal —
  // those are hexagram lines, not profile lines. The patterns below pick out
  // profile-context phrases specifically.
  const profileStr = dp.profile || "";
  const profileHasSix = /\b6\b/.test(profileStr);
  if (!profileHasSix) {
    const sixLineMatchers = [
      // The term itself, anywhere.
      { re: /\b(?:rooftop|roof[\s-]top)\b/gi, label: "rooftop" },
      // The phrase "on the roof", anywhere — profile-jargon for the 6-line's
      // observation phase.
      { re: /\bon the roof\b/gi, label: "'on the roof' phase" },
      // The made-up coinage "6-line-adjacent".
      { re: /\b6[\s-]?line[\s-]adjacent\b/gi, label: "6-line-adjacent" },
      // "Role Model" with a profile-qualifier.
      { re: /\bRole[\s-]Model\s+(?:profile|line|phase|quality|theme|character)\b/gi, label: "Role Model profile" },
      // "the 6th line's [phase|observation|quality|...]" or "the 6-line [phase|...]" — possessive or qualifier forms.
      { re: /\b(?:the|your)\s+6(?:th)?[\s-]line(?:'s)?\s+(?:phase|quality|observation|theme|era|period|character|life|arc)\b/gi, label: "6-line phase claim" },
      // "you're a 6-line" / "you are a 6-line" / "you're a 6/X" / "you're a X/6"
      { re: /\byou(?:'re| are)\s+(?:a\s+)?(?:6[/-]\d|\d[/-]6|six[\s-]line|6[\s-]line)\b/gi, label: "6-line claim" },
    ];
    for (const m of sixLineMatchers) {
      for (const hit of text.matchAll(m.re)) {
        pushHard({
          section: "Your Profile",
          rule: "profile-drift",
          message: `Report uses "${m.label}" framing but the chart's profile is "${profileStr}", which does not contain a 6.`,
          detected: text.slice(Math.max(0, (hit.index ?? 0) - 40), Math.min(text.length, (hit.index ?? 0) + 140)).replace(/\n/g, " "),
          expected: `profile = ${profileStr}`,
        });
      }
    }
  }

  // 7a-2. Cross-profile drift: the report must not describe the reader's
  // life via a profile that isn't the chart's actual profile. Catches:
  //   "The 1/3 profile receives a different experience of this Cross"
  //   "Unlike a 5/1 chart"
  //   "Compared to a 6/2"
  //   "your 1/3 mechanics"
  // Allowed contrastive forms ("unlike a 1/3..." used as background) are
  // skipped by the contrastive bypass below; the patterns target reader-
  // applied profile claims.
  const chartProfile = (dp.profile || "").replace(/\s*\/\s*/, "/"); // normalize "2 / 4" → "2/4"
  if (chartProfile && /^\d\/\d$/.test(chartProfile)) {
    const allProfileNumbers = ["1/3", "1/4", "2/4", "2/5", "3/5", "3/6", "4/6", "4/1", "5/1", "5/2", "6/2", "6/3"];
    const otherProfiles = allProfileNumbers.filter((p) => p !== chartProfile);
    for (const p of otherProfiles) {
      const re = new RegExp(`\\b${p.replace("/", "\\/")}\\b`, "g");
      for (const m of text.matchAll(re)) {
        const idx = m.index ?? 0;
        const beforeWindow = text.slice(Math.max(0, idx - 60), idx).toLowerCase();
        // Skip contrastive contexts.
        if (/\b(unlike|compared to|vs\.?|rather than|in contrast to|not a|not the|not\b|whereas a|whereas the|differs from|distinct from)\b/.test(beforeWindow)) continue;
        if (/\b(more|less)\b[^.]{1,80}\bthan\b/.test(beforeWindow)) continue;
        // Skip teaching contexts: "the X/Y profile (in general)", "a X/Y chart", "for a X/Y"
        if (/\b(a chart with|when a chart|if a chart|in a|in an|for a|for an|a person with|the\s+\d\/\d\s+profile\s+\(in general\))\s+(?:a|an)?\s*$/i.test(beforeWindow)) continue;
        factsChecked++;
        pushHard({
          section: "(any)",
          rule: "cross-profile-drift",
          message: `Report references profile "${p}" in a way that implies it applies to the reader, but the chart's profile is "${chartProfile}".`,
          detected: text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + m[0].length + 80)).replace(/\n/g, " "),
          expected: chartProfile,
        });
      }
    }
  }

  // 7b. Mind's Role section: should ONLY appear when BOTH Head AND Ajna are
  // defined. If the report contains a "Mind's Role" / "The Mind" H2 or H3
  // and the chart has either center NOT defined, hard-fail.
  const mindHeaderRe = /^#{2,3}\s+(?:The\s+)?Mind(?:'s\s+Role)?\b[^\n]*$/im;
  const mindHeader = text.match(mindHeaderRe);
  if (mindHeader) {
    const headDef = dp.centers.find((c) => c.canonical === "head")?.status === "defined";
    const ajnaDef = dp.centers.find((c) => c.canonical === "ajna")?.status === "defined";
    if (!(headDef && ajnaDef)) {
      pushHard({
        section: "(any)",
        rule: "mind-role-improper",
        message: `"Mind's Role" / "The Mind" section appears but the chart does not have BOTH Head and Ajna defined (Head: ${dp.centers.find((c) => c.canonical === "head")?.status}, Ajna: ${dp.centers.find((c) => c.canonical === "ajna")?.status}). Remove this section entirely.`,
        detected: mindHeader[0],
        expected: `omit when Head or Ajna is not defined`,
      });
    }
  }

  // 7c. POV drift: the client's name should appear ONLY in the front matter
  // (top of the report). Anywhere in the body, the report should address
  // the reader as "you" / "your". The front matter is roughly the first 500
  // characters (title, name, dates, place). Mentions past that are POV slips.
  const clientName = (dp.client?.name ?? "").trim();
  if (clientName) {
    const firstName = clientName.split(/\s+/)[0];
    if (firstName && firstName.length >= 2) {
      const frontMatterCutoff = 600;
      const body = text.slice(frontMatterCutoff);
      const re = new RegExp(`\\b${firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      for (const m of body.matchAll(re)) {
        const absoluteIdx = (m.index ?? 0) + frontMatterCutoff;
        pushHard({
          section: "(any)",
          rule: "pov-name-in-body",
          message: `Client first name "${firstName}" appears in the report body. Use second person ("you" / "your"); reserve the name for the front matter.`,
          detected: text.slice(Math.max(0, absoluteIdx - 40), Math.min(text.length, absoluteIdx + 120)).replace(/\n/g, " "),
          expected: `(second-person "you")`,
        });
      }
    }
  }

  // 8. Center-status prose drift: anywhere in the report, claims like "your
  // defined Ajna" / "your open Throat" / "your undefined Heart" that
  // contradict the Data Pass. Hard fail — the model is restating a fact it
  // shouldn't be guessing at.
  const centerStatusByCanonical = new Map<string, "defined" | "undefined" | "open">();
  for (const c of dp.centers) centerStatusByCanonical.set(c.canonical, c.status);
  const centerPhraseTokens: { centerLabel: string; canonical: string }[] = [
    { centerLabel: "Head",         canonical: "head" },
    { centerLabel: "Ajna",         canonical: "ajna" },
    { centerLabel: "Throat",       canonical: "throat" },
    { centerLabel: "G",            canonical: "g" },           // tricky — single letter; we restrict to "G Center" matches
    { centerLabel: "G Center",     canonical: "g" },
    { centerLabel: "Heart",        canonical: "heart" },
    { centerLabel: "Ego",          canonical: "heart" },
    { centerLabel: "Will",         canonical: "heart" },
    { centerLabel: "Solar Plexus", canonical: "solar plexus" },
    { centerLabel: "Sacral",       canonical: "sacral" },
    { centerLabel: "Spleen",       canonical: "spleen" },
    { centerLabel: "Splenic",      canonical: "spleen" },
    { centerLabel: "Root",         canonical: "root" },
  ];
  const STATUS_WORDS = ["defined", "undefined", "open"] as const;
  for (const c of centerPhraseTokens) {
    for (const claimed of STATUS_WORDS) {
      // Only flag UNAMBIGUOUS reader-references. Patterns like "someone whose
      // Ajna is defined" or "an Ajna defined by Color 3" describe others, not
      // the reader, and must not trigger a hard fail. Require an explicit
      // "your <center>" or "your <center> is <status>" framing.
      const before = new RegExp(`\\byour\\s+${claimed}\\s+${c.centerLabel}\\b`, "gi");
      const after = new RegExp(`\\byour\\s+${c.centerLabel}\\s+(?:center\\s+)?is\\s+${claimed}\\b`, "gi");
      for (const re of [before, after]) {
        for (const m of text.matchAll(re)) {
          const expected = centerStatusByCanonical.get(c.canonical);
          if (!expected) continue;
          if (expected === claimed) continue;
          pushHard({
            section: "(any)",
            rule: "center-status-prose-drift",
            message: `Report calls the ${c.centerLabel} "${claimed}" but the chart's ${c.centerLabel} is ${expected}.`,
            detected: text.slice(Math.max(0, (m.index ?? 0) - 40), Math.min(text.length, (m.index ?? 0) + 100)).replace(/\n/g, " "),
            expected: `${c.centerLabel} is ${expected}`,
          });
        }
      }
    }
  }

  // 9. Banned phrases.
  // Hard set: things Kaycee specifically called out as breaking voice or
  // misrepresenting HD entirely (rulers/slaves framing of leadership lines,
  // "kingdom"/"empires" feudal framing, leaking the engine term "Data Pass"
  // into reader-facing prose).
  // Per Kaycee, 2026-05-19: "I just don't want the reports to call people
  // slave or slave owners or talk about killing people." She also said:
  // "King, Queen, kingdom etc show up as descriptors for some gates and
  // that's fine, they are useful english words for conveying the concepts.
  // I think the report costs will skyrocket if we ban too many of those
  // words due to retries."
  //
  // So the hard-banned set is MINIMAL — only the specific framings she
  // doesn't want, plus the engine-vocabulary leaks. Everything else
  // (king/queen/kingdom/realm/throne/monarch/empire/tribal/master/etc.) is
  // allowed, on the trust she'll flag specific slips during review and we
  // can tighten as concrete patterns emerge.
  const hardBannedPhrases = [
    // Slavery framing applied to people — Kaycee's explicit concern.
    "slaves",
    "slave",
    "slavery",
    "enslaved",
    "enslave",
    "slave owner",
    "slave owners",
    // Violent framing — "talk about killing people" / Ra's apocalyptic
    // genocide / holocaust references.
    "killing people",
    "genocide",
    "holocaust",
    // Engine vocabulary that leaks the build pipeline.
    "Data Pass",
    "data pass",
    // "BodyGraph" is Ra's commercial branding name for the chart image.
    "BodyGraph",
    "Body Graph",
    "Bodygraph",
  ];

  // Meta-process sentences: the model leaks structural commentary
  // about how the report is built ("before the four subsections," "here
  // is a quick orientation," "end of this section of the report," etc.).
  // Pure process-talk, never useful to the reader. Hard fail so retry
  // rewrites without it.
  const metaProcessPatterns = [
    { re: /\bbefore (?:the |we (?:dive |move ))(?:four|next|following|move on|dive in|begin)\b[^.]{0,40}(?:subsection|section|h2)/gi, label: "before-the-N-subsections" },
    { re: /\bhere(?:'s| is)\s+(?:a\s+)?(?:quick\s+)?(?:orientation|overview|preview)\s+(?:to|of)\s+(?:what\s+each|the\s+\w+\s+)/gi, label: "quick-orientation-meta" },
    { re: /\bwhat each variable tracks\b/gi, label: "what-each-variable-tracks" },
    { re: /\bbefore we dive in\b/gi, label: "before-we-dive-in" },
    // Paul v1 introduced "*End of this section of the report.*" as a
    // section terminator. The model is narrating the report's own
    // structure to the reader, which breaks flow.
    { re: /\bend of (?:this section|section|the section|this part)(?:\s+of\s+(?:the\s+)?report)?\b/gi, label: "end-of-section-marker" },
    { re: /\bend of (?:variables|profile|type|strategy|authority|centers|channels|definition|timeline|cross|themes|gifts)\s*(?:section)?\b/gi, label: "end-of-named-section-marker" },
    { re: /^\s*\*?\s*end\s+of\s+(?:the\s+)?report\s*\*?\s*$/gim, label: "end-of-report-marker" },
  ];
  for (const p of metaProcessPatterns) {
    for (const m of text.matchAll(p.re)) {
      const idx = m.index ?? 0;
      pushHard({
        section: "(any)",
        rule: "meta-process-sentence",
        message: `Meta-process sentence "${m[0]}" leaks structural commentary about the report's construction. The reader should never see "subsections," "quick orientation," "what each variable tracks," or similar process-talk. Restate without the meta layer or just delete the sentence.`,
        detected: text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + m[0].length + 80)).replace(/\n/g, " "),
        expected: "(omit meta-process framing)",
      });
    }
  }
  for (const phrase of hardBannedPhrases) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    const matches = [...text.matchAll(re)];
    for (const m of matches) {
      pushHard({
        section: "(any)",
        rule: "banned-phrase-hard",
        message: `Banned phrase "${m[0]}" appears in report.`,
        detected: text.slice(Math.max(0, (m.index ?? 0) - 40), Math.min(text.length, (m.index ?? 0) + 100)).replace(/\n/g, " "),
        expected: `(omit "${phrase}")`,
      });
    }
  }

  // 9b. Planetary-tone hard rules.
  //
  // Planetary Overview v3 exposed two systematic leakages from the source
  // library into the prose. Both violate hard rules in the master prompt
  // (the "no fixing-planet names" rule, the "no exaltation/detriment on
  // neutral placements" rule, the "no inline source citations" rule, and the
  // "no Ra by name in body prose" rule). When the model reaches for library
  // scaffolding instead of writing in voice, these patterns surface. Hard
  // fail so the retry loop forces a rewrite.
  //
  // Tier-agnostic on purpose: Foundation and Planetary both forbid these
  // patterns. The Foundation Report is generally tighter on voice, but if
  // the model ever leaks them there too, the rules catch it.
  const TONE_PLANETS = "(?:Sun|Earth|Moon|Mercury|Venus|Mars|Jupiter|Saturn|Uranus|Neptune|Pluto|Chiron)";
  const planetaryToneHardPatterns: { re: RegExp; label: string; msg: string }[] = [
    // Fixing-planet leakage: planet named as the exalter/detrimenter.
    // The master prompt says: "say 'exalted' or 'in detriment' alone, never
    // with the planet name."
    {
      re: new RegExp(`\\b${TONE_PLANETS}\\b\\s+(?:is|sits|would\\s+be|would|was|are)\\s+(?:in\\s+)?(?:exalted|in\\s+detriment|the\\s+exalted|the\\s+detriment)\\b`, "g"),
      label: "fixing-planet-named",
      msg: "Names a fixing planet in an exaltation/detriment claim ('Mars is exalted', 'Venus is in detriment'). Hard rule forbids naming any fixing planet, even when the placement IS exalted or in detriment. Say 'this placement is exalted' or 'in detriment' without naming any planet, then stop.",
    },
    {
      // Match "[Planet] exalted" regardless of the following word — symmetric
      // with the "[Planet] in detriment" rule below. The earlier "here/in/at/
      // would" restriction let "(Pluto exalted)" and "…truth, Venus exalted."
      // slip through (Russell v1). "[Planet] is exalted" is caught separately
      // above; "[Planet]'s exalted" (possessive) won't match because the
      // apostrophe breaks the \s+ join.
      re: new RegExp(`\\b(?:The\\s+)?${TONE_PLANETS}\\s+exalted\\b`, "g"),
      label: "fixing-planet-named",
      msg: "Phrase '[Planet] exalted' names a fixing planet. Hard rule: say 'exalted' alone, never with the planet name.",
    },
    {
      re: new RegExp(`\\b${TONE_PLANETS}\\s+would\\s+(?:exalt|provide|bring|name|add|harden|fix)\\b`, "g"),
      label: "fixing-planet-named",
      msg: "Phrase '[Planet] would exalt/provide/bring/...' both names a fixing planet AND discusses a fixing the chart does not carry. Both violate hard rules. Drop the sentence and write the placement's own mechanic.",
    },
    {
      re: new RegExp(`\\b${TONE_PLANETS}\\s+in\\s+detriment\\b`, "g"),
      label: "fixing-planet-named",
      msg: "Phrase '[Planet] in detriment' names a fixing planet. Hard rule: say 'in detriment' alone, never with the planet name.",
    },
    {
      re: new RegExp(`\\b(?:the\\s+)?(?:exaltation|detriment)\\s*,\\s*${TONE_PLANETS}\\s*,`, "g"),
      label: "fixing-planet-named",
      msg: "Apposition 'the exaltation/detriment, [Planet],' names a fixing planet. Hard rule forbids.",
    },
    {
      re: new RegExp(`\\b${TONE_PLANETS}\\s+(?:fixes|fix)\\s+(?:this|the)\\s+line\\b`, "g"),
      label: "fixing-planet-named",
      msg: "Phrase '[Planet] fixes this line' names a fixing planet. Hard rule forbids.",
    },
    {
      re: new RegExp(`\\b${TONE_PLANETS}\\s+is\\s+(?:the\\s+)?(?:exalted|detriment)\\s+planet\\b`, "g"),
      label: "fixing-planet-named",
      msg: "Phrase '[Planet] is the exalted/detriment planet' names a fixing planet. Hard rule forbids.",
    },
    // Hedge bridges that justify discussing exaltation/detriment on a
    // neutral placement. The master prompt's "exaltation/detriment energy
    // ONLY when actually present" rule says to drop the entire construction.
    {
      re: /\bactivation\s+(?:this|the)\s+(?:chart|position|placement)\s+does\s+not\s+carry\b/gi,
      label: "neutral-placement-exaltation-hedge",
      msg: "Hedge 'an activation this chart/position does not carry' indicates the prose is discussing a fixing the placement lacks. Hard rule: drop the entire construction, write the placement's own mechanic instead.",
    },
    {
      re: /\bwhich\s+(?:the\s+chart|this\s+activation|this\s+chart)\s+does\s+not\s+carry\b/gi,
      label: "neutral-placement-exaltation-hedge",
      msg: "Hedge 'which the chart does not carry' indicates the prose is discussing fixings the chart lacks. Drop the sentence.",
    },
    {
      re: /\bbut\s+the\s+structural\s+(?:theme|reading|pattern)\s+(?:remains|holds|is\s+unmistakable)\b/gi,
      label: "neutral-placement-exaltation-hedge",
      msg: "Bridge 'but the structural theme/reading/pattern remains/holds' is the second half of the neutral-placement exaltation hedge. Drop the entire construction; write the placement's own mechanic instead.",
    },
    {
      re: /\bcarries\s+this\s+activation\s+only\s+at\s+the\s+structural\s+level\b/gi,
      label: "neutral-placement-exaltation-hedge",
      msg: "Hedge 'carries this activation only at the structural level' is fixing-planet scaffolding. Drop the construction.",
    },
    // Inline source citations. The master prompt forbids naming the library
    // or any specific source ('the source material', 'the Rave I'Ching',
    // 'Edinburgh', etc.) in body prose.
    {
      re: /\bthe\s+source\s+material\b/gi,
      label: "inline-source-citation",
      msg: "Phrase 'the source material' names the library in body prose. Hard rule forbids inline source citations. State the claim directly in the report's voice.",
    },
    {
      re: /\bin\s+the\s+source\s+material(?:'s|s'?)?\s+\w+\b/gi,
      label: "inline-source-citation",
      msg: "Phrase 'in the source material's framing/words/etc.' names the library in body prose. Drop the attribution.",
    },
    {
      re: /\b(?:the\s+)?(?:Rave\s+I'?Ching|Line\s+Companion|cached\s+library|cached\s+material|Way\s+of\s+the\s+Mind|Understanding\s+the\s+Planets|Lifecycles)\b/gi,
      label: "inline-source-citation",
      msg: "Names a specific source by title. Hard rule forbids inline source citations.",
    },
    {
      re: /\bEdinburgh\b/g,
      label: "inline-source-citation",
      msg: "Names 'Edinburgh' (the lecture series) as a source. Hard rule forbids inline source citations.",
    },
    // Ra-by-name-in-body. The patterns require Ra to be followed by an
    // attribution verb, so an authorized "Ra Uru Hu" front-matter mention
    // (if Kaycee ever adds one) does not trip the rule — "Ra Uru" is not a
    // verb-following pattern. "Ra rendered" / "Ra was clear" / "Ra noted"
    // are caught.
    {
      re: /\bRa\s+(?:was|is|noted|named|said|wrote|saw|put\s+it|observed|emphasi[sz]ed|made\s+(?:it\s+)?clear|made\s+the\s+point|was\s+direct|was\s+clear|was\s+explicit|rendered|transmitted|taught|once\s+said|called|knew|understood|was\s+making)\b/g,
      label: "ra-by-name-in-body",
      msg: "Names 'Ra' with an attribution verb. Hard rule forbids naming Ra in body prose; state the claim directly in the report's voice.",
    },
    {
      re: /\b(?:as|per)\s+Ra\b(?!\s+Uru\b)/g,
      label: "ra-by-name-in-body",
      msg: "Phrase 'as Ra' / 'per Ra' attributes a claim to Ra by name. Hard rule forbids.",
    },
  ];
  for (const p of planetaryToneHardPatterns) {
    for (const m of text.matchAll(p.re)) {
      const idx = m.index ?? 0;
      pushHard({
        section: "(any)",
        rule: p.label,
        message: p.msg,
        detected: text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + m[0].length + 80)).replace(/\n/g, " "),
        expected: "(omit fixing-planet / source-citation scaffolding)",
      });
    }
  }

  // 9c. "Section-as-reading" usage — calling a section of THIS report "a
  // reading." Per Kaycee (v5 review): "we do need to not refer to the
  // sections in the report as 'readings'." The verb "read" stays legal,
  // and "reading window" (a timing concept around returns) stays legal;
  // only the specific section-label usage is hard-failed.
  const readingPatterns: { re: RegExp; msg: string }[] = [
    { re: /\b(?:its|their|this)\s+own\s+reading\b/gi, msg: `Phrase 'its/their/this own reading' labels a section as a "reading", which Kaycee's spec forbids. Rewrite without the reading-as-section framing.` },
    { re: /\b(?:not\s+a\s+reading\s+best|a\s+reading\s+best\s+taken|the\s+reading\s+of\s+this\s+section)\b/gi, msg: `Calling a section "a reading" is forbidden. Rewrite as "not best understood in the moment" or similar.` },
    { re: /\breceives?\s+(?:its|their)\s+(?:own\s+)?reading\b/gi, msg: `"receives its own reading" labels a section as a reading; rewrite as "is described" / "is covered" / similar.` },
  ];
  for (const p of readingPatterns) {
    for (const m of text.matchAll(p.re)) {
      const idx = m.index ?? 0;
      pushHard({
        section: "(any)",
        rule: "section-as-reading",
        message: p.msg,
        detected: text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + m[0].length + 80)).replace(/\n/g, " "),
        expected: `(omit "reading" as a section label)`,
      });
    }
  }

  // 9d. Operational instructions leaking into client-facing prose.
  // Phrases like "Chart image goes here" / "[image]" / "(see image)" are
  // editorial placeholders that should never reach a reader. Hard fail.
  const operationalInstructionPatterns: { re: RegExp; msg: string }[] = [
    { re: /\b(?:chart|mandala|hexagram|image)\s+(?:image\s+)?goes\s+here\b/gi, msg: `Operational placeholder "<X> goes here" leaked into prose; the renderer handles all image placement.` },
    { re: /\b(?:insert|see)\s+(?:image|mandala|chart|hexagram|figure)\b/gi, msg: `Operational instruction "insert/see <image>" leaked into prose.` },
    { re: /\[(?:image|mandala|chart|hexagram|figure)\]/gi, msg: `Bracketed placeholder like [image] leaked into prose.` },
    { re: /\bimage\s+to\s+(?:follow|come)\b/gi, msg: `Operational placeholder "image to follow/come" leaked into prose.` },
  ];
  for (const p of operationalInstructionPatterns) {
    for (const m of text.matchAll(p.re)) {
      const idx = m.index ?? 0;
      pushHard({
        section: "(any)",
        rule: "operational-instruction-leak",
        message: p.msg,
        detected: text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + m[0].length + 80)).replace(/\n/g, " "),
        expected: "(omit production-side placeholder; let the renderer handle images)",
      });
    }
  }

  // 9e. Common misspellings the LLM occasionally produces. Soft warnings so
  // they don't trigger a retry — they're rare and a retry would be wasteful
  // — but they surface in the validation summary so the operator can fix
  // them in-place. Add new patterns here when concrete examples surface.
  const commonMisspellings: { wrong: RegExp; right: string }[] = [
    { wrong: /\bcenterd\b/gi, right: "centered" },
    { wrong: /\brecieve(?:d|s|r|rs|ing)?\b/gi, right: "receive" },
    { wrong: /\bseperate(?:d|s|ly|ing)?\b/gi, right: "separate" },
    { wrong: /\boccured\b/gi, right: "occurred" },
    { wrong: /\bdefinately\b/gi, right: "definitely" },
    { wrong: /\baccomodat(?:e|ed|es|ing|ion)\b/gi, right: "accommodate" },
    { wrong: /\bmaintainence\b/gi, right: "maintenance" },
    { wrong: /\bnoticable\b/gi, right: "noticeable" },
    { wrong: /\bconsious(?:ly|ness)?\b/gi, right: "conscious" },
    { wrong: /\boccassion(?:al(?:ly)?)?\b/gi, right: "occasion" },
  ];
  for (const m of commonMisspellings) {
    for (const hit of text.matchAll(m.wrong)) {
      const idx = hit.index ?? 0;
      pushSoft({
        section: "(any)",
        rule: "common-misspelling",
        message: `Likely misspelling "${hit[0]}" — should be "${m.right}".`,
        detected: text.slice(Math.max(0, idx - 30), Math.min(text.length, idx + hit[0].length + 30)).replace(/\n/g, " "),
        expected: m.right,
      });
    }
  }

  // Soft set: the stale openers and clichés we've been stripping all along.
  const bannedPhrases = [
    "the source material is direct",
    "it's worth noting that",
    "it is worth noting that",
    "it is important to understand",
    "what this means is",
    "either just passed or",
    "still in motion",
    "still reverberating",
    // Ra-name-drop opener — overused as a "say something is canonical" hedge.
    "ra was direct about this",
    "ra was clear about this",
    "ra was explicit about this",
    "as ra put it",
    "ra named it",
    // Fluff that requires more context to mean anything and is usually padding.
    "most centers are one or the other",
  ];
  for (const phrase of bannedPhrases) {
    const re = new RegExp(phrase, "i");
    const m = text.match(re);
    if (m) {
      pushSoft({
        section: "(any)",
        rule: "banned-phrase",
        message: `Banned phrase "${phrase}" appears in report.`,
        detected: text.slice(Math.max(0, (m.index ?? 0) - 30), Math.min(text.length, (m.index ?? 0) + 100)),
      });
    }
  }

  // 7. Em dashes (should be 0 after post-process; flag if any survive).
  const emDashCount = (text.match(/—/g) ?? []).length;
  if (emDashCount > 0) {
    pushSoft({
      section: "(any)",
      rule: "em-dash",
      message: `${emDashCount} em dash(es) survived post-process strip.`,
      detected: "(see report)",
    });
  }

  // 8. Lineage statement should NOT appear in the report's tail.
  const tail = text.slice(-2000).toLowerCase();
  if (tail.includes("organized from a private archive") || tail.includes("ra uru hu's original lectures, interviews, and writings, assembled")) {
    pushSoft({
      section: "Closing",
      rule: "closing-lineage-statement-present",
      message: `Closing lineage statement appears at end of report; this closer was removed per Kaycee's spec.`,
      detected: tail.slice(-300),
    });
  }

  // 9. Operator name (Kaycee) appearing in the report body. Skipped when
  // the client IS Kaycee (her own Foundation, Planetary, or Quickstart) —
  // in that case "Kaycee" is the client name, legitimately in the front
  // matter, and the POV-name-in-body rule above already enforces it not
  // appearing in the body. Also apply the front-matter cutoff so the
  // matter title block ("Kaycee Vandenberg" under "# Human Design
  // Foundation Report") doesn't trip the rule on, say, Tennyson's report
  // accidentally referencing her.
  const clientIsKaycee = /\bKaycee\b/i.test(dp.client?.name ?? "");
  if (!clientIsKaycee) {
    const bodyStart = 600; // same cutoff as POV-name-in-body
    const body = text.slice(bodyStart);
    const kayceeCount = (body.match(/\bKaycee\b/g) ?? []).length;
    if (kayceeCount > 0) {
      pushSoft({
        section: "(any)",
        rule: "operator-name-in-report",
        message: `Operator name "Kaycee" appears ${kayceeCount} time(s) in the report body. Reports should not name the analyst.`,
        detected: "(see report)",
      });
    }
  }

  const hardCount = issues.filter((i) => i.severity === "hard").length;
  const softCount = issues.filter((i) => i.severity === "soft").length;
  const passed = hardCount === 0;

  let summary = `${factsMatched}/${factsChecked} fields matched.`;
  if (hardCount > 0) summary += ` ${hardCount} HARD failure${hardCount === 1 ? "" : "s"}. REJECT.`;
  else if (softCount > 0) summary += ` ${softCount} soft warning${softCount === 1 ? "" : "s"}. APPROVE with edits.`;
  else summary += " APPROVE.";

  return { passed, issues, hardCount, softCount, factsChecked, factsMatched, summary };
}

// Convenience: render the validation result as a Markdown block (for logs,
// PR comments, the operator-facing summary).
export function renderValidationMarkdown(v: ValidationResult): string {
  const lines: string[] = [];
  lines.push(`# Report Validation\n`);
  lines.push(`**${v.summary}**\n`);
  if (v.issues.length === 0) {
    lines.push("No issues found.\n");
    return lines.join("\n");
  }
  const hard = v.issues.filter((i) => i.severity === "hard");
  const soft = v.issues.filter((i) => i.severity === "soft");
  if (hard.length) {
    lines.push(`## Hard failures (${hard.length})\n`);
    for (const i of hard) {
      lines.push(`- **${i.rule}** in *${i.section}*: ${i.message}`);
      if (i.expected) lines.push(`  Expected: \`${i.expected}\``);
      lines.push(`  Detected: \`${i.detected.replace(/\n/g, " ").slice(0, 200)}\`\n`);
    }
  }
  if (soft.length) {
    lines.push(`## Soft warnings (${soft.length})\n`);
    for (const i of soft) {
      lines.push(`- **${i.rule}** in *${i.section}*: ${i.message}`);
      if (i.expected) lines.push(`  Expected: \`${i.expected}\``);
      lines.push(`  Detected: \`${i.detected.replace(/\n/g, " ").slice(0, 200)}\`\n`);
    }
  }
  return lines.join("\n");
}
