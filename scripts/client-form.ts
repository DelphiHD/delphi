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

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.CLIENT_FORM_PORT ?? 4321);
const JOBS_PATH = ".cache/client-jobs.json";
const REPORT_LOG = ".cache/reports/log.jsonl";
const ROSTER_PATH = "scripts/client-roster.ts";

// ── the job store ───────────────────────────────────────────────────────────
// What each submitted person is doing right now, and what it cost. Kept on disk
// so a restart does not lose the record, and so the dashboard shows the last
// run even if the page was closed while it was working.

type StepName = "roster" | "foundation" | "planetary" | "chart" | "notion";
type StepState = "waiting" | "running" | "done" | "kept" | "rejected" | "failed";

interface Person {
  name: string;
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
}

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
  .tabs { display:flex; gap:8px; margin-bottom:22px; }
  .tab { font-family:inherit; font-size:13px; font-weight:600; padding:8px 18px; border-radius:999px;
    border:1px solid var(--line); background:transparent; color:var(--purple); cursor:pointer; }
  .tab.on { background:var(--purple); border-color:var(--purple); color:#fff; }
  [hidden] { display:none !important; }
  .dash { margin-top:4px; }
  .dash h2 { font-size:11px; letter-spacing:.16em; text-transform:uppercase; opacity:.55;
    margin:22px 0 10px; font-weight:600; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(128px,1fr)); gap:10px; }
  .tile { background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px 14px; }
  .tile b { display:block; font-size:21px; font-weight:600; font-variant-numeric:tabular-nums; }
  .tile span { font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; opacity:.55; }
  .job { background:#fff; border:1px solid var(--line); border-radius:12px; padding:13px 15px; margin-bottom:10px; }
  .job > .when { font-size:11px; opacity:.5; margin-bottom:9px; }
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
<div class="tabs">
  <button type="button" class="tab on" id="tabAdd">Add a client</button>
  <button type="button" class="tab" id="tabStatus">Status</button>
  <button type="button" class="tab" id="tabMetrics">Metrics</button>
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
  <h2>Runs</h2>
  <div id="jobs"></div>
  <h2>Recent reports</h2>
  <div id="recent"></div>
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

  // ── the dashboard ────────────────────────────────────────────────────────
  var STEPS = ['roster', 'foundation', 'planetary', 'chart', 'notion'];
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function money(n) { return '$' + (n || 0).toFixed(2); }

  async function refresh() {
    var d;
    try { d = await fetch('/jobs', { cache: 'no-store' }).then(function (r) { return r.json(); }); }
    catch (e) { return; }

    document.getElementById('tiles').innerHTML =
      '<div class="tile"><b>' + d.today.reports + '</b><span>reports today</span></div>' +
      '<div class="tile"><b>' + money(d.today.cost) + '</b><span>spent today</span></div>' +
      '<div class="tile"><b>' + d.today.minutes + ' min</b><span>model time today</span></div>' +
      '<div class="tile"><b>' + money(d.avgCost) + '</b><span>average per report</span></div>' +
      '<div class="tile"><b>' + Math.round(d.avgMinutes) + ' min</b><span>average per report</span></div>';

    document.getElementById('jobs').innerHTML = d.jobs.length ? d.jobs.map(function (j) {
      var when = new Date(j.startedAt).toLocaleString();
      return '<div class="job"><div class="when">' + esc(when) +
        (j.finishedAt ? ' &middot; finished' : ' &middot; running') + '</div>' +
        j.people.map(function (p) {
          return '<div class="who"><span class="nm">' + esc(p.name) + '</span>' +
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
      '<div class="tile"><b>' + dl.roster + '</b><span>clients on the roster</span></div>' +
      '<div class="tile"><b>' + dl.both + '</b><span>both reports written</span></div>' +
      '<div class="tile"><b>' + dl.some + '</b><span>one report only</span></div>' +
      '<div class="tile"><b>' + dl.none + '</b><span>no reports yet</span></div>' +
      '<div class="tile"><b>' + Math.round((dl.both / (dl.roster || 1)) * 100) + '%</b><span>roster delivered</span></div>';

    document.getElementById('mCost').innerHTML =
      '<div class="tile"><b>' + money(d.people.lifetimeCost) + '</b><span>spent all time</span></div>' +
      '<div class="tile"><b>' + money(d.today.cost) + '</b><span>spent today</span></div>' +
      '<div class="tile"><b>' + money(d.avgCost) + '</b><span>per report</span></div>' +
      '<div class="tile"><b>' + money(d.avgCost * 2) + '</b><span>per client</span></div>' +
      '<div class="tile"><b>' + money(dl.remainingCost) + '</b><span>to finish the roster</span></div>';

    document.getElementById('mQuality').innerHTML =
      '<div class="tile"><b>' + d.people.lifetimeReports + '</b><span>reports written</span></div>' +
      '<div class="tile"><b>' + Math.round(d.people.rejectRate * 100) + '%</b><span>rejected by the validator</span></div>' +
      '<div class="tile"><b>' + Math.round(d.avgMinutes) + ' min</b><span>average to write</span></div>' +
      '<div class="tile"><b>' + Math.round(d.avgMinutes * 2) + ' min</b><span>per client</span></div>';

    var fr = d.failingRules, rules = Object.keys(fr.tally).sort(function (a, b) { return fr.tally[b] - fr.tally[a]; });
    document.getElementById('mRules').innerHTML = rules.length
      ? '<table class="rep"><thead><tr><th>rule</th><th>times</th></tr></thead><tbody>' +
        rules.map(function (k) {
          return '<tr><td>' + esc(k) + '</td><td>' + fr.tally[k] + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="sub" style="margin-top:10px">From ' + fr.reportsWithDetail + ' of ' +
        fr.totalReports + ' reports. Reasons are only recorded for reports written after 27 Aug 2026.</p>'
      : '<div class="tile"><span>No failure reasons recorded yet. Reports written from now on log them, ' +
        'so this fills in as reports are generated.</span></div>';

    document.getElementById('recent').innerHTML = d.recent.length
      ? '<table class="rep"><thead><tr><th>when</th><th>client</th><th>report</th>' +
        '<th>cost</th><th>min</th><th>words</th><th>validator</th></tr></thead><tbody>' +
        d.recent.map(function (r) {
          var bad = /REJECT/.test(r.validation || '');
          return '<tr><td>' + esc(new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) +
            '</td><td>' + esc(r.client) + '</td><td>' + esc(r.kind) + '</td><td>' + money(r.cost) +
            '</td><td>' + r.minutes + '</td><td>' + (r.words || '').toLocaleString() +
              '</td><td class="' + (bad ? 'bad' : '') + '"' + (bad ? ' title="' + esc(
                (r.issues && r.issues.length)
                  ? r.issues.map(function (i) {
                      return i.rule + (i.detected ? ': ' + i.detected.slice(0, 110) : '');
                    }).join(String.fromCharCode(10) + String.fromCharCode(10))
                  : 'Reasons were not recorded for this report. Reports written from now on log them.') + '"' : '') +
              '>' + (bad ? 'REJECT' : 'approve') + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<div class="tile"><span>No reports yet.</span></div>';
  }
  refresh();
  setInterval(refresh, 5000);

  var VIEWS = { add: 'viewAdd', status: 'dash', metrics: 'metrics' };
  var TABS = { add: 'tabAdd', status: 'tabStatus', metrics: 'tabMetrics' };
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
      const child = spawn("./node_modules/.bin/tsx", args, { cwd: process.cwd() });
      let pending = "";
      const consume = (d: Buffer) => {
        res.write(d);
        pending += d.toString();
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        // the job was seeded from the form, so match names rather than create
        for (const l of lines) {
          const named = job.people.find((p) => l.trim() === p.name);
          if (named) { job.people = [...job.people.filter((x) => x !== named), named]; continue; }
          applyLine(job, l);
        }
        saveJobs(jobs);
      };
      child.stdout.on("data", consume);
      child.stderr.on("data", consume);
      child.on("close", (code) => {
        job.finishedAt = new Date().toISOString();
        saveJobs(jobs);
        res.write(code === 0 ? "\n\nAll done.\n" : `\n\nFinished with problems (exit ${code}).\n`);
        res.end();
      });
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
      jobs: jobs.slice(-6).reverse(),
      byClient,
      recent: stats.slice(-14).reverse().map((r: any) => ({
        at: r.timestamp, client: r.client, kind: r.report_type, cost: r.cost_usd,
        words: r.words, minutes: Math.round((r.elapsed_sec ?? 0) / 60),
        validation: r.validation,
        // the reasons, so a REJECT can be read rather than re-derived
        issues: (r.hard_issues ?? []).map((i: any) => ({ rule: i.rule, detected: i.detected })),
      })),
      // Two reports per client is the deliverable, so "delivered" means both.
      delivery: (() => {
        const roster = existsSync(ROSTER_PATH) ? readFileSync(ROSTER_PATH, "utf8") : "";
        const slugs = [...roster.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);
        const kinds: Record<string, Set<string>> = {};
        for (const r of stats) {
          const k = r.client_slug as string;
          (kinds[k] = kinds[k] ?? new Set()).add(String(r.report_type));
        }
        const both = slugs.filter((sl) => (kinds[sl]?.size ?? 0) >= 2).length;
        const some = slugs.filter((sl) => (kinds[sl]?.size ?? 0) === 1).length;
        const none = slugs.length - both - some;
        const avg = stats.length
          ? stats.reduce((a: number, r: any) => a + (r.cost_usd ?? 0), 0) / stats.length : 0;
        return { roster: slugs.length, both, some, none, remainingCost: (both === slugs.length ? 0 : (none * 2 + some) * avg) };
      })(),
      // Which rules leak most, so the prompt can be aimed at the real problem
      failingRules: (() => {
        const tally: Record<string, number> = {};
        let withDetail = 0;
        for (const r of stats) {
          if (!Array.isArray(r.hard_issues) || !r.hard_issues.length) continue;
          withDetail++;
          for (const i of r.hard_issues) tally[i.rule] = (tally[i.rule] ?? 0) + 1;
        }
        return { tally, reportsWithDetail: withDetail, totalReports: stats.length };
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
});
