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
  saveJobs(jobs);
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
    if (/^ {2}(roster|folder|foundation|planetary|chart|link|notion|cache|FAILED)\b/.test(pending)) {
      applyLine(job, pending);
    }
    saveJobs(jobs);
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
    saveJobs(jobs);
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
  if (heading && !/^(added|Reports:|Nothing|Go ahead)/.test(line.trim())
      && job.people.every((p) => p.name !== line.trim())
      && /^[A-Z]/.test(line.trim()) && line.trim().split(" ").length <= 5
      && !line.includes(":")) {
    job.people.push({ name: line.trim(), steps: blankSteps() });
    return;
  }
  const idLine = /^\s{2}roster\s+.*\b(HD-\d+)\b/.exec(line);
  if (idLine && cur()) cur().id = idLine[1];
  const m = /^\s{2}(roster|folder|foundation|planetary|chart|link|notion|cache|FAILED)\s*(.*)$/.exec(line);
  if (!m || !cur()) return;
  const [, key, rest] = m;
  const p = cur();
  if (key === "link") { p.link = rest.trim(); return; }
  if (key === "FAILED") { p.error = rest.trim(); return; }
  if (key === "folder" || key === "cache") return;
  const step = key as StepName;
  if (/already written, kept/.test(rest)) p.steps[step] = "kept";
  else if (/REJECTED/.test(rest)) p.steps[step] = "rejected";
  else if (/\bok\b/.test(rest) || /row (created|updated)/.test(rest)) p.steps[step] = "done";
  else if (/generating|building|retrying/.test(rest)) p.steps[step] = "running";
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
  #rosterPick { display:grid; grid-template-columns:repeat(auto-fill,minmax(232px,1fr)); gap:2px 14px;
    background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px 14px; margin-bottom:4px;
    max-height:320px; overflow:auto; }
  #rosterPick label { display:flex; align-items:center; gap:8px; font-size:12.5px; padding:3px 0; cursor:pointer; }
  #rosterPick input { width:auto; }
  #rosterPick .rid { font-size:10px; opacity:.45; font-weight:600; letter-spacing:.05em; }
  #rosterPick .miss { color:#b3261e; font-size:10.5px; }
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
<div class="tabs">
  <button type="button" class="tab on" id="tabAdd">Add a client</button>
  <button type="button" class="tab" id="tabStatus">Status</button>
  <button type="button" class="tab" id="tabMetrics">Metrics</button>
  <button type="button" class="tab" id="tabFailures">Failures</button>
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

<h2 style="margin-top:34px">Rerun someone already on the roster</h2>
<p class="sub">Their birth details are already on file, so nothing is retyped. Both reports are written again from scratch.</p>
<div class="row" style="margin-top:0">
  <button type="button" class="ghost" id="pickNone">Clear</button>
  <button type="button" class="ghost" id="pickMissing">Select everyone missing a report</button>
</div>
<div id="rosterPick"></div>
<div class="row">
  <button type="button" class="go" id="rerunGo" disabled>Rerun selected</button>
  <span class="sub" id="rerunNote" style="margin:0"></span>
</div>
</div>

