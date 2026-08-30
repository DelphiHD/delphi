import type { DataPass } from "@/lib/chart/datapass";
import type { InvokeResult } from "@/lib/llm/core";
import {
  scanFixationMentions,
  validateReport,
  type ReportTier,
  type ValidationIssue,
  type ValidationResult,
} from "@/lib/report/validate";

// The final pass.
//
// The per-section retry loop in each report builder validates one chapter at a
// time and retries only what that chapter newly broke. That works for local
// failures and cannot work for report-wide ones. Two blind spots, both real:
//
//   1. A budget rule (fixation-over-mentioned: at most one mention per fixing)
//      is never broken by any single chapter. Each adds two or three mentions,
//      all defensible on their own, and only the total crosses the line.
//   2. An issue is identified by the sentence that tripped it. Once the count
//      first goes over, that sentence stops being "new", so the delta filter
//      reads it as already accounted for and stops retrying while the number
//      keeps climbing. On Meelad Kharazian's Foundation it fired once and then
//      went quiet from ten mentions to twenty-three.
//
// So this runs after the whole report is assembled: validate the finished
// thing, work out which chapter carries each surviving hard failure, and send
// those chapters back with the report-wide context the per-section loop never
// had. Kaycee, 2026-08-30: two passes, then publish and flag, so a report can
// never sit in a loop.
export const MAX_FINAL_PASSES = 2;

export interface FinalPassSection {
  name: string;
  text: string;
}

export interface FinalPassArgs {
  sections: FinalPassSection[];
  dataPass: DataPass;
  tier: ReportTier;
  /** Regenerate one chapter in place. Index is into `sections`. */
  regenerate: (index: number, nudge: string) => Promise<{ text: string; result: InvokeResult }>;
  /**
   * How the chapters become the report that gets validated. The Planetary
   * reorders and normalises its chapters before validation, so the final pass
   * has to judge the same text the validator will judge, not a plain join.
   */
  assemble?: (sections: FinalPassSection[]) => string;
  maxPasses?: number;
}

export interface FinalPassResult {
  sections: FinalPassSection[];
  validation: ValidationResult;
  passes: number;
  regenerated: string[];
  costCents: number;
  usage: InvokeResult["usage"];
  log: string[];
}

const emptyUsage = (): InvokeResult["usage"] => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
});

