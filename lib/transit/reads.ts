// Reading Kaycee's daily transit report off disk.
//
// One report per day, written each morning, holding a section per client. This
// parses one person's section out of it: the prose she wrote and the channel
// completions behind it.
//
// Lives here rather than inside the chart builder because two things need it
// now: the chart, which bakes today's read as a fallback, and the push that
// files every read in Supabase so a chart can fetch the current one without
// being rebuilt. Two copies of a parser this fiddly would drift within a week.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CLIENTS } from "@/scripts/client-roster";

export const TRANSITS_DIR = join(process.env.HOME ?? "", "Desktop", "HD Reports", "Transits");

export interface DayRead {
  date: string;
  writtenAt: string;              // the report's own generated_at, ISO
  paragraph: string;
  completions: {
    planet: string; transitGate: number; natalGate: number;
    channel: string; channelName: string; bridges: boolean; center: string; duration: string;
  }[];
}

/** Every archived read for this client, keyed by date. Each morning's run adds
 *  one. */
export function loadAllReads(clientName: string, clientId?: string): Record<string, DayRead> {
  const dir = TRANSITS_DIR;
  if (!existsSync(dir)) return {};
  const out: Record<string, DayRead> = {};
  for (const f of readdirSync(dir)) {
    const m = /^(\d{4}-\d{2}-\d{2}) - Daily Transit Report\.md$/.exec(f);
    if (!m) continue;
    const r = loadDayRead(clientName, m[1], clientId);
    if (r) out[m[1]] = r;
  }
  return out;
}

/** A report already on disk was written under whatever the roster called that
 *  person that morning, so renaming someone orphans every read they have.
 *
 *  Resolve it against the report itself rather than guessing. Headings that
 *  match a roster name exactly are spoken for. A leftover heading can then only
 *  belong to someone whose first name it is AND who has no heading of their own
 *  in that same report, and only when exactly one person fits: "Sarah" in a
 *  report that already names Sarah Marie must be the other Sarah, but "Sarah"
 *  in a report naming neither is left unmatched rather than handed to whichever
 *  one sorts first. */
export function headingByRename(
  heads: RegExpMatchArray[], clientName: string,
): RegExpMatchArray | undefined {
  const first = clientName.split(" ")[0];
  if (!first || first === clientName) return undefined;
  const present = new Set(heads.map((h) => h[1].trim()));
  if (!present.has(first)) return undefined;

  const roster = Object.values(CLIENTS).map((c) => c.name);
  // anyone already named outright in this report is answered for
  const claimants = roster.filter((n) => n.split(" ")[0] === first && !present.has(n));
  if (claimants.length !== 1 || claimants[0] !== clientName) return undefined;
  return heads.find((h) => h[1].trim() === first);
}

export function loadDayRead(clientName: string, date: string, clientId?: string): DayRead | null {
  const path = join(TRANSITS_DIR, `${date} - Daily Transit Report.md`);
  if (!existsSync(path)) return null;
  const md = readFileSync(path, "utf8");
  const writtenAt = /generated_at:\s*(\S+)/.exec(md)?.[1] ?? "";

  // "### 3. Bryan Rodabough · Split Definition (simple) (impact 74.25)"
  const heads = [...md.matchAll(/^### \d+\.\s+(.+?)\s+·\s+.*$/gm)];
  // The permanent id first, since it survives a rename. Falling back to the
  // name for reports written before ids existed, and to the first-name rule for
  // reports written before a rename.
  const byId = clientId
    ? heads.find((h) => md.slice(h.index!, h.index! + 400).includes(`<!-- client: ${clientId} -->`))
    : undefined;
  const mine = byId ?? heads.find((h) => h[1].trim() === clientName) ?? headingByRename(heads, clientName);
  if (!mine) return null;
  const start = mine.index! + mine[0].length;
  // Stop at the next heading of ANY level, not merely the next person. The last
  // person in the ranking has nobody after them, so bounding on people alone ran
  // their section to the end of the file and hung the report's collective
  // tables — active sky, transit formations, the day's gate changes — on
  // whoever happened to rank last that day.
  const after = /^#{1,6} /gm;
  after.lastIndex = start;
  const next = after.exec(md);
  const body = md.slice(start, next ? next.index : undefined);

  const lines = body.split("\n");
  const paragraph = lines.filter((l) => l.trim() && !l.trim().startsWith("-")).join(" ").trim();

  // "- Sun in 59 (Dispersion) completes 6-59 Mating with natal 6 (Conflict); bridges their split; sacral center [days]"
  const completions: DayRead["completions"] = [];
  for (const l of lines) {
    const m = /^-\s+(\w[\w ]*?) in (\d+) \([^)]*\) completes (\d+-\d+) (.+?) with natal (\d+) \([^)]*\)(.*?)\[(\w+)\]/.exec(l.trim());
    if (!m) continue;
    completions.push({
      planet: m[1].trim(), transitGate: +m[2], channel: m[3], channelName: m[4].trim(),
      natalGate: +m[5], bridges: /bridges their split/.test(m[6]),
      center: (/;\s*(?:lights their open\s+)?([a-z- ]+?) center/.exec(m[6])?.[1] ?? "").trim(),
      duration: m[7],
    });
  }
  if (!paragraph) return null;
  return { date, writtenAt, paragraph, completions };
}