<div class="dash" id="dash" hidden>
  <h1 style="margin-bottom:2px">Status</h1>
  <p class="sub">What every submitted client is doing, and what it has cost.</p>
  <h2>Today</h2>
  <div class="tiles" id="tiles"></div>
  <h2>Running now</h2>
  <div id="live"></div>
  <h2>Runs</h2>
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

  async function refresh() {
    var d;
    try { d = await fetch('/jobs', { cache: 'no-store' }).then(function (r) { return r.json(); }); }
    catch (e) { return; }

    document.getElementById('tiles').innerHTML =
      tile(d.today.reports, 'reports today',
        'Foundation and Planetary reports finished since midnight. Counted from the report log, one entry per completed report.') +
      tile(money(d.today.cost), 'spent today',
        'What today\u2019s reports cost in Claude API charges, added up from each report\u2019s own recorded cost. Charts, publishing and Notion cost nothing.') +
      tile(d.today.minutes + ' min', 'model time today',
        'Total time the model spent writing today\u2019s reports. Wall-clock per report added together, so two reports run one after another sum to both.') +
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

    paintPicker(d.roster);
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
            '</td><td>' + esc(r.client) + '</td><td>' + esc(r.kind) + '</td><td>' + money(r.cost) +
              '</td><td>' + r.minutes + '</td><td' +
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
  // the roster picker, filled from the same data the dashboard uses
  function paintPicker(roster) {
    var box = document.getElementById('rosterPick');
    if (!box || box.dataset.filled === String(roster.length)) return;
    box.dataset.filled = String(roster.length);
    box.innerHTML = roster.map(function (r) {
      var missing = [];
      if (!r.foundation) missing.push('no foundation');
      if (!r.planetary) missing.push('no planetary');
      return '<label><input type="checkbox" value="' + esc(r.slug) + '">' +
        '<span class="rid">' + esc(r.id) + '</span>' + esc(r.name) +
        (missing.length ? ' <span class="miss">' + missing.join(', ') + '</span>' : '') + '</label>';
    }).join('');
    box.addEventListener('change', updateRerun);
  }
  function selected() {
    return [].slice.call(document.querySelectorAll('#rosterPick input:checked')).map(function (i) { return i.value; });
  }
  function updateRerun() {
    var n = selected().length;
    document.getElementById('rerunGo').disabled = n === 0;
    document.getElementById('rerunNote').textContent = n
      ? n + ' selected \u00b7 about ' + Math.round(n * 34) + ' minutes and $' + (n * 2.7).toFixed(2)
      : '';
  }
  document.getElementById('pickNone').onclick = function () {
    [].slice.call(document.querySelectorAll('#rosterPick input')).forEach(function (i) { i.checked = false; });
    updateRerun();
  };
  document.getElementById('pickMissing').onclick = function () {
    [].slice.call(document.querySelectorAll('#rosterPick label')).forEach(function (l) {
      l.querySelector('input').checked = !!l.querySelector('.miss');
    });
    updateRerun();
  };
  document.getElementById('rerunGo').onclick = async function () {
    var slugs = selected();
    if (!slugs.length) return;
    var btn = document.getElementById('rerunGo');
    btn.disabled = true; btn.textContent = 'Working\u2026';
    show('status');
    out.className = 'on'; log.textContent = ''; links.style.display = 'none'; links.innerHTML = '';
    var res = await fetch('/rerun', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slugs: slugs }),
    });
    var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
    while (true) {
      var r = await reader.read();
      if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      log.textContent = buf;
      log.scrollTop = log.scrollHeight;
    }
    btn.disabled = false; btn.textContent = 'Rerun selected';
    refresh();
  };

  refresh();
  setInterval(refresh, 5000);

  var VIEWS = { add: 'viewAdd', status: 'dash', metrics: 'metrics', failures: 'failures' };
  var TABS = { add: 'tabAdd', status: 'tabStatus', metrics: 'tabMetrics', failures: 'tabFailures' };
  function show(which) {
    Object.keys(VIEWS).forEach(function (k) {
      document.getElementById(VIEWS[k]).hidden = (k !== which);
      document.getElementById(TABS[k]).classList.toggle('on', k === which);
    });
    if (which !== 'add') refresh();
  }
  Object.keys(TABS).forEach(function (k) {
    document.getElementById(TABS[k]).onclick = function () { show(k); };
  });
  // deep links, so either view can be bookmarked on its own
  if (location.hash === '#status') show('status');
  if (location.hash === '#metrics') show('metrics');
  if (location.hash === '#failures') show('failures');

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
    if (job.finishedAt || !job.log) continue;
    if (alive(job.pid)) { followRun(job, jobs); resumed++; }
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
