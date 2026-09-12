// A form. Fields, a button, a progress log.
//
// Everything the terminal version does, behind a page that runs on Kaycee's own
// machine: the reports, the chart and the Notion row all need the synced library
// and the roster, which live here, so the server is here too.
//
//   npx tsx scripts/client-form.ts        →  http://localhost:4321
//
// Started for real by double-clicking "Delphi Client Form" on the Desktop.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { execSync, spawn } from "node:child_process";
import { createServer, type ServerResponse } from "node:http";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync,
  readSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.CLIENT_FORM_PORT ?? 4321);
const JOBS_PATH = ".cache/client-jobs.json";
const REPORT_LOG = ".cache/reports/log.jsonl";
const ROSTER_PATH = "scripts/client-roster.ts";
const DELIVERY_LOG = ".cache/reports/deliveries.jsonl";
const FAILURE_LOG = ".cache/reports/failures.jsonl";
const CHANGE_LOG = ".cache/charts/changelog.jsonl";

const ATTEMPT_LOG = ".cache/reports/attempts.jsonl";

/**
 * The truth about time, including the attempts that never produced a report.
 *
 * The report log only gets an entry when a run succeeds, so a report that
 * failed twice and worked on the third try was recorded as however long the
 * third try took. Kaycee, 2026-08-31: "I need to know the truth of things so I
 * can measure progress." Sarah Marie's Planetary showed as 19 minutes when the
 * real cost of getting it was 53, because a 34-minute attempt was killed and
 * never written down.
 *
 * `wasted` is time spent on attempts that produced nothing.
 */
/**
 * Delivery rows for runs that never went through add-client.
 *
 * The delivery record, with its hang measurement, is written by add-client.ts.
 * Every roster batch since 2026-08-27 was run through generate-report.ts
 * directly, so the column Kaycee asked for sat empty for four days while the
 * work carried on around it. Her words, 2026-08-31: "that field keeps
 * disappearing... I expect to see the truth on the dashboard every time."
 *
 * Rather than depend on which script started a run, these rows are derived from
 * the attempt log, which every run writes to on the way out. Real delivery
 * records win where they exist; this only fills the gaps.
 */
function derivedDeliveries(): Record<string, unknown>[] {
  if (!existsSync(ATTEMPT_LOG)) return [];
  const groups = new Map<string, { client: string; slug: string; first: string; last: string;
    generating: number; hang: number; attempts: number; completed: number }>();

  for (const line of readFileSync(ATTEMPT_LOG, "utf8").split("\n").filter(Boolean)) {
    let a: Record<string, string | number>;
    try { a = JSON.parse(line); } catch { continue; }
    const at = String(a.at ?? "");
    const slug = String(a.client_slug ?? "");
    if (!at || !slug) continue;
    const key = `${slug}::${at.slice(0, 10)}`;
    const g = groups.get(key) ?? {
      client: String(a.client ?? slug), slug, first: String(a.started_at ?? at), last: at,
      generating: 0, hang: 0, attempts: 0, completed: 0,
    };
    const mins = Number(a.elapsed_sec ?? 0) / 60;
    g.attempts++;
    if (a.outcome === "completed") { g.generating += mins; g.completed++; }
    else g.hang += mins;
    if (at > g.last) g.last = at;
    if (String(a.started_at ?? at) < g.first) g.first = String(a.started_at ?? at);
    groups.set(key, g);
  }

  return [...groups.entries()].map(([key, g]) => ({
    at: g.last,
    started: g.first,
    client: g.client,
    slug: g.slug,
    id: key,
    generating_minutes: Math.round(g.generating * 10) / 10,
    hang_minutes: Math.round(g.hang * 10) / 10,
    delivered_minutes: Math.round((g.generating + g.hang) * 10) / 10,
    reports_attempted: g.attempts,
    outcome: g.completed ? "delivered" : "failed",
    derived: true,
  }));
}

function attemptTotals(day?: string): { total: number; wasted: number; failed: number; killed: number } {
  if (!existsSync(ATTEMPT_LOG)) return { total: 0, wasted: 0, failed: 0, killed: 0 };
  let total = 0, wasted = 0, failed = 0, killed = 0;
  for (const line of readFileSync(ATTEMPT_LOG, "utf8").split("\n").filter(Boolean)) {
    let a: { at?: string; elapsed_sec?: number; outcome?: string };
    try { a = JSON.parse(line); } catch { continue; }
    if (day && !String(a.at ?? "").startsWith(day)) continue;
    const mins = (a.elapsed_sec ?? 0) / 60;
    total += mins;
    if (a.outcome !== "completed") {
      wasted += mins;
      if (a.outcome === "killed") killed++; else failed++;
    }
  }
  return { total, wasted, failed, killed };
}


/**
 * Identifies this running copy of the dashboard.
 *
 * A tab that was open before a restart keeps polling and keeps receiving the new
 * data, but it is still running the old page, so anything added since simply has
 * nowhere to render and the screen never changes. That happened to Kaycee twice
 * on 2026-08-30 with the Changes tab, and both times the server was correct and
 * her screen was not. The page compares this against its own copy and reloads
 * itself when they differ, so a restart can never strand a tab again.
 */
const BUILD_ID = String(Date.now());


/**
 * What we changed in the system, from the commit history.
 *
 * Kaycee asked for the change log to cover "the programming changes we were
 * making to the chart page programming too", not only chart publishes. The
 * commit subjects in this repo are already written as plain sentences, so they
 * are shown as-is; the files each commit touched are translated into the part
 * of the system she recognises rather than paths.
 */
function systemChanges(limit = 80): { at: string; what: string; areas: string[] }[] {
  let raw = "";
  try {
    raw = execSync(
      `git log -${limit} --date=iso-strict --pretty=format:%x01%ad%x02%s --name-only`,
      { cwd: process.cwd(), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    );
  } catch {
    return [];                                   // not a checkout, or git unavailable
  }

  const AREA: [RegExp, string][] = [
    [/^scripts\/energy-flow-diagram\.ts$/, "chart page"],
    [/^scripts\/astro-wheel\.ts$|^lib\/astro\.ts$|^lib\/hd\/houses\.ts$/, "astrology view"],
    [/^scripts\/mandala/, "mandala"],
    [/^lib\/report\/|^scripts\/generate-report\.ts$/, "reports"],
    [/^lib\/transit\/|^scripts\/transit-report\.ts$/, "transits"],
    [/^scripts\/client-form\.ts$/, "dashboard"],
    [/^scripts\/client-roster\.ts$|^scripts\/add-client\.ts$|^scripts\/rename-client\.ts$/, "roster"],
    [/^scripts\/sync-notion\.ts$|^lib\/retrieval\//, "library sync"],
    [/^supabase\/migrations\//, "database"],
    [/^docs\//, "notes"],
  ];

  const out: { at: string; what: string; areas: string[] }[] = [];
  for (const block of raw.split("\u0001").slice(1)) {
    const [head, ...rest] = block.split("\n");
    const [at, subject] = head.split("\u0002");
    if (!at || !subject) continue;
    const areas: string[] = [];
    for (const f of rest.map((l) => l.trim()).filter(Boolean)) {
      for (const [re, name] of AREA) {
        if (re.test(f) && !areas.includes(name)) areas.push(name);
      }
    }
    out.push({ at, what: subject, areas });
  }
  return out;
}

const CLIENT_DIR = join(homedir(), "Desktop", "HD Reports", "Paid HD Reports");

/** What a client actually HAS, read off their folder rather than the report log.
 *  The log only knows about reports generated since it started being written, so
 *  it said Max Jones had nothing while both his reports sat in his folder, and
 *  it missed every Goodin Foundation. The folder is the deliverable; the log is
 *  only good for what a report cost and how long it took. */
function reportsOnDisk(clientName: string): { foundation: boolean; planetary: boolean } {
  const dir = join(CLIENT_DIR, clientName);
  if (!existsSync(dir)) return { foundation: false, planetary: false };
  let foundation = false, planetary = false;
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".md") && !f.endsWith(".docx")) continue;
      if (/foundation/i.test(f)) foundation = true;
      else if (/planetary/i.test(f)) planetary = true;
    }
  } catch { /* an unreadable folder is simply nothing delivered */ }
  return { foundation, planetary };
}

// Every validator rule sorted into the kind of problem it represents, so the
// failures can be worked through as classes rather than one sentence at a time.
// The category is what decides the fix: a wrong fact means the engine or the
// retrieval is wrong, a leak means the prompt is showing the reader machinery,
// a drift means the model contradicted the chart.
const RULE_CATEGORY: Record<string, string> = {
  "universal-as-personal": "Contradicts the chart",
  // The engine's own vocabulary reaching the page
  "inline-source-citation": "Source leak",
  "ra-by-name-in-body": "Source leak",
  "operational-instruction-leak": "Source leak",
  "operator-name-in-report": "Source leak",
  "meta-process-sentence": "Source leak",
  "quick-orientation-meta": "Source leak",
  "what-each-variable-tracks": "Source leak",
  "section-as-reading": "Source leak",
  "closing-lineage-statement-present": "Source leak",
  // Saying something the chart does not say
  "type-drift": "Contradicts the chart",
  "type-drift-saturation": "Contradicts the chart",
  "profile-drift": "Contradicts the chart",
  "definition-drift": "Contradicts the chart",
  "cross-profile-drift": "Contradicts the chart",
  "center-status-mismatch": "Contradicts the chart",
  "center-status-prose-drift": "Contradicts the chart",
  "line-archetype-mismatch": "Contradicts the chart",
  "return-date-mismatch": "Contradicts the chart",
  "sacral-throat-fabricated": "Contradicts the chart",
  "mind-role-improper": "Contradicts the chart",
  // Naming the fixing planet, which is a house rule
  "fixing-planet-named": "Fixing planet named",
  "neutral-placement-exaltation-hedge": "Fixing planet named",
  // Time and dates
  "distance-from-now": "Time and dates",
  "generation-date-in-prose": "Time and dates",
  // Something the report should contain and does not
  "section-missing": "Missing content",
  "center-missing": "Missing content",
  "channel-missing": "Missing content",
  "return-missing": "Missing content",
  "cross-h1-missing": "Missing content",
  "variable-header-missing": "Missing content",
  "definition-not-cited": "Missing content",
  "center-extraneous": "Missing content",
  "variable-header-altered": "Missing content",
  // Voice and house style
  "pov-name-in-body": "Voice and style",
  "banned-phrase": "Voice and style",
  "banned-phrase-hard": "Voice and style",
  "before-we-dive-in": "Voice and style",
  "em-dash": "Voice and style",
  "common-misspelling": "Voice and style",
  "rooftop": "Voice and style",
  "6-line-adjacent": "Voice and style",
  "end-of-section-marker": "Voice and style",
  "end-of-named-section-marker": "Voice and style",
  "end-of-report-marker": "Voice and style",
};
const categoryOf = (rule: string) => RULE_CATEGORY[rule] ?? "Uncategorised";

// ── the job store ───────────────────────────────────────────────────────────
// What each submitted person is doing right now, and what it cost. Kept on disk
// so a restart does not lose the record, and so the dashboard shows the last
// run even if the page was closed while it was working.

type StepName = "roster" | "foundation" | "planetary" | "chart" | "notion";
type StepState = "waiting" | "running" | "done" | "kept" | "rejected" | "failed";

interface Person {
  name: string;
  id?: string;
  steps: Record<StepName, StepState>;
  link?: string;
  note?: string;
  error?: string;
  /** The step currently being written. add-client never prints "foundation done":
   *  it prints "  foundation generating…" and the outcome arrives later on an
   *  indented Validation line, and the step is only implicitly finished when the
   *  next one starts. Without holding on to which step is open, every finished
   *  report stayed on screen as still running. */
  active?: StepName;
}
interface Job {
  id: string;
  startedAt: string;
  finishedAt?: string;
  people: Person[];
  /** The run is its own process, not a child of this server, so that restarting
   *  the dashboard does not kill reports that are half generated. On 2026-08-27
   *  a reload to pick up a dashboard change took a three-client batch with it,
   *  silently: the report already in flight finished, because those are detached
   *  too, but nothing advanced the queue and the dashboard showed "waiting"
   *  forever. Progress is read from the log rather than from a pipe, so it
   *  survives a restart on both ends. */
  pid?: number;
  log?: string;
  /** Set when the run's process is gone but its queue never reached the end. */
  died?: boolean;
}

const RUNS_DIR = ".cache/runs";
const alive = (pid?: number) => {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
};

function loadJobs(): Job[] {
  try { return existsSync(JOBS_PATH) ? JSON.parse(readFileSync(JOBS_PATH, "utf8")) : []; }
  catch { return []; }
}
function saveJobs(jobs: Job[]) {
  try {
    mkdirSync(".cache", { recursive: true });
    // keep the last 20 runs; older than that is history nobody reads
    writeFileSync(JOBS_PATH, JSON.stringify(jobs.slice(-20), null, 2));
  } catch { /* the dashboard is not worth failing a run over */ }
}

const blankSteps = (): Record<StepName, StepState> =>
  ({ roster: "waiting", foundation: "waiting", planetary: "waiting", chart: "waiting", notion: "waiting" });

/** Turn one line of add-client output into a change on the job. The lines are
 *  stable and deliberately parseable; this is the same shape the terminal
 *  shows, kept rather than thrown away when the page closes. */