/** Whitespace-insensitive text, so a flattened excerpt can be found in raw markdown. */
function flatten(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Which chapter or chapters carry this failure, and what each is asked to do.
 *
 * Most rules land in one place, located by the sentence the validator actually
 * caught, which is exact. A report-wide budget rule is different: it belongs to
 * every chapter that spends against it, so the correction has to be spread the
 * same way it was accumulated. Cutting only the heaviest contributor does not
 * reach the cap; on Meelad Kharazian's Foundation the Centers chapter held 16 of
 * 23 mentions, and trimming it alone still left 13 against a cap of 9.
 *
 * Returns nothing when a failure cannot be traced, and an untraceable failure is
 * left alone rather than guessed at.
 */
function carriersOf(
  issue: ValidationIssue,
  sections: FinalPassSection[],
  dp: DataPass,
): { index: number; note: string }[] {
  if (issue.rule === "fixation-over-mentioned") {
    const counts = sections.map((s) => scanFixationMentions(s.text).total);
    const total = counts.reduce((a, b) => a + b, 0);
    if (!total) return [];
    const fixings = [...(dp.personalityActivations ?? []), ...(dp.designActivations ?? [])]
      .filter((r) => r.fixingState === "Exalted" || r.fixingState === "Detriment").length;

    // Each chapter's share of the cap, proportional to what it spent. These sum
    // to the cap or just under it, so a report where every chapter meets its
    // own allowance meets the budget as a whole.
    const out: { index: number; note: string }[] = [];
    counts.forEach((mine, index) => {
      if (!mine) return;
      const allowance = Math.floor((fixings * mine) / total);
      if (mine <= allowance) return;
      out.push({
        index,
        note:
          `  - ${issue.rule}: the FINISHED report mentions exaltation or detriment ${total} times across all ` +
          `chapters, against ${fixings} actual fixings in this chart. This chapter carries ${mine} of them. ` +
          `Cut this chapter to at most ${allowance}. Keep only the mention where the fixing genuinely changes ` +
          `the reading and delete the rest outright rather than rephrasing them. This is a whole-report budget ` +
          `being shared out, so the other chapters are being trimmed too: your chapter reading well on its own ` +
          `is not the test.`,
      });
    });
    return out;
  }

  const note = `  - ${issue.rule}: ${issue.message}${issue.expected ? ` (Expected: ${issue.expected})` : ""}` +
    (issue.detected ? `\n      found in your text: "${issue.detected.slice(0, 160)}"` : "");

  // Match on collapsed whitespace. Some rules build their excerpt by flattening
  // newlines out of the report, so a raw substring search against the chapter
  // never matches and the failure looks untraceable. definition-drift was
  // escaping the final pass for exactly this reason.
  const needle = flatten(issue.detected ?? "");
  if (needle.length >= 12) {
    const probe = needle.slice(0, 60);
    const idx = sections.findIndex((s) => flatten(s.text).includes(probe));
    if (idx >= 0) return [{ index: idx, note }];
  }

  if (issue.section && issue.section !== "(any)") {
    const idx = sections.findIndex((s) => s.text.includes(`# ${issue.section}`));
    if (idx >= 0) return [{ index: idx, note }];
  }

  return [];
}

/** The report-wide context the per-section loop could not give it. */
function nudgeFrom(notes: string[]): string {
  return `\n\nIMPORTANT (final pass): the report is finished and a validator rejected it on failures that ` +
    `belong to THIS chapter. These were judged against the assembled report, not this chapter alone, so some ` +
    `of them are invisible from inside it:\n${notes.join("\n")}\n` +
    `Rewrite this chapter to clear them. Change nothing else: keep the same headings, the same placements and ` +
    `the same readings.`;
}

export async function runFinalPass(args: FinalPassArgs): Promise<FinalPassResult> {
  const maxPasses = args.maxPasses ?? MAX_FINAL_PASSES;
  const log: string[] = [];
  const regenerated: string[] = [];
  let costCents = 0;
  const usage = emptyUsage();

  const assemble = args.assemble ?? ((s: FinalPassSection[]) => s.map((x) => x.text).join("\n\n"));

  let best = args.sections.map((s) => ({ ...s }));
  let bestValidation = validateReport(assemble(best), args.dataPass, args.tier);
  let passes = 0;

  for (let pass = 1; pass <= maxPasses; pass++) {
    const hard = bestValidation.issues.filter((i) => i.severity === "hard");
    if (!hard.length) break;

    // Group the survivors by the chapter that carries them. One failure can
    // reach several chapters when it is a report-wide budget.
    const byCarrier = new Map<number, { rules: string[]; notes: string[] }>();
    for (const issue of hard) {
      const carriers = carriersOf(issue, best, args.dataPass);
      if (!carriers.length) {
        log.push(`final pass ${pass}: ${issue.rule} could not be traced to a chapter, left alone`);
        continue;
      }
      for (const c of carriers) {
        const entry = byCarrier.get(c.index) ?? { rules: [], notes: [] };
        entry.rules.push(issue.rule);
        entry.notes.push(c.note);
        byCarrier.set(c.index, entry);
      }
    }
    if (!byCarrier.size) break;

    passes = pass;
    const candidate = best.map((s) => ({ ...s }));
    for (const [idx, entry] of [...byCarrier.entries()].sort((a, b) => b[1].notes.length - a[1].notes.length)) {
      const nudge = nudgeFrom(entry.notes);
      const out = await args.regenerate(idx, nudge);
      candidate[idx] = { name: best[idx].name, text: out.text };
      costCents += out.result.cost_cents;
      usage.input_tokens += out.result.usage.input_tokens;
      usage.output_tokens += out.result.usage.output_tokens;
      usage.cache_creation_input_tokens += out.result.usage.cache_creation_input_tokens;
      usage.cache_read_input_tokens += out.result.usage.cache_read_input_tokens;
      if (!regenerated.includes(best[idx].name)) regenerated.push(best[idx].name);
      log.push(`final pass ${pass}: rewrote "${best[idx].name}" for ${[...new Set(entry.rules)].join(", ")}`);
    }

    const candidateValidation = validateReport(assemble(candidate), args.dataPass, args.tier);

    // A rewrite can trade one failure for another; v10 saw exactly that. Keep a
    // pass only when it actually reduced the count, so the final pass can never
    // hand back something worse than it was given.
    if (candidateValidation.hardCount < bestValidation.hardCount) {
      log.push(`final pass ${pass}: ${bestValidation.hardCount} hard -> ${candidateValidation.hardCount}`);
      best = candidate;
      bestValidation = candidateValidation;
    } else {
      log.push(
        `final pass ${pass}: no improvement (${bestValidation.hardCount} -> ${candidateValidation.hardCount}), ` +
        `keeping the earlier draft`,
      );
      break;
    }
  }

  return { sections: best, validation: bestValidation, passes, regenerated, costCents, usage, log };
}
