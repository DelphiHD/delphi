// Completeness self-check for a generated Daily Transit Report. The point:
// Kaycee should wake up to a GOOD report or a CLEAR flag, never a silently
// broken one. This reads the published HTML and asserts the things that have
// actually broken in the wild: missing chart images, missing baby charts,
// empty gate popups ("No source synthesis"), Chiron/Lilith leaking in, and
// stray em dashes. Used both at the end of the report run (same-morning) and
// by the 5 AM health digest (next-morning safety net).

import { existsSync, readFileSync, statSync } from "node:fs";

export interface ReportCheck { name: string; pass: boolean; detail: string; }
export interface ReportVerdict { pass: boolean; checks: ReportCheck[]; summary: string; }

export function verifyReportHtml(htmlPath: string, opts: { expectBabies?: boolean } = {}): ReportVerdict {
  const checks: ReportCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  if (!existsSync(htmlPath)) {
    return { pass: false, checks: [{ name: "Report file", pass: false, detail: "file missing" }], summary: "file missing" };
  }
  const html = readFileSync(htmlPath, "utf8");
  const kb = Math.round(statSync(htmlPath).size / 1024);
  const count = (re: RegExp) => (html.match(re) ?? []).length;

  // A complete report is ~800KB+; a gutted one (no images) is ~380KB.
  add("File size", kb >= 500, `${kb} KB`);

  // Chart images: each phase card embeds a bodygraph <svg>. Zero = the branded
  // chart API silently failed (today's bug).
  const phaseCharts = count(/class="chart phase"/g);
  add("Chart images present", phaseCharts >= 1, `${phaseCharts} phase bodygraph(s)`);

  // Baby charts (unless intentionally disabled for the run).
  if (opts.expectBabies !== false) {
    const babies = count(/class="btab/g);
    add("Baby charts present", babies >= 1, `${babies} birth-time chart(s)`);
  }

  // Gate popups: an empty data-syn shows "No source synthesis" on click.
  const emptySyn = count(/data-syn=""/g);
  const totalSyn = count(/data-syn=/g);
  add("Gate popups populated", emptySyn === 0, `${emptySyn} empty of ${totalSyn}`);

  // The 13-body rule: Chiron/Lilith must never appear.
  const rogue = /chiron|lilith/i.test(html);
  add("No Chiron/Lilith", !rogue, rogue ? "found Chiron/Lilith" : "clean");

  // House style: no em dashes anywhere.
  const emDash = count(/—/g);
  add("No em dashes", emDash === 0, emDash ? `${emDash} found` : "clean");

  const failed = checks.filter((c) => !c.pass);
  return {
    pass: failed.length === 0,
    checks,
    summary: failed.length ? failed.map((c) => `${c.name} (${c.detail})`).join(", ") : "all complete",
  };
}