/** Start a run that does not die with this server, and follow its progress by
 *  reading the log it writes. `res` is optional: without it we are picking a
 *  run back up after a restart, with nobody watching. */
/** Write one run back without trampling the others.
 *
 *  Every follower held its own copy of the whole job list from when it started,
 *  so a run begun later was wiped out by an older run's next save: it kept
 *  generating, invisibly, while the dashboard showed no sign of it. Read, patch
 *  the one entry, write. */
function persistJob(job: Job) {
  const all = loadJobs();
  const i = all.findIndex((j) => j.id === job.id);
  if (i >= 0) all[i] = job; else all.push(job);
  saveJobs(all);
}

function startRun(job: Job, jobs: Job[], args: string[], res?: ServerResponse) {
  mkdirSync(RUNS_DIR, { recursive: true });
  const logPath = join(RUNS_DIR, `${job.id}.log`);
  const fd = openSync(logPath, "a");
  const child = spawn("./node_modules/.bin/tsx", args,
    { cwd: process.cwd(), detached: true, stdio: ["ignore", fd, fd] });
  child.unref();
  closeSync(fd);
  job.pid = child.pid;
  job.log = logPath;
  persistJob(job);
  followRun(job, jobs, res);
}

function followRun(job: Job, jobs: Job[], res?: ServerResponse) {
  let offset = 0;
  let pending = "";
  const drain = () => {
    let size = 0;
    try { size = statSync(job.log!).size; } catch { return; }
    if (size <= offset) return;
    const fd = openSync(job.log!, "r");
    const buf = Buffer.alloc(size - offset);
    readSync(fd, buf, 0, buf.length, offset);
    closeSync(fd);
    offset = size;
    const text = buf.toString();
    if (res && !res.writableEnded) res.write(text);
    pending += text;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const l of lines) {
      const named = job.people.find((pp) => l.trim() === pp.name);
      if (named) { job.people = [...job.people.filter((x) => x !== named), named]; continue; }
      applyLine(job, l);
    }
    // The step in flight is a half-written line: add-client prints "  planetary "
    // and only completes it twenty minutes later with the outcome. Reading whole
    // lines alone means the one step actually happening is the one shown as
    // waiting, which is the opposite of useful. Apply the partial line too, but
    // only when it is unmistakably a step, so a fragment cannot invent a person.
    // No word boundary after the name: add-client pads the label to a fixed
    // width and "foundation" fills it exactly, so the line reads
    // "  foundationgenerating…" with nothing between them. Requiring a boundary
    // there failed on the one step this exists to catch.
    if (/^ {2}(roster|folder|foundation|planetary|chart|link|notion|cache|FAILED)/.test(pending)) {
      applyLine(job, pending);
    }
    persistJob(job);
  };
  const tick = () => {
    const running = alive(job.pid);
    drain();
    if (running) { setTimeout(tick, 1000); return; }
    // the process is gone. Anything still mid-step never got there.
    const unfinished = job.people.some((pp) =>
      Object.values(pp.steps).some((v) => v === "waiting" || v === "running"));
    job.died = unfinished;
    job.finishedAt = job.finishedAt ?? new Date().toISOString();
    persistJob(job);
    if (res && !res.writableEnded) {
      res.write(unfinished ? "\n\nThe run stopped before it finished.\n" : "\n\nAll done.\n");
      res.end();
    }
  };
  tick();
}

function applyLine(job: Job, raw: string) {
  const line = raw.replace(/\r/g, "");
  const heading = /^([A-Z][^=]{1,60})$/.exec(line.trim());
  const cur = () => job.people[job.people.length - 1];

  // a person's block opens with their name on its own line between rules
  // A person's name is printed at column zero between two rules. The summary
  // lines at the end of a run are indented and can look just like one:
  // "  Tennyson Taggart planetary" was being read as a fourth person who never
  // started, which is a worrying thing to leave on a dashboard.
  if (heading && !/^\s/.test(line)
      && !/^(added|Reports:|Nothing|Go ahead)/.test(line.trim())
      && job.people.every((p) => p.name !== line.trim())
      && /^[A-Z]/.test(line.trim()) && line.trim().split(" ").length <= 5
      && !line.includes(":")) {
    job.people.push({ name: line.trim(), steps: blankSteps() });
    return;
  }
  const idLine = /^\s{2}roster\s+.*\b(HD-\d+)\b/.exec(line);
  if (idLine && cur()) cur().id = idLine[1];
  // "            Validation: 34/34 fields matched. APPROVE." closes the open step
  const verdict = /^\s{4,}Validation:.*?\b(APPROVE|REJECT)\b/.exec(line);
  if (verdict && cur() && cur().active) {
    const p0 = cur();
    p0.steps[p0.active!] = verdict[1] === "APPROVE" ? "done" : "rejected";
    p0.active = undefined;
    return;
  }
  const m = /^\s{2}(roster|folder|foundation|planetary|chart|link|notion|cache|FAILED)\s*(.*)$/.exec(line);
  if (!m || !cur()) return;
  const [, key, rest] = m;
  const p = cur();
  if (key === "link") { p.link = rest.trim(); return; }
  if (key === "FAILED") { p.error = rest.trim(); return; }
  if (key === "folder" || key === "cache") return;
  const step = key as StepName;
  // a new step starting means the one before it got where it was going
  if (p.active && p.active !== step && p.steps[p.active] === "running") {
    p.steps[p.active] = "done";
    p.active = undefined;
  }
  if (/already written, kept/.test(rest)) p.steps[step] = "kept";
  else if (/REJECTED/.test(rest)) p.steps[step] = "rejected";
  else if (/\bok\b/.test(rest) || /row (created|updated)/.test(rest)) p.steps[step] = "done";
  else if (/generating|building|retrying/.test(rest)) { p.steps[step] = "running"; p.active = step; }
}

/** Anything generating RIGHT NOW, read from the process list rather than from a
 *  job record, so a run started from the terminal shows up exactly like one
 *  started from the form. Kaycee watched today's run show "No runs yet" for two
 *  hours because the dashboard only knew about its own submissions. */
function liveReports(): { client: string; kind: string; minutes: number; slow: boolean }[] {
  let out = "";
  try { out = execSync("ps -eo etime=,command=", { encoding: "utf8", timeout: 4000 }); }
  catch { return []; }
  const seen = new Set<string>();
  const live: { client: string; kind: string; minutes: number; slow: boolean; startedAt: string }[] = [];
  for (const line of out.split("\n")) {
    if (!line.includes("generate-report.ts")) continue;
    if (line.includes("--require")) continue;           // the tsx shim, same job
    const m = /generate-report\.ts\s+(\S+)\s+(\S+)/.exec(line);
    if (!m) continue;
    const key = m[1] + "|" + m[2];
    if (seen.has(key)) continue;
    seen.add(key);
    // etime is [[dd-]hh:]mm:ss
    const et = (line.trim().split(/\s+/)[0] ?? "").split("-").pop() ?? "";
    const parts = et.split(":").map(Number).filter((x) => !Number.isNaN(x));
    const mins = parts.length === 3 ? parts[0] * 60 + parts[1] + parts[2] / 60
      : parts.length === 2 ? parts[0] + parts[1] / 60 : 0;
    const slug = m[1];
    const src = existsSync(ROSTER_PATH) ? readFileSync(ROSTER_PATH, "utf8") : "";
    const nm = new RegExp(`slug: "${slug}",\\s*name: "([^"]+)"`).exec(src);
    live.push({
      startedAt: new Date(Date.now() - mins * 60_000).toISOString(),
      client: nm ? nm[1] : slug,
      kind: m[2] === "planetary" ? "Planetary Overview" : m[2] === "foundation" ? "Foundation" : m[2],
      minutes: Math.round(mins),
      // past the 90th percentile of every report ever written
      slow: mins > 27,
    });
  }
  return live;
}

