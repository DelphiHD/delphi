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
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.CLIENT_FORM_PORT ?? 4321);

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
  };
</script></body></html>`;

function csvEscape(v: string) { return '"' + v.replace(/"/g, '""') + '"'; }

createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGE);
    return;
  }
  if (req.method === "POST" && req.url === "/run") {
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
      const args = ["scripts/add-client.ts", "--file", csv, "--yes"];
      if (!reports) args.push("--no-reports");
      const child = spawn("./node_modules/.bin/tsx", args, { cwd: process.cwd() });
      child.stdout.on("data", (d) => res.write(d));
      child.stderr.on("data", (d) => res.write(d));
      child.on("close", (code) => {
        res.write(code === 0 ? "\n\nAll done.\n" : `\n\nFinished with problems (exit ${code}).\n`);
        res.end();
      });
    });
    return;
  }
  res.writeHead(404); res.end("not found");
}).listen(PORT, () => {
  console.log(`\n  Delphi client form: http://localhost:${PORT}\n`);
});
