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
const DEFINITION_TYPE_TERMS = [
  { canonical: "Single Definition",           pattern: /\b(?:Single Definition|Single-Definition)\b/g },
  { canonical: "Split Definition",            pattern: /\b(?:Simple Split|Wide Split|Broad Split|Split Definition)\b/g },
  { canonical: "Triple Split Definition",     pattern: /\bTriple[\s-]Split\b/g },
  { canonical: "Quadruple Split Definition",  pattern: /\bQuadruple[\s-]Split\b/g },
  { canonical: "No Definition",               pattern: /\bNo Definition\b/g },
];

// ─── Main entry ─────────────────────────────────────────────────────────────

export function validateReport(text: string, dp: DataPass): ValidationResult {
  const issues: ValidationIssue[] = [];
  let factsChecked = 0;
  let factsMatched = 0;

  const pushHard = (i: Omit<ValidationIssue, "severity">) => issues.push({ severity: "hard", ...i });
  const pushSoft = (i: Omit<ValidationIssue, "severity">) => issues.push({ severity: "soft", ...i });

  // 1. Required H1 sections must exist.
  const requiredH1 = [
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
    "Gifts, Themes, and Challenges",
  ];
  for (const h of requiredH1) {
    factsChecked++;
    if (getH1Section(text, h)) factsMatched++;
    else pushHard({
      section: h, rule: "section-missing",
      message: `Required H1 section "# ${h}" not found in report.`,
      detected: "(missing)", expected: `# ${h}`,
    });
  }

  // 2. Definition section must reference the canonical Definition label, and
  // NO other definition-type term should be used as if it applied to the
  // reader's chart anywhere else in the report.
  const expectedDefLabel = dp.split.definitionLabel; // e.g. "Split Definition"
  const definitionSection = getH1Section(text, "Your Definition");
  factsChecked++;
  if (definitionSection && definitionSection.includes(expectedDefLabel)) {
    factsMatched++;
  } else if (definitionSection) {
    pushHard({
      section: "Your Definition",
      rule: "definition-not-cited",
      message: `Definition section does not cite the canonical Definition label.`,
      detected: definitionSection.slice(0, 200),
      expected: expectedDefLabel,
    });
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
      // of words can sit between 'more/less' and 'than'.
      if (/\b(unlike|compared to|vs\.?|rather than|in contrast to|not a|not the|whereas a|whereas the|differs from|distinct from)\b/.test(beforeWindow)) continue;
      if (/\b(more|less)\b[^.]{1,80}\bthan\b/.test(beforeWindow)) continue;
      // Skip generic teaching context that explicitly says "in a {Term} design" without claiming this is one — these tend to be educational asides. Heuristic: "in a Quadruple Split design" is teaching; "your Quadruple Split" or "the Quadruple Split finds" is drift.
      // We DO want to catch: "this Quadruple Split", "your Quadruple Split", "the Quadruple Split finds", "for the Quadruple Split", etc.

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

  // 3. Centers section must include all 9 centers with the correct status.
  const centersSection = getH1Section(text, "Your Centers");
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
  const timelineSection = getH1Section(text, "Your Timeline");
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
  const channelsSection = getH1Section(text, "Your Channels");
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

  // 6. Banned phrases (soft fail).
  const bannedPhrases = [
    "the source material is direct",
    "it's worth noting that",
    "it is worth noting that",
    "it is important to understand",
    "what this means is",
    "either just passed or",
    "still in motion",
    "still reverberating",
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

  // 9. Operator name (Kaycee) appearing in the report body.
  const kayceeCount = (text.match(/\bKaycee\b/g) ?? []).length;
  if (kayceeCount > 0) {
    pushSoft({
      section: "(any)",
      rule: "operator-name-in-report",
      message: `Operator name "Kaycee" appears ${kayceeCount} time(s) in the report. Reports should not name the analyst.`,
      detected: "(see report)",
    });
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