/** Cost, words and elapsed time per report, straight from the report log. */
function reportStats() {
  if (!existsSync(REPORT_LOG)) return [] as any[];
  return readFileSync(REPORT_LOG, "utf8").split("\n").filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

const PAGE = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delphi · Add a Client</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root { --purple:#845095; --ink:#1c1a2e; --line:rgba(132,80,149,.25); --bg:#faf7fb; }
  /* Funnel and Launch: one card per number, one line per task. */
  .mgrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:12px 0 4px; }
  .mcard { background:#fff; border:1px solid var(--line); border-radius:14px; padding:12px 14px; }
  .mval { font-size:26px; font-weight:600; color:var(--purple); font-variant-numeric:tabular-nums; line-height:1.1; }
  .mlab { font-size:11px; letter-spacing:.09em; text-transform:uppercase; opacity:.6; margin-top:4px; }
  .mnote { font-size:11.5px; opacity:.6; margin-top:4px; line-height:1.45; }
  ul.plain { list-style:none; padding:0; margin:6px 0 14px; }
  ul.plain li { background:#fff; border:1px solid var(--line); border-radius:12px;
    padding:9px 12px; margin-bottom:6px; font-size:13px; line-height:1.5; }
  ul.plain li b { color:var(--purple); margin-right:6px; }
  .li-done { opacity:.55; }
  .li-done b { color:#0d9488; }
  .li-doing b { color:#f1c232; }
  .li-blocked b { color:#e06666; }
  /* the heartbeat strip: on screen whichever tab is open */
  .hb { display:flex; flex-wrap:wrap; gap:7px; margin:0 0 14px; align-items:stretch; }
  .hbcard { flex:1 1 150px; background:#fff; border:1px solid var(--line); border-left-width:4px;
    border-radius:12px; padding:8px 11px; min-width:0; }
  .hbcard.ok { border-left-color:#0d9488; }
  .hbcard.bad { border-left-color:#c0392b; background:#fff5f4; }
  .hbcard.unknown { border-left-color:#c9c4d2; }
  .hbcard.busy { border-left-color:#f1c232; }
  .hbname { font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase;
    color:var(--purple); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .hbwhat { font-size:11px; opacity:.55; line-height:1.35; margin-top:1px; }
  .hbdetail { font-size:12px; margin-top:3px; font-variant-numeric:tabular-nums; }
  .hbcard.bad .hbdetail { color:#c0392b; font-weight:600; }
  .hbhead { width:100%; font-size:11px; letter-spacing:.1em; text-transform:uppercase;
    opacity:.55; margin-bottom:-2px; display:flex; align-items:center; gap:10px; }
  .hbbtn { font: inherit; font-size:10.5px; letter-spacing:.08em; text-transform:uppercase;
    font-weight:600; padding:4px 12px; border-radius:999px; border:1px solid var(--purple);
    background:transparent; color:var(--purple); cursor:pointer; }
  .hbbtn:hover { background:var(--purple); color:#fff; }
  .hbbtn:disabled { opacity:.45; cursor:default; }
  .hbsaid { text-transform:none; letter-spacing:0; font-size:11.5px; opacity:.75; }
  /* the list of everyone */
  .tblwrap { overflow-x:auto; border:1px solid var(--line); border-radius:14px; background:#fff; }
  table.ptable { width:100%; border-collapse:collapse; font-size:13px; }
  table.ptable th, table.ptable td { text-align:left; padding:9px 13px; border-top:1px solid var(--line); white-space:nowrap; }
  table.ptable thead th { border-top:0; background:rgba(132,80,149,.06); cursor:pointer; user-select:none;
    font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--purple); font-weight:600; }
  table.ptable thead th:hover { background:rgba(132,80,149,.12); }
  /* What an account is for, said at a glance: her own login and a leftover test
     should never look like a client. */
  .acct { display:inline-block; padding:2px 9px; border-radius:999px; font-size:11px;
    font-weight:600; letter-spacing:.04em; }
  .acct.admin  { background:rgba(132,80,149,.14); color:#845095; }
  .acct.client { background:rgba(13,148,136,.14); color:#0b7a70; }
  .acct.test   { background:rgba(241,194,50,.22); color:#7a5c07; }
  /* the birth time, at a glance. Exact is quiet on purpose: it is the answer
     she wants most of the time and should not shout. Shaky is the one that
     changes how a session opens, so it is the one that reads first. */
  .tm { display:inline-block; padding:2px 9px; border-radius:999px; font-size:11px;
    font-weight:600; letter-spacing:.04em; white-space:nowrap; }
  .tm-exact { background:rgba(13,148,136,.12); color:#0b7a70; }
  .tm-told  { background:rgba(120,120,130,.14); color:#4a4a55; }
  .tm-rough { background:rgba(241,194,50,.22); color:#7a5c07; }
  .tm-shaky { background:rgba(210,77,255,.16); color:#8b2fae; }
  table.ptable thead th.on { color:var(--ink); }
  table.ptable tbody tr:hover { background:rgba(132,80,149,.04); }
  table.ptable tr.off td { opacity:.45; text-decoration:line-through; }
  table.ptable a { color:var(--purple); }
  .tnum { font-variant-numeric:tabular-nums; }
  /* where everything lives */
  .links { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; margin:12px 0 6px; }
  .linkcard { display:block; background:#fff; border:1px solid var(--line); border-radius:14px;
    padding:12px 14px; text-decoration:none; color:inherit; }
  .linkcard:hover { border-color:var(--purple); }
  .linkcard b { display:block; color:var(--purple); font-size:13px; margin-bottom:2px; }
  .linkcard span { font-size:11.5px; opacity:.6; line-height:1.45; display:block; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font-family:Montserrat,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
  .wrap { max-width:860px; margin:0 auto; padding:34px 22px 70px; }
  h1 { font-size:26px; font-weight:600; letter-spacing:.01em; margin:0 0 4px; color:var(--purple); }
  .sub { font-size:13.5px; opacity:.66; margin:0 0 26px; line-height:1.5; }
  .person { background:#fff; border:1px solid var(--line); border-radius:14px;
    padding:16px 16px 6px; margin-bottom:12px; position:relative; }
  .person .n { position:absolute; top:14px; right:16px; font-size:11px; opacity:.4; letter-spacing:.12em; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px 14px; }
  .f { display:flex; flex-direction:column; gap:5px; margin-bottom:12px; }
  .f.wide { grid-column:1 / -1; }
  label { font-size:11px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; opacity:.6; }
  input { font-family:inherit; font-size:15px; padding:9px 11px; border-radius:9px;
    border:1px solid var(--line); background:#fff; color:inherit; }
  input:focus { outline:2px solid var(--purple); outline-offset:1px; }
  .hint { font-size:11.5px; opacity:.55; }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:18px; }
  button { font-family:inherit; font-size:14px; font-weight:600; padding:11px 20px;
    border-radius:999px; border:1px solid var(--purple); cursor:pointer; }
  .go { background:var(--purple); color:#fff; }
  .go:disabled { opacity:.45; cursor:default; }
  .ghost { background:transparent; color:var(--purple); }
  .drop { background:transparent; border:none; color:var(--purple); font-size:12px;
    padding:4px 8px; cursor:pointer; opacity:.7; }
  .hint { position:fixed; z-index:50; max-width:430px; padding:10px 13px; border-radius:10px;
    background:#241b29; color:#f6f1f8; font-size:12px; line-height:1.55; pointer-events:none;
    box-shadow:0 10px 30px rgba(30,18,40,.28); white-space:pre-wrap; }
  .hint[hidden] { display:none; }
  .hint b { display:block; font-size:11px; letter-spacing:.1em; text-transform:uppercase;
    opacity:.6; margin-bottom:5px; font-weight:600; }
  [data-help] { cursor:help; }
  .tabs { display:flex; gap:8px; margin-bottom:22px; }
  .tab { font-family:inherit; font-size:13px; font-weight:600; padding:8px 18px; border-radius:999px;
    border:1px solid var(--line); background:transparent; color:var(--purple); cursor:pointer; }
  .tab.on { background:var(--purple); border-color:var(--purple); color:#fff; }
  [hidden] { display:none !important; }
  .dash { margin-top:4px; }
  .dash h2 { font-size:11px; letter-spacing:.16em; text-transform:uppercase; opacity:.55;
    margin:22px 0 10px; font-weight:600; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(128px,1fr)); gap:10px; }
  .tile { background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px 14px; cursor:help; }
  .tile b { display:block; font-size:21px; font-weight:600; font-variant-numeric:tabular-nums; }
  .track { height:7px; border-radius:4px; background:rgba(132,80,149,.14); overflow:hidden; }
  .fill { height:100%; background:var(--purple); border-radius:4px; }
  table.rep th { cursor:pointer; user-select:none; white-space:nowrap; }
  table.rep th:hover { color:var(--purple); opacity:.9; }
  table.rep th.sorted { color:var(--purple); opacity:1; }
  table.rep th.sorted::after { content:" ↑"; }
  table.rep th.sorted[data-dir="down"]::after { content:" ↓"; }
  .tile span { font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; opacity:.55; }
  .job { background:#fff; border:1px solid var(--line); border-radius:12px; padding:13px 15px; margin-bottom:10px; }
  .job > .when { font-size:11px; opacity:.5; margin-bottom:9px; }
  .job > .when .stopped { color:#c0392b; font-weight:600; opacity:1; }
  .who { display:flex; align-items:center; gap:9px; flex-wrap:wrap; padding:6px 0;
    border-top:1px solid rgba(132,80,149,.1); }
  .who:first-of-type { border-top:none; }
  .who .nm { flex:0 0 150px; font-size:13px; font-weight:600; }
  .pip { font-size:9.5px; letter-spacing:.06em; text-transform:uppercase; padding:3px 8px;
    border-radius:999px; border:1px solid var(--line); opacity:.45; }
  .pip.running { background:#fff5d6; border-color:#e8c85c; opacity:1; font-weight:600; }
  .pip.done { background:#e7f5ec; border-color:#8fc9a6; opacity:1; }
  .pip.kept { background:#eef0f4; border-color:#b9bfcc; opacity:1; }
  .pip.rejected { background:#fdeaea; border-color:#e0a0a0; opacity:1; font-weight:600; }
  .pip.failed { background:#fdeaea; border-color:#c46a6a; opacity:1; font-weight:600; }
  .cid { font-size:10px; font-weight:600; letter-spacing:.06em; opacity:.5; margin-left:6px; }
  .who a { font-size:11.5px; color:var(--purple); word-break:break-all; }
  table.rep { width:100%; border-collapse:collapse; font-size:12px; }
  table.rep th { text-align:left; font-size:10px; letter-spacing:.1em; text-transform:uppercase;
    opacity:.5; padding:6px 8px; font-weight:600; }
  table.rep td { padding:6px 8px; border-top:1px solid rgba(132,80,149,.12);
    font-variant-numeric:tabular-nums; }
  table.rep td.bad { color:#b3261e; font-weight:600; cursor:help; text-decoration:underline dotted; }
  #out { display:none; margin-top:24px; background:#fff; border:1px solid var(--line);
    border-radius:14px; padding:16px 18px; }
  #out.on { display:block; }
  pre { margin:0; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px;
    line-height:1.6; white-space:pre-wrap; max-height:420px; overflow:auto; }
  .links { margin-top:14px; padding-top:14px; border-top:1px solid var(--line); }
  .links a { display:block; font-size:13.5px; color:var(--purple); margin-bottom:6px; word-break:break-all; }
  .err { color:#b3261e; font-size:13px; margin-top:10px; }
  @media (max-width:620px) { .grid { grid-template-columns:1fr; } }
</style></head><body><div class="wrap">
<div class="hint" id="hint" hidden></div>
<div id="heartbeat" class="hb"></div>
<div class="tabs">
  <button type="button" class="tab on" id="tabAdd">Add a client</button>
  <button type="button" class="tab" id="tabStatus">Status</button>
  <button type="button" class="tab" id="tabMetrics">Metrics</button>
  <button type="button" class="tab" id="tabFailures">Failures</button>
  <button type="button" class="tab" id="tabChanges">Changes</button>
  <button type="button" class="tab" id="tabFunnel">Funnel</button>
  <button type="button" class="tab" id="tabLaunch">Launch</button>
</div>
<div id="viewAdd">
<h1>Add a Client</h1>
<p class="sub">Birth details in, published chart out. Reports, chart, link and the Notion row all happen here.</p>

<div id="people"></div>

<div class="row">
  <button type="button" class="ghost" id="more">Add another person</button>
</div>
<div class="row">
  <button type="button" class="go" id="go">Create charts</button>
  <label style="text-transform:none;letter-spacing:0;font-size:13px;opacity:.8;font-weight:400">
    <input type="checkbox" id="reports" checked style="width:auto;margin-right:6px">
    Write the Foundation and Planetary reports too
  </label>
</div>
<div class="err" id="err"></div>

<div id="out"><pre id="log"></pre><div class="links" id="links" style="display:none"></div></div>

</div>

<div class="dash" id="dash" hidden>
  <h1 style="margin-bottom:2px">Status</h1>
  <p class="sub">What every submitted client is doing, and what it has cost.</p>
  <h2>Today</h2>
  <div class="tiles" id="tiles"></div>
  <h2>Running now</h2>
  <div id="live"></div>
  <h2>Runs</h2>
  <div class="row" id="jobrow"><button id="clearRuns">Clear finished runs</button></div>
  <div id="jobs"></div>
  <h2>Deliveries</h2>
  <p class="sub" style="margin-top:-4px">Pickup to published chart. Writing is what the model spent; hang is everything else, which is where problems hide.</p>
  <div id="deliveries"></div>
  <h2>Recent reports</h2>
  <div id="recent"></div>
</div>

<div class="dash" id="failures" hidden>
  <h1 style="margin-bottom:2px">Failures</h1>
  <p class="sub">Every issue the validator has found, one line each. Hover an excerpt to read the whole thing.</p>
  <div class="row" style="margin-top:0" id="failFilters"></div>
  <div id="failTable"></div>
</div>

<div class="dash" id="funnel" hidden>
  <h1 style="margin-bottom:2px">Funnel</h1>
  <p class="sub">Accounts, clients and the gap between them. Numbers fill in as each phase lands.</p>
  <div id="funnelBody"></div>
</div>

<div class="dash" id="launch" hidden>
  <h1 style="margin-bottom:2px">Launch</h1>
  <p class="sub">The client portal, phase by phase. Everything else you might need is linked below.</p>
  <h2>Where everything lives</h2>
  <div class="links">
    <a class="linkcard" href="https://claude.ai/code/artifact/3428e24e-262a-4fd7-86a6-93468244cb44" target="_blank" rel="noreferrer">
      <b>The launch brief</b><span>Phases, pricing and what everything costs. Tap a task to change its status.</span></a>
    <a class="linkcard" href="https://charts.delphihd.com" target="_blank" rel="noreferrer">
      <b>Published charts</b><span>Where every client chart is served from.</span></a>
    <a class="linkcard" href="https://cal.com/DelphiHumanDesign" target="_blank" rel="noreferrer">
      <b>Booking and payments</b><span>Your three session types. Stripe takes payment on booking.</span></a>
    <a class="linkcard" href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">
      <b>Stripe</b><span>The money itself.</span></a>
    <a class="linkcard" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
      <b>Supabase</b><span>Accounts, charts, the library and the daily reads.</span></a>
    <a class="linkcard" href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">
      <b>Vercel</b><span>The website and the API the charts call.</span></a>
    <a class="linkcard" href="https://www.notion.so" target="_blank" rel="noreferrer">
      <b>Notion</b><span>Your source library. Everything the reports are written from.</span></a>
    <a class="linkcard" href="https://delphihd.com" target="_blank" rel="noreferrer">
      <b>Your website</b><span>The live Wix site. The chart tool gets replaced here.</span></a>
  </div>
  <div id="launchBody"></div>
</div>

<div class="dash" id="changes" hidden>
  <h1 style="margin-bottom:2px">Changes</h1>
  <p class="sub">What changed in the system, and every chart published.</p>
  <h2>What we changed</h2>
  <p class="sub" style="margin-top:0">Each piece of work, newest first, and which part of the system it touched.</p>
  <div id="systemTable"></div>
  <h2>Charts published</h2>
  <p class="sub" style="margin-top:0">"Rollback" says whether the version this replaced was kept, and can be restored.</p>
  <div id="changeTable"></div>
</div>

<div class="dash" id="metrics" hidden>
  <h1 style="margin-bottom:2px">Metrics</h1>
  <p class="sub">Where the roster stands, what it has cost, and what is going wrong.</p>
  <h2>Delivery</h2>
  <div class="tiles" id="mDelivery"></div>
  <h2>Cost</h2>
  <div class="tiles" id="mCost"></div>
  <h2>Quality</h2>
  <div class="tiles" id="mQuality"></div>
  <h2>What is failing validation</h2>
  <div id="mRules"></div>
  <h2>The roster</h2>
  <div id="mRoster"></div>
</div>
</div>
<script>
  var people = document.getElementById('people');
  function card() {
    var i = people.children.length + 1;
    var d = document.createElement('div');
    d.className = 'person';
    d.innerHTML =
      '<div class="n">' + i + '</div><div class="grid">' +
      '<div class="f wide"><label>Full name</label><input class="name" placeholder="Jane Doe"></div>' +
      '<div class="f"><label>Birth date</label><input class="date" type="date"></div>' +
      '<div class="f"><label>Birth time</label><input class="time" type="time"></div>' +
      '<div class="f wide"><label>Birth place</label><input class="place" placeholder="Denver, Colorado, United States">' +
      '<span class="hint">City, state or region, country.</span></div>' +
      '</div>' + (i > 1 ? '<button type="button" class="drop">Remove</button>' : '');
    var rm = d.querySelector('.drop');
    if (rm) rm.onclick = function () { d.remove(); renumber(); };
    people.appendChild(d);
  }
  function renumber() {
    [].forEach.call(people.children, function (c, n) { c.querySelector('.n').textContent = n + 1; });
  }
  card();
  document.getElementById('more').onclick = card;

  var go = document.getElementById('go'), out = document.getElementById('out');
  var log = document.getElementById('log'), links = document.getElementById('links');
  var err = document.getElementById('err');

  // ── hover explanations ───────────────────────────────────────────────────
  // The browser's own title tooltip is slow to appear, cannot be styled and in
  // practice showed Kaycee nothing but a question-mark cursor. This is a real
  // one: appears immediately, readable, and can carry an excerpt.
  var hint = document.getElementById('hint');
  document.addEventListener('mousemove', function (e) {
    var el = e.target.closest ? e.target.closest('[data-help]') : null;
    if (!el) { hint.hidden = true; return; }
    var label = el.getAttribute('data-help-label') || '';
    hint.innerHTML = (label ? '<b>' + esc(label) + '</b>' : '') + esc(el.getAttribute('data-help'));
    hint.hidden = false;
    var w = hint.offsetWidth, h = hint.offsetHeight;
    var x = Math.min(e.clientX + 16, window.innerWidth - w - 10);
    var y = e.clientY + 18 + h > window.innerHeight ? e.clientY - h - 12 : e.clientY + 18;
    hint.style.left = Math.max(8, x) + 'px';
    hint.style.top = Math.max(8, y) + 'px';
  });
  document.addEventListener('mouseleave', function () { hint.hidden = true; });

  // ── sortable tables ──────────────────────────────────────────────────────
  // Click a header to sort, click again to reverse. The dashboard re-renders
  // every few seconds, so the chosen sort is remembered per table and reapplied
  // after each render rather than being lost.
  var sortState = {};

  function cellValue(cell) {
    var t = (cell.textContent || '').trim();
    // strip currency and thousands separators without a regex: this file is a
    // template literal and escapes in it do not survive
    var cleaned = '';
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if (ch === '$' || ch === ',' || ch === '%') continue;
      cleaned += ch;
    }
    var head = cleaned.split(' ')[0];
    var n = parseFloat(head);
    // a value is numeric only if the leading token parses cleanly
    if (!isNaN(n) && head !== '' && String(n).length >= head.length - 1) return n;
    return t.toLowerCase();
  }

  function applySort(table, col, dir) {
    var body = table.tBodies[0];
    if (!body) return;
    var rows = [].slice.call(body.rows);
    rows.sort(function (a, b) {
      var x = cellValue(a.cells[col]), y = cellValue(b.cells[col]);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
    rows.forEach(function (r) { body.appendChild(r); });
    [].forEach.call(table.tHead.rows[0].cells, function (th, i) {
      th.classList.toggle('sorted', i === col);
      th.setAttribute('data-dir', i === col ? (dir > 0 ? 'up' : 'down') : '');
    });
  }

  function sortable(containerId) {
    var table = document.querySelector('#' + containerId + ' table.rep');
    if (!table || !table.tHead) return;
    [].forEach.call(table.tHead.rows[0].cells, function (th, i) {
      th.onclick = function () {
        var cur = sortState[containerId];
        var dir = (cur && cur.col === i && cur.dir === 1) ? -1 : 1;
        sortState[containerId] = { col: i, dir: dir };
        applySort(table, i, dir);
      };
    });
    var saved = sortState[containerId];
    if (saved) applySort(table, saved.col, saved.dir);
  }

  // ── the dashboard ────────────────────────────────────────────────────────
  var STEPS = ['roster', 'foundation', 'planetary', 'chart', 'notion'];
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function money(n) { return '$' + (n || 0).toFixed(2); }
  // every tile explains itself: what it is, and how it is worked out
  function tile(value, label, help) {
    return '<div class="tile" data-help="' + esc(help) + '"><b>' + value + '</b><span>' + esc(label) + '</span></div>';
  }

  // ---- the heartbeat -------------------------------------------------------
  // Above the tabs, so a job that stopped running is visible without going
  // looking for it. Refreshes itself while the dashboard is open.
  async function loadHeartbeat() {
    var el = document.getElementById('heartbeat');
    if (!el.innerHTML) el.innerHTML = '<div class="hbhead">Checking every scheduled job…</div>';
    var j;
    try { j = await (await fetch('/heartbeat')).json(); }
    catch (e) { el.innerHTML = '<div class="hbhead">Could not read the heartbeat</div>'; return; }
    var jobs = j.jobs || [];
    var bad = jobs.filter(function (x) { return x.ok === false; }).length;
    el.innerHTML = '<div class="hbhead">' +
      (bad ? bad + ' thing' + (bad > 1 ? 's' : '') + ' need' + (bad > 1 ? '' : 's') + ' a look'
           : 'Everything ran') +
      '<button type="button" id="syncNow" class="hbbtn">Sync now</button>' +
      '<span id="syncSaid" class="hbsaid"></span></div>' +
      jobs.map(function (x) {
        var cls = x.detail === 'running now' ? 'busy'
          : x.ok === true ? 'ok' : x.ok === false ? 'bad' : 'unknown';
        return '<div class="hbcard ' + cls + '">' +
          '<div class="hbname">' + esc(x.name) + '</div>' +
          '<div class="hbwhat">' + esc(x.what) + '</div>' +
          '<div class="hbdetail">' + esc(x.detail) + '</div></div>';
      }).join('');
    var btn = document.getElementById('syncNow');
    if (btn) btn.onclick = async function () {
      var said = document.getElementById('syncSaid');
      btn.disabled = true;
      said.textContent = 'Starting…';
      try {
        var r = await (await fetch('/sync-now', { method: 'POST' })).json();
        said.textContent = r.message;
        if (r.ok) setTimeout(loadHeartbeat, 6000);
      } catch (e) { said.textContent = 'Could not start it.'; }
      setTimeout(function () { btn.disabled = false; }, 8000);
    };
  }

  // ---- Funnel ------------------------------------------------------------
  async function loadFunnel() {
    var el = document.getElementById('funnelBody');
    el.innerHTML = '<p class="sub">Reading…</p>';
    var j;
    try { j = await (await fetch('/funnel')).json(); }
    catch (e) { el.innerHTML = '<p class="sub">Could not read the funnel.</p>'; return; }
    if (j.error) { el.innerHTML = '<p class="sub">' + esc(j.error) + '</p>'; return; }
    var n = function (v) { return (v === null || v === undefined) ? '—' : String(v); };
    var card = function (label, value, note) {
      return '<div class="mcard"><div class="mval">' + n(value) + '</div>' +
        '<div class="mlab">' + esc(label) + '</div>' +
        (note ? '<div class="mnote">' + esc(note) + '</div>' : '') + '</div>';
    };
    var head =
      '<div class="mgrid">' +
      card('Accounts', j.accounts, 'people who signed up') +
      card('Clients', j.clients, 'have a written report') +
      card('Charts, no report', j.chartsNoReport, 'the upsell list') +
      card('Charts published', j.charts, '') +
      card('Purchases', j.orders, 'Phase 2') +
      card('Subscribers', j.subscriptions, 'Phase 4') +
      card('Conversion', j.conversion === null ? null : j.conversion + '%', 'accounts to clients') +
      '</div>' +
      (j.notWired && j.notWired.length
        ? '<h2>Not wired yet</h2><ul class="plain">' +
          j.notWired.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>'
        : '');
    el.innerHTML = head + '<h2>Everyone <span class="sub" id="peopleCount"></span></h2>' +
      '<div class="row" style="margin:0 0 8px">' +
      '<button type="button" class="ghost" id="copyEmails">Copy every email</button>' +
      '<button type="button" class="ghost" id="downloadCsv">Download as a spreadsheet</button>' +
      '</div><div id="peopleTable"><p class="sub">Reading…</p></div>';
    loadPeople();
  }

  // ---- the list of everyone -------------------------------------------------
  var PEOPLE = [], SORT = { key: 'name', dir: 1 };
  // Chart sits beside the name because opening somebody's chart is the thing
  // she does most, and email goes last because it is the widest column and she
  // was scrolling past it to reach everything else. Kaycee, 2026-09-12.
  var COLS = [
    { key: 'name',    label: 'Name' },
    { key: 'chart',   label: 'Chart' },
    { key: 'source',  label: 'How they got here' },
    { key: 'account', label: 'Account' },
    { key: 'timing',  label: 'Birth Time' },
    { key: 'joined',  label: 'Since' },
    { key: 'reports', label: 'Reports' },
    { key: 'email',   label: 'Email' }
  ];

  // "Vandenberg, Kaycee". Sorting and scanning a list of people is done by
  // surname, and she is looking somebody up, not reading a sentence. A single
  // word stays as it is; everything before the last word is the given name, so
  // middle names travel with it rather than being mistaken for a surname.
  // What an account is for. Says it plainly so a test or her own admin login is
  // never mistaken for a client. Kaycee, 2026-09-12.
  var ACCOUNT_LABEL = { admin: 'Admin', client: 'Client', test: 'Test' };
  // How far a birth time can be trusted, at a glance, for the moment somebody
  // books. "Shaky" is the one worth seeing: the scan found the type, profile or
  // authority moving inside their window, so the top of their chart is not
  // settled and the session opens differently. Kaycee, 2026-09-12.
  var TIMING = {
    exact: { label: 'Exact', cls: 'tm-exact' },
    told:  { label: 'Told', cls: 'tm-told' },
    rough: { label: 'Rough', cls: 'tm-rough' },
    shaky: { label: 'Rough · type moves', cls: 'tm-shaky' }
  };
  function fileAs(n) {
    // No regex here. This whole script lives inside a template literal, which
    // eats the backslash, so /\s+/ became /s+/ and every name was split on the
    // letter s: "Russell Goodin" came out as "ell Goodin, Ru".
    var parts = String(n || '').trim().split(' ').filter(function (w) { return w.length > 0; });
    if (parts.length < 2) return String(n || '');
    return parts[parts.length - 1] + ', ' + parts.slice(0, -1).join(' ');
  }
  async function loadPeople() {
    var box = document.getElementById('peopleTable');
    try {
      var j = await (await fetch('/people')).json();
      if (j.error) { box.innerHTML = '<p class="sub">' + esc(j.error) + '</p>'; return; }
      PEOPLE = j.people || [];
    } catch (e) { box.innerHTML = '<p class="sub">Could not read the list.</p>'; return; }
    drawPeople();
  }
  function drawPeople() {
    var box = document.getElementById('peopleTable');
    var rows = PEOPLE.slice().sort(function (a, b) {
      var x = SORT.key === 'name' ? fileAs(a.name) : a[SORT.key];
      var y = SORT.key === 'name' ? fileAs(b.name) : b[SORT.key];
      if (x === null || x === undefined || x === '') return 1;
      if (y === null || y === undefined || y === '') return -1;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * SORT.dir;
    });
    var count = document.getElementById('peopleCount');
    if (count) {
      var signups = PEOPLE.filter(function (p) { return p.source === 'signup'; }).length;
      count.textContent = PEOPLE.length + ' people · ' + signups + ' signed up · ' +
        (PEOPLE.length - signups) + ' on the roster';
    }
    box.innerHTML = '<div class="tblwrap"><table class="ptable"><thead><tr>' +
      COLS.map(function (c) {
        var on = SORT.key === c.key;
        return '<th data-k="' + c.key + '" class="' + (on ? 'on' : '') + '">' + esc(c.label) +
          (on ? (SORT.dir > 0 ? ' ↑' : ' ↓') : '') + '</th>';
      }).join('') + '</tr></thead><tbody>' +
      rows.map(function (p) {
        return '<tr' + (p.revoked ? ' class="off"' : '') + '>' +
          '<td>' + esc(fileAs(p.name)) + '</td>' +
          '<td>' + (p.chart ? '<a href="' + esc(p.chart) + '" target="_blank" rel="noreferrer">open</a>' : '<span class="sub">—</span>') + '</td>' +
          '<td>' + esc(p.source === 'signup' ? 'Signed up' : p.source === 'roster' ? 'Roster' : p.source) + '</td>' +
          '<td>' + (p.account === 'none'
            ? '<span class="sub">no account</span>'
            : '<span class="acct ' + esc(p.account) + '">' + esc(ACCOUNT_LABEL[p.account] || p.account) + '</span>') + '</td>' +
          '<td>' + (function () {
            var t = TIMING[p.timing] || TIMING.exact;
            return '<span class="tm ' + t.cls + '">' + esc(t.label) + '</span>';
          })() + '</td>' +
          '<td class="tnum">' + (p.joined ? esc(String(p.joined).slice(0, 10)) : '—') + '</td>' +
          '<td>' + (p.reports === 'both' ? 'Both' : p.reports === 'none' ? '<span class="sub">none</span>' : esc(p.reports)) + '</td>' +
          '<td>' + (p.email ? '<a href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>' : '<span class="sub">—</span>') + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table></div>';
    [].forEach.call(box.querySelectorAll('th[data-k]'), function (th) {
      th.onclick = function () {
        var k = th.dataset.k;
        SORT.dir = (SORT.key === k) ? -SORT.dir : 1;
        SORT.key = k;
        drawPeople();
      };
    });
    var copy = document.getElementById('copyEmails');
    if (copy) copy.onclick = function () {
      var list = PEOPLE.map(function (p) { return p.email; }).filter(Boolean).join(', ');
      if (!list) { copy.textContent = 'No emails yet'; return; }
      navigator.clipboard.writeText(list).then(function () {
        copy.textContent = 'Copied ' + list.split(',').length + ' emails';
        setTimeout(function () { copy.textContent = 'Copy every email'; }, 2200);
      });
    };
    var csv = document.getElementById('downloadCsv');
    if (csv) csv.onclick = function () {
      var q = function (v) { return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"'; };
      // no backslash escapes in this file: it lives inside a template literal
      // and they are eaten before the browser ever sees them
      var NL = String.fromCharCode(10);
      var lines = [COLS.map(function (c) { return q(c.label); }).join(',')];
      PEOPLE.forEach(function (p) {
        lines.push(COLS.map(function (c) { return q(p[c.key]); }).join(','));
      });
      var text = lines.join(NL);
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      a.download = 'delphi-people.csv';
      a.click();
    };
  }

  // ---- Launch plan --------------------------------------------------------
  async function loadLaunch() {
    var el = document.getElementById('launchBody');
    el.innerHTML = '<p class="sub">Reading…</p>';
    var j;
    try { j = await (await fetch('/launch')).json(); }
    catch (e) { el.innerHTML = '<p class="sub">Could not read the launch plan.</p>'; return; }
    if (j.error) { el.innerHTML = '<p class="sub">' + esc(j.error) + '</p>'; return; }
    var all = 0, done = 0;
    (j.phases || []).forEach(function (p) {
      (p.items || []).forEach(function (i) { all++; if (i.status === 'done') done++; });
    });
    var pct = all ? Math.round((done / all) * 100) : 0;
    var days = null;
    if (j.event && j.event.date) {
      days = Math.round((new Date(j.event.date) - new Date()) / 86400000);
    }
    var html = '<div class="mgrid">' +
      '<div class="mcard"><div class="mval">' + done + ' / ' + all + '</div><div class="mlab">tasks done</div>' +
      '<div class="mnote">' + pct + '% of the plan</div></div>' +
      (j.event ? '<div class="mcard"><div class="mval">' + (days === null ? '—' : days) + '</div>' +
        '<div class="mlab">days to ' + esc(j.event.label || 'the event') + '</div>' +
        '<div class="mnote">' + esc(j.event.target || '') + '</div></div>' : '') +
      '</div>';
    (j.phases || []).forEach(function (p) {
      var pdone = (p.items || []).filter(function (i) { return i.status === 'done'; }).length;
      html += '<h2>' + esc(p.title) + ' <span class="sub">' + pdone + '/' + (p.items || []).length +
        (p.target ? ' &middot; target ' + esc(p.target) : '') + '</span></h2>';
      if (p.why) html += '<p class="sub">' + esc(p.why) + '</p>';
      html += '<ul class="plain">';
      (p.items || []).forEach(function (i) {
        var mark = i.status === 'done' ? '✓' : i.status === 'doing' ? '◐' : i.status === 'blocked' ? '✗' : '○';
        html += '<li class="li-' + esc(i.status) + '"><b>' + mark + '</b> ' + esc(i.title) +
          (i.note ? '<div class="mnote">' + esc(i.note) + '</div>' : '') + '</li>';
      });
      html += '</ul>';
    });
    if (j.decided && j.decided.length) {
      html += '<h2>Decided</h2><ul class="plain">' + j.decided.map(function (d) {
        return '<li>' + esc(d.what) + ' <span class="sub">' + esc(d.on) + '</span></li>';
      }).join('') + '</ul>';
    }
    if (j.open && j.open.length) {
      html += '<h2>Still open</h2><ul class="plain">' + j.open.map(function (d) {
        return '<li>' + esc(d.what) + '</li>';
      }).join('') + '</ul>';
    }
    el.innerHTML = html;
  }

  async function refresh() {
    var d;
    try { d = await fetch('/jobs', { cache: 'no-store' }).then(function (r) { return r.json(); }); }
    catch (e) { return; }

    // The dashboard was restarted under this tab. The tab is still running the
    // page it loaded before that, so anything added since has nowhere to render
    // and the screen silently stops matching the server. Reload once, rather
    // than leave somebody looking at a page that cannot show them the answer.
    if (!window.__build) window.__build = d.build;
    else if (d.build && d.build !== window.__build) { location.reload(); return; }

    document.getElementById('tiles').innerHTML =
      tile(d.today.reports, 'reports today',
        'Foundation and Planetary reports finished since midnight. Counted from the report log, one entry per completed report.') +
      tile(money(d.today.cost), 'spent today',
        'What today\u2019s reports cost in Claude API charges, added up from each report\u2019s own recorded cost. Charts, publishing and Notion cost nothing.') +
          tile(Math.round((d.attempts && d.attempts.total) || d.today.minutes) + ' min', 'real time today',
            'Every minute spent trying today, not just the runs that worked. A report that failed twice and succeeded on the third go counts all three. This is the number that tells you what the day actually cost.') +
          tile(Math.round((d.attempts && d.attempts.wasted) || 0) + ' min', 'wasted today',
            'Time spent on attempts that produced nothing: crashed, timed out, or stopped. If this is large, the reports are fighting something and it is worth knowing why rather than reading past it.') +
      tile(money(d.avgCost), 'average per report',
        'Every report ever written, total cost divided by the number of reports. Includes regenerations.') +
      tile(Math.round(d.avgMinutes) + ' min', 'average per report',
        'Every report ever written, total minutes divided by the number of reports.');

    // anything generating this second, however it was started
    document.getElementById('live').innerHTML = d.live.length
      ? d.live.map(function (x) {
          return '<div class="job"><div class="who">' +
            '<span class="nm">' + esc(x.client) + '</span>' +
            '<span class="pip running">' + esc(x.kind) + '</span>' +
            '<span class="pip">started ' + esc(new Date(x.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) + '</span>' +
            '<span class="pip ' + (x.slow ? 'rejected' : 'kept') + '">' + x.minutes + ' min</span>' +
            '<span style="font-size:11.5px;opacity:.65">' +
              (x.slow ? 'longer than 9 in 10 reports take. Still running; the model retries a stalled call on its own.'
                      : 'normal, a report takes about 17 minutes') +
            '</span></div></div>';
        }).join('')
      : '<div class="tile"><span>Nothing generating right now.</span></div>';

    document.getElementById('jobs').innerHTML = d.jobs.length ? d.jobs.map(function (j) {
      var when = new Date(j.startedAt).toLocaleString();
      return '<div class="job"><div class="when">' + esc(when) +
        (j.died ? ' &middot; <span class="stopped">stopped before it finished</span>'
          : j.finishedAt ? ' &middot; finished' : ' &middot; running') + '</div>' +
        j.people.map(function (p) {
          return '<div class="who"><span class="nm">' + esc(p.name) +
            (p.id ? ' <span class="cid">' + esc(p.id) + '</span>' : '') + '</span>' +
            STEPS.map(function (s) {
              return '<span class="pip ' + (p.steps[s] || 'waiting') + '">' + s + '</span>';
            }).join('') +
            (p.link ? '<a href="' + esc(p.link) + '" target="_blank">' + esc(p.link) + '</a>' : '') +
            (p.error ? '<span class="pip failed">' + esc(p.error).slice(0, 70) + '</span>' : '') +
            '</div>';
        }).join('') + '</div>';
    }).join('') : '<div class="tile"><span>No runs yet.</span></div>';

    var dl = d.delivery;
    document.getElementById('mDelivery').innerHTML =
      tile(dl.roster, 'clients on the roster',
        'Everyone in the client roster file. This is what the daily transit report runs over, so a person is only real once they are here.') +
      tile(dl.both, 'both reports written',
        'Clients with a Foundation AND a Planetary Overview in their folder on the Desktop. Read from the folders themselves, so reports written before the cost log existed still count.') +
      tile(dl.some, 'one report only',
        'Clients with exactly one of the two reports. Half-finished work.') +
      tile(dl.none, 'no reports yet',
        'On the roster with neither report written. These are the ones still to do.') +
      tile(Math.round((dl.both / (dl.roster || 1)) * 100) + '%', 'roster delivered',
        'Clients with both reports, divided by everyone on the roster.');

    document.getElementById('mCost').innerHTML =
      tile(money(d.people.lifetimeCost), 'spent all time',
        'Every report ever written, added up. Claude API charges only. Charts, the transit report\u2019s own summaries, publishing and Notion are not in this.') +
      tile(money(d.today.cost), 'spent today', 'Reports finished since midnight.') +
      tile(money(d.avgCost), 'per report',
        'Total spent divided by the number of reports. Regenerated reports count separately, because they were separately paid for.') +
      tile(money(dl.perClientCost), 'per finished client (actual, n=' + dl.finishedSample + ')',
        'MEASURED over the ' + dl.finishedSample + ' clients who have both reports on disk, adding everything ever spent on each including regenerations. Reports written before the cost log existed contribute nothing, so for older clients this reads low.') +
      tile(money(dl.remainingCost), 'to finish the roster (estimate)',
        'An ESTIMATE: the reports still missing across the roster, priced at the average cost per report. Assumes each is written once and comes out clean, so treat it as a floor rather than a forecast.');

    document.getElementById('mQuality').innerHTML =
      tile(d.people.lifetimeReports, 'reports written',
        'Every completed report in the log, including regenerations and reports that were later replaced.') +
      tile(Math.round(d.people.rejectRate * 100) + '%', 'rejected by the validator',
        'Share of reports where the validator found at least one HARD failure. A rejected report is still written and readable; it means at least one sentence needs a hand-touch before sending.') +
      tile(Math.round(d.avgMinutes) + ' min', 'average to write',
        'Wall-clock minutes per report, from the first API call to the finished text.') +
      tile(Math.round(dl.perClientMinutes) + ' min', 'per finished client (actual)',
        'MEASURED: total minutes spent on the ' + dl.finishedSample + ' clients who have both reports, averaged. Includes regenerations.');

    // ── the itemised failure log ─────────────────────────────────────────
    var cats = {};
    d.failures.forEach(function (f) { cats[f.category] = (cats[f.category] || 0) + 1; });
    var catNames = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
    if (!window.failFilter) window.failFilter = 'all';
    document.getElementById('failFilters').innerHTML =
      ['all'].concat(catNames).map(function (c) {
        var count = c === 'all' ? d.failures.length : cats[c];
        return '<button type="button" class="tab' + (window.failFilter === c ? ' on' : '') +
          '" data-cat="' + esc(c) + '" style="font-size:11.5px;padding:6px 13px">' +
          esc(c === 'all' ? 'Everything' : c) + ' ' + count + '</button>';
      }).join('');
    document.getElementById('failFilters').onclick = function (e) {
      var b = e.target.closest ? e.target.closest('[data-cat]') : null;
      if (!b) return;
      window.failFilter = b.dataset.cat;
      refresh();
    };

    var shown = d.failures.filter(function (f) {
      return window.failFilter === 'all' || f.category === window.failFilter;
    });
    document.getElementById('failTable').innerHTML = shown.length
      ? '<table class="rep"><thead><tr><th>date</th><th>id</th><th>client</th><th>report</th>' +
        '<th>severity</th><th>category</th><th>rule</th><th>excerpt</th></tr></thead><tbody>' +
        shown.map(function (f) {
          var ex = (f.detected || '').slice(0, 64);
          return '<tr><td>' + esc(new Date(f.at).toLocaleDateString([], { month: 'short', day: 'numeric' })) +
            '</td><td><b>' + esc(f.id) + '</b></td><td>' + esc(f.client) +
            '</td><td>' + esc(f.report === 'Planetary Overview' ? 'Planetary' : f.report) +
            '</td><td class="' + (f.severity === 'hard' ? 'bad' : '') + '">' + esc(f.severity) +
            '</td><td>' + esc(f.category) + '</td><td>' + esc(f.rule) +
            '</td><td data-help-label="' + esc(f.rule) + '" data-help="' + esc(f.message + (f.detected ? "\u2014\u2014\u2014 " + f.detected : '')) + '">' +
            esc(ex) + (f.detected && f.detected.length > 64 ? '\u2026' : '') + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="tile"><span>Nothing in this category.</span></div>';
    sortable('failTable');

    var CHANGE_HELP = {
      'report text': 'The words in the report changed. Somebody reran it, or the final pass rewrote a chapter.',
      'page only': 'The report is word for word the same. The chart page around it changed: a new view, a fix, a style change.',
      'report text and page': 'Both moved: the report was rewritten and the page around it changed in the same publish.',
      'first publish': 'This chart had never been published before, so there is nothing it replaced.',
      'no change': 'Republished, but the file came out byte for byte identical to the one already live.'
    };
    document.getElementById('changeTable').innerHTML = (d.changes && d.changes.length)
      ? '<table class="rep"><thead><tr><th>when</th><th>client</th><th>what changed</th>' +
        '<th>rollback</th></tr></thead><tbody>' +
        d.changes.map(function (c) {
          var kind = String(c.what || '');
          var paren = kind.indexOf(' (');
          if (paren >= 0) kind = kind.slice(0, paren);
          var help = CHANGE_HELP[kind] || '';
          var when = new Date(c.at);
          return '<tr><td style="white-space:nowrap">' + esc(when.toLocaleDateString([], { month: 'short', day: 'numeric' })) + ' ' +
            esc(when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) +
            '</td><td>' + esc(c.client) +
            '</td><td data-help-label="' + esc(kind) + '" data-help="' + esc(help) + '">' + esc(c.what) +
            '</td><td>' + (c.rollback ? 'kept' : '\u2014') + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="tile"><span>No chart has been published since the change log was switched on.</span></div>';
    sortable('changeTable');

    var AREA_HELP = {
      'chart page': 'The interactive chart your clients open: its views, panels and highlighting.',
      'astrology view': 'The natal wheel, the houses, the signs and the planet placements on it.',
      'mandala': 'The mandala renderer and the motion animation.',
      'reports': 'How the Foundation and Planetary Overview get written and checked.',
      'transits': 'The daily transit read and the sky data behind it.',
      'dashboard': 'This dashboard.',
      'roster': 'Who is on the roster and how people get added or renamed.',
      'library sync': 'The pull from Notion into the searchable library.',
      'database': 'The database structure itself.',
      'notes': 'Written notes and decisions, no behaviour change on its own.'
    };
    document.getElementById('systemTable').innerHTML = (d.systemChanges && d.systemChanges.length)
      ? '<table class="rep"><thead><tr><th>when</th><th>what changed</th><th>part of the system</th>' +
        '</tr></thead><tbody>' +
        d.systemChanges.map(function (c) {
          var when = new Date(c.at);
          var areas = (c.areas || []).map(function (a) {
            return '<span data-help-label="' + esc(a) + '" data-help="' + esc(AREA_HELP[a] || '') + '">' + esc(a) + '</span>';
          }).join(', ');
          return '<tr><td style="white-space:nowrap">' + esc(when.toLocaleDateString([], { month: 'short', day: 'numeric' })) +
            '</td><td>' + esc(c.what) +
            '</td><td>' + (areas || '\u2014') + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="tile"><span>No history available.</span></div>';
    sortable('systemTable');

    document.getElementById('mRoster').innerHTML =
      '<table class="rep"><thead><tr><th>id</th><th>client</th><th>foundation</th>' +
      '<th>planetary</th><th>spent</th></tr></thead><tbody>' +
      d.roster.map(function (r) {
        var tick = function (on) { return on ? '<span class="pip done">yes</span>' : '<span class="pip">no</span>'; };
        return '<tr><td><b>' + esc(r.id) + '</b></td><td>' + esc(r.name) + '</td><td>' +
          tick(r.foundation) + '</td><td>' + tick(r.planetary) + '</td><td' +
          (r.costKnown ? '' : ' style="opacity:.4" data-help="Written before costs were logged, so nothing is recorded. Not the same as free."') +
          '>' + (r.costKnown ? money(r.spent) : 'not logged') + '</td></tr>';
      }).join('') + '</tbody></table>';

    var fr = d.failingRules;
    var worst = fr.categories.length ? fr.categories[0].count : 0;
    document.getElementById('mRules').innerHTML = fr.categories.length
      ? '<table class="rep"><thead><tr><th>category</th><th>failures</th><th>reports</th>' +
        '<th>share</th><th>rules involved</th></tr></thead><tbody>' +
        fr.categories.map(function (c) {
          return '<tr><td><b>' + esc(c.name) + '</b></td>' +
            '<td>' + c.count + '</td>' +
            '<td>' + c.reports + '</td>' +
            '<td><div class="track" style="min-width:70px"><div class="fill" style="width:' +
              Math.round((c.count / (worst || 1)) * 100) + '%"></div></div></td>' +
            '<td style="opacity:.75">' + c.rules.map(function (r) {
              return esc(r.rule) + ' \u00d7' + r.n;
            }).join(', ') + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="sub" style="margin-top:10px">From ' + fr.reportsWithDetail + ' of ' +
        fr.totalReports + ' reports. Reasons are only recorded for reports written from 27 Aug 2026 on.</p>'
      : '<div class="tile"><span>No failure reasons recorded yet. Reports written from now on log them, ' +
        'so this fills in as reports are generated.</span></div>';

    document.getElementById('deliveries').innerHTML = d.deliveries.length
      ? '<table class="rep"><thead><tr><th>date</th><th>client</th><th>started</th>' +
        '<th>delivered in</th><th>writing</th><th>hang</th><th>attempts</th><th>outcome</th>' +
        '</tr></thead><tbody>' +
        d.deliveries.map(function (x) {
          var t = function (m) { return m == null ? '-' : (m < 90 ? Math.round(m) + ' min' : (m / 60).toFixed(1) + ' h'); };
          var st = new Date(x.started);
          var bad = (x.hang_minutes || 0) > 20 || x.outcome !== 'delivered';
          return '<tr><td>' + esc(st.toLocaleDateString([], { month: 'short', day: 'numeric' })) +
            '</td><td>' + esc(x.client) + (x.reconstructed ? ' <span class="cid" data-help="Reconstructed from the run log: this client was delivered before delivery times were recorded.">est</span>' : '') +
            '</td><td>' + esc(st.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) +
            '</td><td>' + t(x.delivered_minutes) +
            '</td><td>' + t(x.generating_minutes) +
            '</td><td class="' + (bad ? 'bad' : '') + '"' +
              (bad ? ' data-help="Time not spent writing: stalled calls, retries, the chart build, waiting."' : '') +
              '>' + t(x.hang_minutes) +
            '</td><td>' + (x.reports_attempted == null ? '-' : x.reports_attempted) +
            '</td><td class="' + (x.outcome === 'delivered' ? '' : 'bad') + '">' + esc(x.outcome) +
            '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="tile"><span>No deliveries recorded yet.</span></div>';

    document.getElementById('recent').innerHTML = d.recent.length
      ? '<table class="rep"><thead><tr><th>date</th><th>time</th><th>client</th><th>report</th>' +
        '<th>cost</th><th>min</th><th>retries</th><th>words</th><th>validator</th></tr></thead><tbody>' +
        d.recent.map(function (r) {
          var bad = /REJECT/.test(r.validation || '');
            var when = new Date(r.at);
            return '<tr><td>' + esc(when.toLocaleDateString([], { month: 'short', day: 'numeric' })) +
              '</td><td>' + esc(when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) +
            '</td><td>' + esc(r.client) + '</td><td>' + esc(r.kind) + '</td><td' +
              (r.failed_attempts
                ? ' data-help-label="a floor, not the total" data-help="' + r.failed_attempts +
                  ' attempt(s) for this client that day produced nothing and died before their cost was recorded.'
                  + ' What was spent getting here is higher than this figure."'
                : '') +
              '>' + money(r.cost) + (r.failed_attempts ? ' +' : '') + '</td><td' +
              (r.real_minutes && Math.round(r.real_minutes) !== r.minutes
                ? ' data-help-label="real time" data-help="' + Math.round(r.real_minutes) +
                  ' minutes across ' + (r.attempts || 1) + ' attempt(s). The run that succeeded took ' + r.minutes +
                  '. The rest went on attempts that produced nothing."'
                : '') +
              '>' + (r.real_minutes ? Math.round(r.real_minutes) : r.minutes) + '</td><td' +
              (r.retries === null || r.retries === undefined
                ? ' style="opacity:.35" data-help="Written before retries were recorded."'
                : r.retries > 0
                  ? ' data-help="' + r.retries + ' of ' + r.sections + ' sections were written again because the validator rejected the first attempt."'
                  : '') +
              '>' + (r.retries === null || r.retries === undefined ? '-' : r.retries + (r.sections ? ' / ' + r.sections : '')) +
              '</td><td>' + (r.words || '').toLocaleString() +
              '</td><td class="' + (bad ? 'bad' : '') + '"' + (bad ? ' data-help-label="why it was rejected" data-help="' + esc(
                (r.issues && r.issues.length)
                  ? r.issues.map(function (i) {
                      return i.rule + (i.detected ? ': ' + i.detected.slice(0, 110) : '');
                    }).join(String.fromCharCode(10) + String.fromCharCode(10))
                  : 'Reasons were not recorded for this report. Reports written from now on log them.') + '"' : '') +
              '>' + (bad ? 'REJECT' : 'approve') + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="tile"><span>No reports yet.</span></div>';

    // the tables re-render every few seconds, so rewire and reapply the sort
    sortable('deliveries');
    sortable('recent');
    sortable('mRules');
    sortable('mRoster');
  }
  document.getElementById('clearRuns').onclick = function () {
    var b = document.getElementById('clearRuns');
    b.disabled = true;
    fetch('/jobs/clear', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (o) {
        b.disabled = false;
        b.textContent = o.dropped ? 'Cleared ' + o.dropped : 'Nothing finished to clear';
        setTimeout(function () { b.textContent = 'Clear finished runs'; }, 2500);
        refresh();
      })
      .catch(function () { b.disabled = false; });
  };


  refresh();
  setInterval(refresh, 5000);

  var VIEWS = { add: 'viewAdd', status: 'dash', metrics: 'metrics', failures: 'failures', changes: 'changes',
    funnel: 'funnel', launch: 'launch' };
  var TABS = { add: 'tabAdd', status: 'tabStatus', metrics: 'tabMetrics', failures: 'tabFailures', changes: 'tabChanges',
    funnel: 'tabFunnel', launch: 'tabLaunch' };
  function show(which) {
    Object.keys(VIEWS).forEach(function (k) {
      document.getElementById(VIEWS[k]).hidden = (k !== which);
      document.getElementById(TABS[k]).classList.toggle('on', k === which);
    });
    if (which === 'funnel') loadFunnel();
    else if (which === 'launch') loadLaunch();
    else if (which !== 'add') refresh();
  }
  Object.keys(TABS).forEach(function (k) {
    document.getElementById(TABS[k]).onclick = function () { show(k); };
  });
  loadHeartbeat();
  setInterval(loadHeartbeat, 120000);

  // deep links, so either view can be bookmarked on its own
  if (location.hash === '#status') show('status');
  if (location.hash === '#metrics') show('metrics');
  if (location.hash === '#failures') show('failures');
  if (location.hash === '#changes') show('changes');
  if (location.hash === '#funnel') show('funnel');
  if (location.hash === '#launch') show('launch');

  go.onclick = async function () {
    err.textContent = '';
    var rows = [].map.call(people.children, function (c) {
      return {
        name: c.querySelector('.name').value.trim(),
        birthDate: c.querySelector('.date').value.trim(),
        birthTime: c.querySelector('.time').value.trim(),
        birthPlace: c.querySelector('.place').value.trim(),
      };
    }).filter(function (r) { return r.name || r.birthDate || r.birthTime || r.birthPlace; });

    var missing = rows.filter(function (r) {
      return !r.name || !r.birthDate || !r.birthTime || !r.birthPlace;
    });
    if (!rows.length) { err.textContent = 'Fill in at least one person.'; return; }
    if (missing.length) { err.textContent = 'Every person needs all four fields.'; return; }

    go.disabled = true; go.textContent = 'Working…';
    show('status');
    out.className = 'on'; log.textContent = ''; links.style.display = 'none'; links.innerHTML = '';

    var res = await fetch('/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ people: rows, reports: document.getElementById('reports').checked }),
    });
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
    while (true) {
      var r = await reader.read();
      if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      log.textContent = buf;
      log.parentElement.scrollTop = log.parentElement.scrollHeight;
      log.scrollTop = log.scrollHeight;
    }
    var found = buf.match(/https:\\/\\/charts\\.delphihd\\.com\\/c\\/[a-f0-9]{32}/g) || [];
    if (found.length) {
      links.style.display = 'block';
      links.innerHTML = '<b style="font-size:12px;letter-spacing:.1em;opacity:.6">CHART LINKS</b>' +
        found.map(function (u) { return '<a href="' + u + '" target="_blank">' + u + '</a>'; }).join('');
    }
    go.disabled = false; go.textContent = 'Create charts';
    refresh();
  };
</script></body></html>`;

function csvEscape(v: string) { return '"' + v.replace(/"/g, '""') + '"'; }

createServer((req, res) => {
  // Compare the PATH, not the raw URL. Matching req.url exactly meant any query
  // string ("/?v=2") fell through to the 404 and served an empty page, which
  // looks exactly like the dashboard having vanished.
  const path = (req.url ?? "/").split("?")[0].split("#")[0];
  if (req.method === "GET" && (path === "/" || path === "/index.html")) {
    // no-store: this page changes whenever the tool does, and a cached copy is
    // how a dashboard that exists on the server looks missing in the browser
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, must-revalidate",
    });
    res.end(PAGE);
    return;
  }
  // Rerunning somebody already on the roster: named by slug, so their recorded
  // birth details are reused rather than retyped. Both birth-time errors this
  // week came from retyping details that were already on file.
  if (req.method === "POST" && path === "/rerun") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      let slugs: string[] = [];
      try {
        const parsed = JSON.parse(body);
        slugs = Array.isArray(parsed.slugs) ? parsed.slugs.filter((x: unknown) => typeof x === "string") : [];
      } catch { res.writeHead(400); res.end("bad request"); return; }
      if (!slugs.length) { res.writeHead(400); res.end("nobody selected"); return; }

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      const src = existsSync(ROSTER_PATH) ? readFileSync(ROSTER_PATH, "utf8") : "";
      const nameOf = Object.fromEntries(
        [...src.matchAll(/slug: "([^"]+)",\s*name: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
      const jobs = loadJobs();
      const job: Job = {
        id: String(Date.now()),
        startedAt: new Date().toISOString(),
        people: slugs.map((sl) => ({ name: nameOf[sl] ?? sl, steps: blankSteps() })),
      };
      jobs.push(job);
      saveJobs(jobs);

      startRun(job, jobs, ["scripts/add-client.ts", ...slugs, "--redo", "--yes"], res);
    });
    return;
  }

  if (req.method === "POST" && path === "/run") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      let people: { name: string; birthDate: string; birthTime: string; birthPlace: string }[];
      let reports = true;
      try {
        const parsed = JSON.parse(body);
        people = parsed.people ?? [];
        reports = parsed.reports !== false;
      } catch {
        res.writeHead(400); res.end("bad request"); return;
      }
      const dir = mkdtempSync(join(tmpdir(), "delphi-form-"));
      const csv = join(dir, "people.csv");
      writeFileSync(csv, "Name,Birth Date,Birth Time,Birth Place\n" +
        people.map((p) => [p.name, p.birthDate, p.birthTime, p.birthPlace].map(csvEscape).join(",")).join("\n") + "\n");

      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      const jobs = loadJobs();
      const job: Job = {
        id: String(Date.now()),
        startedAt: new Date().toISOString(),
        people: people.map((p) => ({ name: p.name, steps: blankSteps() })),
      };
      jobs.push(job);
      saveJobs(jobs);

      const args = ["scripts/add-client.ts", "--file", csv, "--yes"];
      if (!reports) args.push("--no-reports");
      startRun(job, jobs, args, res);
    });
    return;
  }
  if (req.method === "POST" && path === "/jobs/clear") {
    // Finished only. A run whose process is still alive stays on the board
    // however old it looks, because that is the one she needs to see.
    const jobs = loadJobs();
    const keep = jobs.filter((j) => alive(j.pid));
    const dropped = jobs.length - keep.length;
    saveJobs(keep);
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ dropped, left: keep.length }));
    return;
  }

  // The launch plan, read from docs/launch-plan.json so it is version-controlled
  // and moves with the work rather than living in a chat.
  if (req.method === "GET" && path === "/launch") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    try {
      res.end(readFileSync("docs/launch-plan.json", "utf8"));
    } catch {
      res.end(JSON.stringify({ error: "docs/launch-plan.json not found" }));
    }
    return;
  }

  // Who has an account, who is a paying client, and the gap between them. The
  // metrics are defined now and fill in as each phase lands: a number that says
  // "not wired yet" is more useful than a zero pretending to be a measurement.
  if (req.method === "GET" && path === "/funnel") {
    void (async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const out: Record<string, unknown> = {};
      try {
        if (!url || !key) throw new Error("no Supabase credentials in this shell");
        const { createClient } = await import("@supabase/supabase-js");
        const db = createClient(url, key, { auth: { persistSession: false } });
        const countOf = async (table: string) => {
          const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
          return error ? null : count ?? 0;
        };
        const accounts = await countOf("profiles");
        const orders = await countOf("orders");
        const subs = await countOf("subscriptions");

        // Charts that exist, and which of those people have a written report.
        // Counting report FILES overcounts badly: 71 files, two per person plus
        // hand-versioned drafts. The charts table is the roll of real people.
        const { data: chartRows } = await db.from("client_charts")
          .select("client_slug, revoked_at");
        const live = (chartRows ?? []).filter((r: { revoked_at: string | null }) => !r.revoked_at);
        const slugs = new Set(live.map((r: { client_slug: string }) => r.client_slug));
        const withReports = new Set<string>();
        const dir = ".cache/reports";
        if (existsSync(dir)) {
          for (const f of readdirSync(dir)) {
            const m = f.match(/^(.+?)-(foundation|planetary)\.md$/);
            if (m && slugs.has(m[1])) withReports.add(m[1]);
          }
        }

        out.accounts = accounts;
        out.charts = slugs.size;
        out.clients = withReports.size;
        out.chartsNoReport = slugs.size - withReports.size;
        out.orders = orders;
        out.subscriptions = subs;
        // Accounts are not linked to charts until the charts table lands in
        // Phase 1, so signup-to-client conversion is not measurable yet. A
        // number here now would be an artefact of three test profiles, not a
        // measurement.
        out.freeAccounts = null;
        out.conversion = null;
        out.notWired = [
          "signup to client conversion (needs the charts table, Phase 1)",
          orders === null ? "purchases (no orders table yet, Phase 2)" : null,
          subs === null ? "subscriptions (Phase 4)" : null,
          "bookings (Cal.com is not connected to this dashboard)",
        ].filter(Boolean);
      } catch (e) {
        out.error = e instanceof Error ? e.message : String(e);
      }
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(out));
    })();
    return;
  }

  // Every person we know about, in one list: who they are, how to reach them,
  // where they came from and what they have. Two sources today, because an
  // account is not yet linked to a chart; that link arrives with the charts
  // table in Phase 1 and this merges on it then.
  // The heartbeat of everything that runs on a schedule. A job that stops
  // running has to be as visible as one that crashes: the nightly sync was
  // cancelled eighty times in a row and said nothing, because the only place it
  // spoke was a log file nobody opens. Kaycee, 2026-09-09.
  // Sync now: Kaycee edits Notion, presses this, and watches the heartbeat.
  // Runs in GitHub, not here, so it does not depend on this laptop staying awake.
  if (req.method === "POST" && path === "/sync-now") {
    void (async () => {
      const say = (ok: boolean, message: string) => {
        res.writeHead(ok ? 200 : 500, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ ok, message }));
      };
      try {
        const { execFileSync } = await import("node:child_process");
        const GH = [
          `${process.env.HOME}/.local/bin/gh`,
          "/opt/homebrew/bin/gh",
          "/usr/local/bin/gh",
          "gh",
        ].find((c) => c === "gh" || existsSync(c))!;
        execFileSync(GH, ["workflow", "run", "sync-notion.yml"],
          { cwd: process.cwd(), encoding: "utf8", timeout: 20000 });
        say(true, "Started. It takes about half an hour; watch the sync (cloud) card.");
      } catch (e) {
        say(false, e instanceof Error ? e.message : String(e));
      }
    })();
    return;
  }

  if (req.method === "GET" && path === "/heartbeat") {
    void (async () => {
      const out: { jobs: unknown[]; error?: string } = { jobs: [] };
      const jobs: {
        name: string; what: string; lastRun: string | null; ok: boolean | null;
        detail: string; every: string;
      }[] = [];

      const ageOf = (iso: string | null): string => {
        if (!iso) return "never";
        const h = (Date.now() - new Date(iso).getTime()) / 3600000;
        if (h < 1) return `${Math.round(h * 60)} min ago`;
        if (h < 48) return `${Math.round(h)} hours ago`;
        return `${Math.round(h / 24)} days ago`;
      };

      // Each LaunchAgent writes a dated marker and, on failure, the word FAILED.
      // When the log was last written, not when a header says it was. Parsing the
      // "=== date ===" markers read Evening Echoes' own "=== Evening Echoes,
      // 2026-09-08 ===" banner as a timestamp and called a healthy job dead.
      // A panel that cries wolf is worse than no panel.
      const logFor = (agent: string) => {
        const p = `${process.env.HOME}/Library/Logs/com.delphihd.${agent}.log`;
        if (!existsSync(p)) return { last: null as string | null, failed: false, tail: "no log yet" };
        const touched = statSync(p).mtime.toISOString();
        const text = readFileSync(p, "utf8");
        // only what happened since the last time the agent itself started
        const starts = [...text.matchAll(/^=== (\w{3} \w{3} .+?) ===$/gm)];
        const from = starts.length ? (starts[starts.length - 1].index ?? 0) : Math.max(0, text.length - 4000);
        const lastRun = text.slice(from);
        const lines = lastRun.split("\n").map((l) => l.trim()).filter(Boolean);
        return {
          last: touched,
          failed: /FAILED|Error:/i.test(lastRun),
          tail: lines[lines.length - 1] ?? "ran clean",
        };
      };

      // A daily job that has not run since yesterday has stopped, whatever its
      // last run said. Silence is the failure mode this panel exists for: the
      // cloud sync was cancelled eighty nights running and never once "failed".
      const OVERDUE_HOURS = 26;
      for (const [agent, what, every] of [

        ["transit-report", "The day's transit report and everyone's read", "6:00am daily"],
        ["evening-echoes", "Evening Echoes", "6:00pm daily"],
        ["health-check", "Morning health digest", "5:00am daily"],
        ["delphi-pull", "Keeps this repo up to date", "daily"],
      ] as [string, string, string][]) {
        const l = logFor(agent);
        const hours = l.last ? (Date.now() - new Date(l.last).getTime()) / 3600000 : Infinity;
        const overdue = hours > OVERDUE_HOURS;
        jobs.push({
          name: agent, what, every, lastRun: l.last,
          ok: l.last === null ? null : (!l.failed && !overdue),
          detail: l.failed ? l.tail
            : overdue ? `has not run in ${ageOf(l.last).replace(" ago", "")}`
            : ageOf(l.last),
        });
      }

      // The cloud sync. A cancelled run is not a failure to GitHub and sends no
      // mail, which is exactly how eighty of them went unnoticed.
      try {
        const { execFileSync } = await import("node:child_process");
        // The LaunchAgent's PATH does not include Homebrew, so "gh" alone is not
        // found and the cloud sync silently reads as unknown.
        const GH = [
          `${process.env.HOME}/.local/bin/gh`,
          "/opt/homebrew/bin/gh",
          "/usr/local/bin/gh",
          "gh",
        ].find((c) => c === "gh" || existsSync(c))!;
        const raw = execFileSync(GH, [
          "run", "list", "--workflow=sync-notion.yml", "--limit", "1",
          "--json", "status,conclusion,createdAt,url",
        ], { cwd: process.cwd(), encoding: "utf8", timeout: 15000 });
        const [r] = JSON.parse(raw) as {
          status: string; conclusion: string; createdAt: string; url: string;
        }[];
        if (r) {
          jobs.push({
            name: "sync", what: "Your Notion library into the database", every: "Mondays, or when you press Sync now",
            lastRun: r.createdAt,
            ok: r.status !== "completed" ? null : r.conclusion === "success",
            detail: r.status !== "completed" ? "running now"
              : r.conclusion === "success" ? ageOf(r.createdAt) : `${r.conclusion} · ${ageOf(r.createdAt)}`,
          });
        }
      } catch {
        jobs.push({
          name: "sync (cloud)", what: "The same sync, run by GitHub", every: "5:30am daily",
          lastRun: null, ok: null, detail: "could not read GitHub from here",
        });
      }

      // What the library actually holds right now.
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (url && key) {
          const { createClient } = await import("@supabase/supabase-js");
          const db = createClient(url, key, { auth: { persistSession: false } });
          // Counted, not fetched. Pulling 860 bodies to count them took the best
          // part of a minute and left this strip blank while it ran.
          const countWhere = async (build: (q: any) => any) => {
            const { count } = await build(db.from("chunks").select("*", { count: "exact", head: true }));
            return count ?? 0;
          };
          const total = await countWhere((q: any) => q);
          const withBody = await countWhere((q: any) => q.neq("body", ""));
          const withMeta = await countWhere((q: any) => q.neq("metadata", "{}"));
          const { data: newestRow } = await db.from("chunks")
            .select("updated_at").order("updated_at", { ascending: false }).limit(1);
          const newest = newestRow?.[0]?.updated_at ?? null;
          jobs.push({
            name: "library", what: "Your source material in the database", every: "written by the sync",
            lastRun: newest,
            ok: total > 0 && withBody === total && withMeta > 0,
            detail: `${total} pages · ${withBody} with content · ${withMeta} with properties · updated ${ageOf(newest)}`,
          });
        }
      } catch (e) {
        out.error = e instanceof Error ? e.message : String(e);
      }

      out.jobs = jobs;
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(out));
    })();
    return;
  }

  // What each event slug is called in the funnel. Kaycee reads this column, so
  // it says the event, not a code.
  const EVENT_LABEL: Record<string, string> = {
    bfki: "BFKI",
  };
  if (req.method === "GET" && path === "/people") {
    void (async () => {
      const out: Record<string, unknown> = { people: [] };
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) throw new Error("no Supabase credentials in this shell");
        const { createClient } = await import("@supabase/supabase-js");
        const db = createClient(url, key, { auth: { persistSession: false } });

        const { data: charts } = await db.from("client_charts")
          .select("client_slug, client_name, token, created_at, revoked_at");
        // Where a chart came from is on the chart itself now, not a guess from
        // which table it turned up in. Seed is Kaycee's own roster; anything else
        // was made by somebody through the portal.
        const { data: records } = await db.from("charts")
          .select("token, tier, owner_id, for_email, source, time_accuracy, time_scan");
        const byToken = new Map((records ?? []).map(
          (r: { token: string }) => [r.token, r as Record<string, unknown>]));
        const { data: accounts } = await db.from("profiles")
          .select("email, full_name, created_at, account_type");

        // which reports each person actually has
        const reports: Record<string, Set<string>> = {};
        if (existsSync(".cache/reports")) {
          for (const f of readdirSync(".cache/reports")) {
            const m = f.match(/^(.+?)-(foundation|planetary)\.md$/);
            if (m) (reports[m[1]] = reports[m[1]] ?? new Set()).add(m[2]);
          }
        }

        type Person = {
          name: string; email: string | null; source: string; joined: string | null;
          chart: string | null; reports: string; revoked: boolean;
          /** admin, client, test, or none when they have no account at all. */
          account: string;
          /**
           * How far this chart's birth time can be trusted, for the moment
           * somebody books a session. Kaycee, 2026-09-12: "i also want some kind
           * of birth time reliability indicator on the dashboard in case they
           * book a session so I know if it's exact or not."
           *
           * Four answers, and the fourth is the one worth seeing: a rough time
           * whose scan found the type, profile or authority moving is a chart
           * whose top line is not settled, and that changes how a session opens.
           */
          timing: "exact" | "told" | "rough" | "shaky";
        };
        /**
         * Birth certificate, remembered, roughly known, or roughly known and
         * already shown to move something that matters. The last one reads off
         * the stored scan, which knows whether the identity fields are among
         * the casualties; without a stored scan it is simply rough.
         */
        const timingOf = (rec?: Record<string, unknown>): Person["timing"] => {
          const acc = (rec?.time_accuracy as string) ?? "document";
          if (acc === "document") return "exact";
          if (acc === "told") return "told";
          const scan = rec?.time_scan as { identityUnsettled?: boolean } | null;
          return scan?.identityUnsettled ? "shaky" : "rough";
        };

        const people: Person[] = [];
        for (const c of charts ?? []) {
          const got = reports[c.client_slug] ?? new Set<string>();
          const rec = byToken.get(c.token);
          const tier = (rec?.tier as string) ?? "seed";
          people.push({
            name: c.client_name ?? c.client_slug,
            email: (rec?.for_email as string) ?? null,
            // Recorded, not guessed. A chart made through an event's own link
            // carries that event, so "how they got here" can finally answer
            // with something other than roster or signup.
            source: EVENT_LABEL[(rec?.source as string) ?? ""]
              ?? (tier === "seed" ? "roster" : "signup"),
            joined: c.created_at ?? null,
            chart: c.token ? `https://charts.delphihd.com/c/${c.token}` : null,
            reports: got.size === 2 ? "both" : got.size === 1 ? [...got][0] : "none",
            revoked: !!c.revoked_at,
            account: "none",
            timing: timingOf(rec),
          });
        }
        const named = new Set(people.map((p) => p.name.toLowerCase()));
        // Letters only, lowercased: "Tiff Polamateer" and "tiffpolmateer" are the
        // same person, and matching on the exact name listed her twice. Spelling
        // differences between a chart and an account are normal, so the email is
        // checked first and the loose name second.
        const loose = (v: string) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
        for (const a of accounts ?? []) {
          const nm = a.full_name ?? (a.email ?? "").split("@")[0];
          const mail = (a.email ?? "").toLowerCase();
          const hit = people.find((p) =>
            (p.email && p.email.toLowerCase() === mail) ||
            loose(p.name) === loose(String(nm)) ||
            (mail && loose(p.name) === loose(mail.split("@")[0])));
          if (hit) {
            hit.email = hit.email ?? a.email ?? null;
            hit.account = (a.account_type as string) ?? "client";
            continue;
          }
          people.push({
            name: nm, email: a.email ?? null, source: "signup",
            joined: a.created_at ?? null, chart: null, reports: "none", revoked: false,
            account: (a.account_type as string) ?? "client",
            // an account with no chart has no birth time to judge
            timing: "exact",
          });
          named.add(String(nm).toLowerCase());
        }
        out.people = people;
      } catch (e) {
        out.error = e instanceof Error ? e.message : String(e);
      }
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(out));
    })();
    return;
  }

  if (req.method === "GET" && path === "/jobs") {
    const jobs = loadJobs();
    const stats = reportStats();
    const byClient: Record<string, { cost: number; minutes: number; reports: number; rejected: number }> = {};
    for (const r of stats) {
      const k = r.client as string;
      byClient[k] = byClient[k] ?? { cost: 0, minutes: 0, reports: 0, rejected: 0 };
      byClient[k].cost += r.cost_usd ?? 0;
      byClient[k].minutes += (r.elapsed_sec ?? 0) / 60;
      byClient[k].reports += 1;
      if (/REJECT/.test(String(r.validation ?? ""))) byClient[k].rejected += 1;
    }
    const today = new Date().toISOString().slice(0, 10);
    const todays = stats.filter((r: any) => String(r.timestamp ?? "").startsWith(today));
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({
      failures: (() => {
        if (!existsSync(FAILURE_LOG)) return [];
        return readFileSync(FAILURE_LOG, "utf8").split("\n").filter(Boolean)
          .map((l) => { try { return JSON.parse(l); } catch { return null; } })
          .filter(Boolean)
          .map((f: any) => ({ ...f, category: categoryOf(f.rule) }))
          .sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)));
      })(),
      build: BUILD_ID,
      systemChanges: systemChanges(),
      attempts: attemptTotals(today),
      attemptsAll: attemptTotals(),
      changes: (() => {
        if (!existsSync(CHANGE_LOG)) return [];
        return readFileSync(CHANGE_LOG, "utf8").split("\n").filter(Boolean)
          .map((l) => { try { return JSON.parse(l); } catch { return null; } })
          .filter(Boolean)
          .sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)))
          .slice(0, 500);
      })(),
      deliveries: (() => {
        if (!existsSync(DELIVERY_LOG)) return [];
        return readFileSync(DELIVERY_LOG, "utf8").split("\n").filter(Boolean)
          .map((l) => { try { return JSON.parse(l); } catch { return null; } })
          .filter(Boolean).slice(-30).reverse();
      })(),
      live: liveReports(),
      jobs: jobs.slice(-6).reverse(),
      byClient,
      recent: stats.slice(-30).reverse().map((r: any) => ({
          real_minutes: r.real_minutes ?? null,
          attempts: r.attempts ?? null,
          failed_attempts: r.failed_attempts ?? 0,
        at: r.timestamp, client: r.client, kind: r.report_type, cost: r.cost_usd,
        words: r.words, minutes: Math.round((r.elapsed_sec ?? 0) / 60),
        validation: r.validation,
        retries: r.retried_sections ?? null,
        sections: r.total_sections ?? null,
        // the reasons, so a REJECT can be read rather than re-derived
        issues: (r.hard_issues ?? []).map((i: any) => ({ rule: i.rule, detected: i.detected })),
      })),
      // Two reports per client is the deliverable, so "delivered" means both.
      delivery: (() => {
        const roster = existsSync(ROSTER_PATH) ? readFileSync(ROSTER_PATH, "utf8") : "";
        const slugs = [...roster.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);
        // read off the folders, not the log: see reportsOnDisk
        const names = Object.fromEntries(
          [...roster.matchAll(/slug: "([^"]+)",\s*name: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
        const held = Object.fromEntries(slugs.map((sl) => [sl, reportsOnDisk(names[sl] ?? "")]));
        const both = slugs.filter((sl) => held[sl].foundation && held[sl].planetary).length;
        const some = slugs.filter((sl) => (held[sl].foundation ? 1 : 0) + (held[sl].planetary ? 1 : 0) === 1).length;
        const none = slugs.length - both - some;
        const avg = stats.length
          ? stats.reduce((a: number, r: any) => a + (r.cost_usd ?? 0), 0) / stats.length : 0;
        // Measured, not assumed: what a finished client has ACTUALLY cost,
        // averaged over the clients who have both reports. That includes any
        // regenerations, which an average-per-report doubled would miss.
        const spentPer: Record<string, { cost: number; minutes: number }> = {};
        for (const r of stats) {
          const k = r.client_slug as string;
          spentPer[k] = spentPer[k] ?? { cost: 0, minutes: 0 };
          spentPer[k].cost += r.cost_usd ?? 0;
          spentPer[k].minutes += (r.elapsed_sec ?? 0) / 60;
        }
        const finished = slugs.filter((sl) => held[sl].foundation && held[sl].planetary);
        const perClientCost = finished.length
          ? finished.reduce((a, sl) => a + (spentPer[sl]?.cost ?? 0), 0) / finished.length : 0;
        const perClientMinutes = finished.length
          ? finished.reduce((a, sl) => a + (spentPer[sl]?.minutes ?? 0), 0) / finished.length : 0;
        return {
          roster: slugs.length, both, some, none,
          perClientCost, perClientMinutes, finishedSample: finished.length,
          // an estimate, and labelled as one on the page
          remainingCost: both === slugs.length ? 0 : (none * 2 + some) * avg,
        };
      })(),
      // Which rules leak most, so the prompt can be aimed at the real problem
      failingRules: (() => {
        const fromFile = existsSync(FAILURE_LOG)
          ? readFileSync(FAILURE_LOG, "utf8").split("\n").filter(Boolean)
              .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
          : [];
        const tally: Record<string, number> = {};
        const cats: Record<string, { count: number; hard: number; soft: number; rules: Record<string, number>; clients: Set<string> }> = {};
        let withDetail = 0;
        const seenReports = new Set<string>();
        for (const f of fromFile as any[]) {
          seenReports.add(f.slug + "|" + f.report);
          tally[f.rule] = (tally[f.rule] ?? 0) + 1;
          const c = categoryOf(f.rule);
          cats[c] = cats[c] ?? { count: 0, hard: 0, soft: 0, rules: {}, clients: new Set() };
          cats[c].count++;
          (cats[c] as any)[f.severity === "soft" ? "soft" : "hard"]++;
          cats[c].rules[f.rule] = (cats[c].rules[f.rule] ?? 0) + 1;
          cats[c].clients.add(String(f.client));
        }
        withDetail = seenReports.size;
        for (const r of [] as any[]) {
          const hard = Array.isArray(r.hard_issues) ? r.hard_issues : [];
          const soft = Array.isArray(r.soft_issues) ? r.soft_issues : [];
          if (!hard.length && !soft.length) continue;
          withDetail++;
          for (const [sev, list] of [["hard", hard], ["soft", soft]] as const) {
            for (const i of list as any[]) {
              tally[i.rule] = (tally[i.rule] ?? 0) + 1;
              const c = categoryOf(i.rule);
              cats[c] = cats[c] ?? { count: 0, hard: 0, soft: 0, rules: {}, clients: new Set() };
              cats[c].count++;
              (cats[c] as any)[sev]++;
              cats[c].rules[i.rule] = (cats[c].rules[i.rule] ?? 0) + 1;
              cats[c].clients.add(String(r.client));
            }
          }
        }
        return {
          tally,
          reportsWithDetail: withDetail,
          totalReports: stats.length,
          categories: Object.entries(cats)
            .map(([name, v]) => ({
              name, count: v.count, hard: v.hard, soft: v.soft, reports: v.clients.size,
              rules: Object.entries(v.rules).sort((a, b) => b[1] - a[1]).map(([r, n]) => ({ rule: r, n })),
            }))
            .sort((a, b) => b.count - a.count),
        };
      })(),
      roster: (() => {
        const src = existsSync(ROSTER_PATH) ? readFileSync(ROSTER_PATH, "utf8") : "";
        const rows = [...src.matchAll(/id: "(HD-\d+)", slug: "([^"]+)",\s*name: "([^"]+)"/g)]
          .map((m) => ({ id: m[1], slug: m[2], name: m[3] }));
        const spent: Record<string, number> = {};
        for (const r of stats) {
          const k = r.client_slug as string;
          spent[k] = (spent[k] ?? 0) + (r.cost_usd ?? 0);
        }
        return rows.map((r) => {
          const on = reportsOnDisk(r.name);
          return {
            ...r,
            foundation: on.foundation,
            planetary: on.planetary,
            spent: spent[r.slug] ?? 0,
            // a report that predates the log has no recorded cost, which is not
            // the same as having cost nothing
            costKnown: (spent[r.slug] ?? 0) > 0,
          };
        }).sort((a, b) => a.id.localeCompare(b.id));
      })(),
      people: (() => {
        const roster = existsSync(ROSTER_PATH) ? readFileSync(ROSTER_PATH, "utf8") : "";
        const slugs = [...roster.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);
        const withReports = new Set(stats.map((r: any) => r.client_slug));
        return {
          roster: slugs.length,
          withReports: slugs.filter((sl) => withReports.has(sl)).length,
          lifetimeCost: stats.reduce((a: number, r: any) => a + (r.cost_usd ?? 0), 0),
          lifetimeReports: stats.length,
          rejectRate: stats.length
            ? stats.filter((r: any) => /REJECT/.test(String(r.validation ?? ""))).length / stats.length
            : 0,
        };
      })(),
      today: {
        reports: todays.length,
        cost: todays.reduce((a: number, r: any) => a + (r.cost_usd ?? 0), 0),
        minutes: Math.round(todays.reduce((a: number, r: any) => a + (r.elapsed_sec ?? 0), 0) / 60),
      },
      avgCost: stats.length ? stats.reduce((a: number, r: any) => a + (r.cost_usd ?? 0), 0) / stats.length : 0,
      avgMinutes: stats.length ? stats.reduce((a: number, r: any) => a + (r.elapsed_sec ?? 0), 0) / stats.length / 60 : 0,
    }));
    return;
  }
  res.writeHead(404); res.end("not found");
}).listen(PORT, () => {
  console.log(`\n  Delphi client form: http://localhost:${PORT}\n`);

  // Runs outlive this process, so on startup take back the ones still going and
  // close the books on any that ended while we were down. Without this a restart
  // leaves a live run showing "waiting" forever, which is worse than no dashboard.
  const jobs = loadJobs();
  let resumed = 0, closed = 0;
  for (const job of jobs) {
    if (job.finishedAt) continue;
    // Alive is the only test that means anything. A job from before runs kept
    // their own log has no log to follow and no pid to check, so it would sit
    // on the board saying "running" for ever.
    if (job.log && alive(job.pid)) { followRun(job, jobs); resumed++; }
    else {
      const unfinished = job.people.some((pp) =>
        Object.values(pp.steps).some((v) => v === "waiting" || v === "running"));
      job.died = unfinished;
      job.finishedAt = new Date().toISOString();
      closed++;
    }
  }
  if (resumed || closed) {
    saveJobs(jobs);
    console.log(`  picked up ${resumed} run(s) still going, closed ${closed} that ended\n`);
  }
});
