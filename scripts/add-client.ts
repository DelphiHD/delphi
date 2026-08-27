// Add one client, or a batch of them, and take each all the way through:
// roster entry, folder, reports, chart, published link, Notion row.
//
// Before this the process was a handful of commands per person, remembered in
// the right order, which in practice meant opening a new chat and asking. Every
// step here already existed; this is only the order they go in.
//
//   npx tsx scripts/add-client.ts --name "Jane Doe" \
//       --born "1990-05-04 14:22" --place "Denver, Colorado, United States"
//
//   npx tsx scripts/add-client.ts                  # asks you, one at a time
//   npx tsx scripts/add-client.ts --from-notion    # everyone in Notion who has
//                                                  # birth data and no chart yet
//   npx tsx scripts/add-client.ts --file people.csv
//
// The CSV wants a header row and these columns, in any order:
//   name, birth date, birth time, birth place        (slug optional)
//
// Flags:
//   --no-reports   skip the Foundation and Planetary Overview generation
//   --no-notion    skip writing the Notion row
//   --dry-run      say what would happen, change nothing
//   --yes          do not stop to confirm (for unattended runs)
//   --redo         regenerate reports even when one is already written
//   --status X     Notion Status for new rows (default "Ready for Reports")
//
// Safe to re-run. Somebody already on the roster is picked up where they are
// rather than added twice, so a batch that died halfway can just be run again.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { createInterface } from "node:readline/promises";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { CLIENTS, clientOutputDir, type ClientBrief } from "./client-roster";

const ROSTER = "scripts/client-roster.ts";
// The Reference Files DATABASE id, which is what the REST API wants. Notion
// also exposes a data source ("collection://") id for the same table and the
// two are different; using the data source id here returns a 404 that reads
// like a permissions problem and is not one.
const NOTION_DB = "31ce3fad-caaa-80a2-8f52-cb53b3909bc5";
const STATUS_DEFAULT = "Ready for Reports";

// ── input ───────────────────────────────────────────────────────────────────

interface Incoming { name: string; birthDate: string; birthTime: string; birthPlace: string; slug?: string }

function flags(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith("--") ? (i++, next) : true;
  }
  return out;
}

/** One line of CSV, respecting quotes, because birth places carry commas. */
function csvCells(line: string): string[] {
  const cells: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function fromFile(path: string): Incoming[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error(`${path} is empty`);
  const head = csvCells(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const at = (...names: string[]) => {
    const i = head.findIndex((h) => names.includes(h));
    if (i < 0) throw new Error(`${path}: no column for ${names[0]}. Found: ${head.join(", ")}`);
    return i;
  };
  const iName = at("name", "client", "fullname");
  const iDate = at("birthdate", "date", "dob");
  const iTime = at("birthtime", "time");
  const iPlace = at("birthplace", "place", "location");
  const iSlug = head.findIndex((h) => h === "slug");
  return lines.slice(1).map((l, n) => {
    const c = csvCells(l);
    const row: Incoming = {
      name: c[iName] ?? "", birthDate: c[iDate] ?? "",
      birthTime: c[iTime] ?? "", birthPlace: c[iPlace] ?? "",
      slug: iSlug >= 0 ? c[iSlug] || undefined : undefined,
    };
    if (!row.name) throw new Error(`${path} line ${n + 2}: no name`);
    return row;
  });
}

/** Just ask. No spreadsheet, no file to save, no format to remember. Blank name
 *  ends the list. */
async function askFor(): Promise<Incoming[]> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const rows: Incoming[] = [];
  try {
    console.log("\nAdding clients. Press Return on an empty name when you are done.\n");
    for (;;) {
      const name = (await rl.question(`Name${rows.length ? " (or Return to finish)" : ""}: `)).trim();
      if (!name) break;
      const birthDate = (await rl.question("  Birth date (YYYY-MM-DD): ")).trim();
      const birthTime = (await rl.question("  Birth time (e.g. 14:22 or 2:22 pm): ")).trim();
      const birthPlace = (await rl.question("  Birth place (city, state, country): ")).trim();
      try {
        normalise({ name, birthDate, birthTime, birthPlace });
        rows.push({ name, birthDate, birthTime, birthPlace });
        console.log("  ok\n");
      } catch (e) {
        // tell her now, while she still has the birth certificate open
        console.log(`  ${e instanceof Error ? e.message : e}\n  Not added. Try that one again.\n`);
      }
    }
  } finally {
    rl.close();
  }
  return rows;
}

/** Everyone in Notion who has birth data and no chart yet. Kaycee already
 *  creates the client there, so this is the fewest keystrokes there are: fill
 *  in the birth columns on the row, run this, done. */
async function fromNotion(): Promise<Incoming[]> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is not set");
  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: JSON.stringify({ page_size: 100 }),
  });
  if (!res.ok) throw new Error(`Notion query failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const { results } = await res.json();
  const text = (p: any) => (p?.rich_text ?? []).map((t: any) => t.plain_text).join("").trim();
  const rows: Incoming[] = [];
  const incomplete: string[] = [];
  for (const page of results ?? []) {
    const p = page.properties ?? {};
    const titleParts = (p.Name?.title ?? []).map((t: any) => t.plain_text).join("").trim();
    if (!titleParts) continue;
    if (p["Bodygraph Link"]?.url) continue;                 // already has a chart
    if (/^composite/i.test(titleParts)) continue;           // not an individual
    // Notion files people "Surname, First"; the roster wants them the way round
    // a person says their own name
    const name = titleParts.includes(",")
      ? `${titleParts.split(",")[1].trim()} ${titleParts.split(",")[0].trim()}`
      : titleParts;
    const birthDate = (p["Birth Date"]?.date?.start ?? "").slice(0, 10);
    const birthTime = text(p["Birth Time"]);
    const birthPlace = text(p["Birth Place"]);
    if (!birthDate || !birthTime || !birthPlace) { incomplete.push(titleParts); continue; }
    rows.push({ name, birthDate, birthTime, birthPlace });
  }
  if (incomplete.length) {
    console.log(`\nSkipped ${incomplete.length} row(s) in Notion with no chart and incomplete birth data:`);
    incomplete.forEach((n) => console.log("  " + n));
    console.log("Fill in Birth Date, Birth Time and Birth Place on those rows and run this again.");
  }
  return rows;
}

// ── validation ──────────────────────────────────────────────────────────────

/** A time that is wrong by a couple of minutes moves the variables layer, which
 *  threads through the whole report. Better to refuse than to quietly build a
 *  chart on a typo. */
function normalise(row: Incoming): Incoming {
  const name = row.name.trim().replace(/\s+/g, " ");
  const date = row.birthDate.trim();
  let time = row.birthTime.trim();
  const place = row.birthPlace.trim().replace(/\s+/g, " ")
    .replace(/,\s*(USA|U\.S\.A\.|US|U\.S\.)$/i, ", United States")
    .replace(/,\s*UK$/i, ", United Kingdom");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${name}: birth date "${date}" is not YYYY-MM-DD`);
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(time);
  if (!m) throw new Error(`${name}: birth time "${time}" is not HH:MM`);
  let hour = +m[1];
  if (m[3]) {
    const pm = m[3].toLowerCase() === "pm";
    if (hour === 12) hour = pm ? 12 : 0; else if (pm) hour += 12;
  }
  if (hour > 23 || +m[2] > 59) throw new Error(`${name}: birth time "${time}" is not a real time`);
  time = `${String(hour).padStart(2, "0")}:${m[2]}`;
  if (Number.isNaN(new Date(`${date}T${time}:00Z`).getTime())) throw new Error(`${name}: ${date} ${time} is not a real moment`);
  if (place.split(",").filter((p) => p.trim()).length < 2) {
    throw new Error(`${name}: birth place "${place}" needs at least a city and a country, ` +
      `like "Bogota, Colombia" or "Boise, Idaho, United States"`);
  }
  return { name, birthDate: date, birthTime: time, birthPlace: place, slug: row.slug?.trim() };
}

/** The next permanent id. Sequential, never reused, and read from the roster
 *  file rather than counted, so a removed client does not free their number. */
function nextId(): string {
  const src = readFileSync(ROSTER, "utf8");
  const used = [...src.matchAll(/id: "HD-(\d+)"/g)].map((m) => parseInt(m[1], 10));
  return `HD-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0")}`;
}

function slugFor(name: string, wanted: string | undefined, taken: Set<string>): string {
  const base = (wanted || name.split(" ")[0]).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!base) throw new Error(`cannot make a slug from "${name}"`);
  if (!taken.has(base)) return base;
  // "sarah" is taken, so the next Sarah becomes "sarahg" from her surname
  const surname = (name.split(" ")[1] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const suffix of [surname.slice(0, 1), surname.slice(0, 2), surname, "2", "3", "4"]) {
    const cand = base + suffix;
    if (suffix && !taken.has(cand)) return cand;
  }
  throw new Error(`could not find a free slug for "${name}" (tried ${base}...)`);
}

// ── the roster file ─────────────────────────────────────────────────────────

/** docs/NEW_CLIENT_CHECKLIST.md, gotcha 1: the natal chart is cached and the
 *  cache wins, so correcting a birth field silently keeps casting the old chart
 *  until the cache file is deleted. Described there as the most common
 *  "my change didn't take" cause. Doing it here rather than trusting whoever is
 *  at the keyboard to remember. */
function clearChartCache(slug: string) {
  const p = `.cache/charts/${slug}.json`;
  if (existsSync(p)) { rmSync(p); console.log(`  cache     cleared ${p} so the chart is re-cast`); }
}

function addToRoster(b: ClientBrief) {
  const src = readFileSync(ROSTER, "utf8");
  const line = new RegExp(`^\\s*${b.slug}:\\s.*$`, "m").exec(src);
  if (line) {
    // already there: if any birth field differs, the entry is corrected and the
    // stale cast has to go with it
    const differs = !line[0].includes(`birthDate: "${b.birthDate}"`)
      || !line[0].includes(`birthTime: "${b.birthTime}"`)
      || !line[0].includes(`birthPlace: "${b.birthPlace}"`);
    if (differs) {
      const replacement = `  ${(b.slug + ":").padEnd(10)}{ id: "${b.id}", slug: "${b.slug}", ` +
        `name: "${b.name}", birthDate: "${b.birthDate}", ` +
        `birthTime: "${b.birthTime}", birthPlace: "${b.birthPlace}"` +
        `${b.lookupPlace ? `, lookupPlace: "${b.lookupPlace}"` : ""} },`;
      writeFileSync(ROSTER, src.replace(line[0], replacement));
      console.log("  roster    birth details changed, entry updated");
      clearChartCache(b.slug);
    }
    return;
  }
  const close = src.indexOf("\n};", src.indexOf("export const CLIENTS"));
  if (close < 0) throw new Error("could not find the end of the CLIENTS object");
  if (!b.id) b.id = nextId();
  const entry = `  ${(b.slug + ":").padEnd(10)}{ id: "${b.id}", slug: "${b.slug}", ` +
    `name: "${b.name}", birthDate: "${b.birthDate}", ` +
    `birthTime: "${b.birthTime}", birthPlace: "${b.birthPlace}" },`;
  writeFileSync(ROSTER, src.slice(0, close + 1) + entry + "\n" + src.slice(close + 1));
}

// ── running the existing steps ──────────────────────────────────────────────

function run(script: string, args: string[]): string {
  return execFileSync("./node_modules/.bin/tsx", [script, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024,
  });
}

/** There is no progress to watch for. generate-report prints "Calling Claude"
 *  and then says nothing at all until every section is written: one await, all
 *  sections inside it. Lance's Foundation was fifteen minutes of silence and
 *  perfectly healthy.
 *
 *  A quiet-output watchdog was added here on the strength of a job that looked
 *  wedged, and it was wrong twice over. The diagnosis was wrong (the check ran
 *  against the tsx wrapper, which never holds the connection, rather than the
 *  node process underneath that does), and the cure then killed healthy reports
 *  at twelve minutes and started them again from nothing, repeatedly, which is
 *  what turned an hour of work into an evening of it.
 *
 *  So: no silence timeout. Only a ceiling far beyond any real report, to catch
 *  something genuinely wedged forever. */
const QUIET_MINUTES = 0;                  // disabled: silence is normal here
/** Above anything real. Measured over 58 reports: median 17 minutes, but the
 *  slowest five ran 29, 33, 38, 51 and 54, so a 50 minute cap was cutting into
 *  healthy work. The LLM layer also retries a stalled call up to four times at
 *  20 minutes each, which is legitimately 80 minutes of trying. This exists
 *  only to stop something wedged forever, so it sits above both. */
const HARD_CAP_MINUTES = 95;

function runWatched(script: string, args: string[], label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // detached, so the child leads its own process group. tsx is a wrapper that
    // spawns the real node underneath it: killing the wrapper alone leaves that
    // one running, which is how two copies of the same report ended up racing
    // each other, the retry alongside the job it was meant to replace.
    const child = spawn("./node_modules/.bin/tsx", [script, ...args], { detached: true });
    let out = "", settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; if (quiet) clearTimeout(quiet); clearTimeout(cap); fn(); } };
    const killTree = () => {
      try { if (child.pid) process.kill(-child.pid, "SIGKILL"); }
      catch { try { child.kill("SIGKILL"); } catch { /* already gone */ } }
    };

    let quiet: NodeJS.Timeout | undefined;
    const resetQuiet = () => {
      if (!QUIET_MINUTES) return;
      clearTimeout(quiet);
      quiet = setTimeout(() => {
        killTree();
        finish(() => reject(new Error(`${label} went quiet for ${QUIET_MINUTES} minutes and was stopped`)));
      }, QUIET_MINUTES * 60_000);
    };
    const cap = setTimeout(() => {
      killTree();
      finish(() => reject(new Error(`${label} ran past ${HARD_CAP_MINUTES} minutes and was stopped`)));
    }, HARD_CAP_MINUTES * 60_000);
    resetQuiet();

    child.stdout.on("data", (d) => {
      out += d;
      resetQuiet();
      // A rejected report exits zero, so without this the validator's verdict is
      // captured and thrown away: "ok" is printed and a report Kaycee would have
      // rewritten by hand goes out looking clean. Surface the verdict as it lands.
      for (const line of String(d).split("\n")) {
        if (/Validation:|HARD failure|REJECT|em dash|⚠/.test(line)) {
          process.stdout.write(`\n            ${line.trim()}`);
        }
      }
    });
    child.stderr.on("data", (d) => { process.stderr.write(d); resetQuiet(); });
    child.on("error", (e) => finish(() => reject(e)));
    child.on("close", (code) => finish(() =>
      code === 0 ? resolve(out) : reject(new Error(`${label} exited with ${code}`))));
  });
}

/** Twice, because the failure that prompted this was transient. */
async function runWithRetry(script: string, args: string[], label: string): Promise<string> {
  try {
    return await runWatched(script, args, label);
  } catch (e) {
    console.log(`\n            ${e instanceof Error ? e.message : e} — trying once more`);
    process.stdout.write(`  ${label.padEnd(10)}retrying… `);
    return runWatched(script, args, label);
  }
}

/** A report already written is not written again. This is what makes a run that
 *  died halfway worth simply repeating. */
function hasReport(dir: string, kind: "foundation" | "planetary"): boolean {
  if (!existsSync(dir)) return false;
  const want = kind === "foundation" ? /foundation/i : /planetary/i;
  return readdirSync(dir).some((f) => f.endsWith(".md") && want.test(f));
}

/** Say so out loud when it is over, since the point is not to sit and watch. */
function announce(title: string, body: string) {
  try {
    const esc = (t: string) => t.replace(/["\\]/g, "");
    execFileSync("/usr/bin/osascript", ["-e",
      `display notification "${esc(body)}" with title "${esc(title)}" sound name "Glass"`]);
  } catch { /* a missing notification must never fail a run */ }
}

async function notionUpsert(b: ClientBrief, link: string, status: string, statusGiven: boolean) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is not set");
  const head = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
  // "Surname, First" is how she files people
  const parts = b.name.split(" ");
  const title = parts.length > 1 ? `${parts.slice(1).join(" ")}, ${parts[0]}` : b.name;

  const found = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB}/query`, {
    method: "POST", headers: head,
    body: JSON.stringify({ filter: { property: "Name", title: { equals: title } }, page_size: 1 }),
  }).then((r) => r.json());
  const existing = found?.results?.[0]?.id as string | undefined;

  const properties: Record<string, unknown> = {
    "Birth Date": { date: { start: b.birthDate } },
    "Birth Time": { rich_text: [{ text: { content: b.birthTime } }] },
    "Birth Place": { rich_text: [{ text: { content: b.birthPlace } }] },
    "Bodygraph Link": { url: link },
    "Analysis Type": { select: { name: "Individual" } },
    // the permanent id, so Notion and the roster agree on who this is even if
    // the name on the row changes later
    "Client ID": { rich_text: [{ text: { content: b.id } }] },
  };
  if (!existing) properties.Name = { title: [{ text: { content: title } }] };
  // Status is where Kaycee is with someone, not something this knows. A new row
  // needs one; a row she already has keeps hers unless it was asked for.
  if (!existing || statusGiven) properties.Status = { select: { name: status } };

  const res = existing
    ? await fetch(`https://api.notion.com/v1/pages/${existing}`, {
        method: "PATCH", headers: head, body: JSON.stringify({ properties }) })
    : await fetch("https://api.notion.com/v1/pages", {
        method: "POST", headers: head,
        body: JSON.stringify({ parent: { database_id: NOTION_DB }, properties }) });
  if (!res.ok) throw new Error(`Notion write failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return existing ? "updated" : "created";
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const f = flags(process.argv.slice(2));
  const dry = !!f["dry-run"];
  const doReports = !f["no-reports"];
  const redo = !!f.redo;
  const doNotion = !f["no-notion"];
  const status = typeof f.status === "string" ? f.status : STATUS_DEFAULT;

  let incoming: Incoming[];
  if (f["from-notion"]) {
    incoming = await fromNotion();
    if (!incoming.length) { console.log("\nNobody in Notion is waiting for a chart.\n"); return; }
  } else if (typeof f.file === "string") {
    incoming = fromFile(f.file);
  } else if (typeof f.name === "string") {
    // "1983-06-15 3:45 PM" is three words, and taking the first two threw the
    // meridiem away: David Whiting was built on 3:45 AM. Keep everything after
    // the date, so the same normalise() that handles a CSV handles this too.
    const born = typeof f.born === "string" ? f.born.trim() : "";
    const firstSpace = born.indexOf(" ");
    const d = firstSpace < 0 ? born : born.slice(0, firstSpace);
    const t = firstSpace < 0 ? "" : born.slice(firstSpace + 1).trim();
    incoming = [{
      name: f.name,
      birthDate: typeof f.date === "string" ? f.date : d ?? "",
      birthTime: typeof f.time === "string" ? f.time : t ?? "",
      birthPlace: typeof f.place === "string" ? f.place : "",
      slug: typeof f.slug === "string" ? f.slug : undefined,
    }];
  } else {
    incoming = await askFor();
    if (!incoming.length) { console.log("\nNobody entered. Nothing changed.\n"); return; }
  }

  // Validate every row before touching anything. A batch that fails on row four
  // must not leave rows one to three half-added.
  const taken = new Set(Object.keys(CLIENTS));
  const briefs: ClientBrief[] = [];
  const problems: string[] = [];
  for (const row of incoming) {
    try {
      const n = normalise(row);
      const already = Object.values(CLIENTS).find((c) => c.name.toLowerCase() === n.name.toLowerCase());
      const slug = already ? already.slug : slugFor(n.name, n.slug, taken);
      taken.add(slug);
      briefs.push({
        id: already ? already.id : "",   // filled at write time, so a failed row burns no id
        slug, name: n.name, birthDate: n.birthDate, birthTime: n.birthTime, birthPlace: n.birthPlace,
      });
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (problems.length) {
    console.error(`\nNothing was added. Fix these first:\n${problems.map((p) => "  - " + p).join("\n")}\n`);
    process.exit(1);
  }

  console.log(`\n${briefs.length} client(s) to add:`);
  for (const b of briefs) {
    console.log(`  ${b.slug.padEnd(10)} ${b.name.padEnd(22)} ${b.birthDate} ${b.birthTime}  ${b.birthPlace}` +
      (CLIENTS[b.slug] ? "   (already on the roster, picking up where it is)" : ""));
  }
  console.log(doReports
    ? `\nReports: Foundation and Planetary Overview` +
      (redo ? " will be regenerated from scratch" : ", keeping any already written") +
      " (Sonnet 4.6; roughly a dollar or two each)."
    : "\nReports: skipped (--no-reports).");
  if (dry) { console.log("\n--dry-run: nothing changed.\n"); return; }

  // Reports cost real money and the roster, the Desktop, Supabase and Notion
  // all get written to. Nothing starts until somebody says so.
  if (!f.yes && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question("\nGo ahead? (y/n) ")).trim().toLowerCase();
    rl.close();
    if (answer !== "y" && answer !== "yes") {
      console.log("\nStopped. Nothing changed.\n");
      return;
    }
  }

  const done: string[] = [], failed: string[] = [], rejected: string[] = [];
  for (const b of briefs) {
    console.log(`\n${"=".repeat(60)}\n${b.name}\n${"=".repeat(60)}`);
    try {
      addToRoster(b);
      console.log("  roster    ok");
      const dir = clientOutputDir(b);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      console.log(`  folder    ${dir}`);

      if (doReports) {
        for (const kind of ["foundation", "planetary"] as const) {
          if (!redo && hasReport(dir, kind)) {
            console.log(`  ${kind.padEnd(10)}already written, kept`);
            continue;
          }
          process.stdout.write(`  ${kind.padEnd(10)}generating… `);
          const rep = await runWithRetry("scripts/generate-report.ts", [b.slug, kind], kind);
          if (/REJECT/.test(rep)) {
            rejected.push(`${b.name} ${kind}`);
            console.log("\n  " + " ".repeat(10) + "written, but the validator REJECTED it — needs a hand-touch");
          } else {
            console.log("ok");
          }
        }
      }

      process.stdout.write("  chart     building and publishing… ");
      const out = await runWithRetry("scripts/energy-flow-diagram.ts", [b.slug, "--publish"], "chart");
      const link = /https:\/\/charts\.delphihd\.com\/c\/[a-f0-9]{32}/.exec(out)?.[0];
      if (!link) throw new Error("published but no link came back");
      console.log("ok");
      console.log(`  link      ${link}`);

      if (doNotion) {
        const what = await notionUpsert(b, link, status, typeof f.status === "string");
        console.log(`  notion    row ${what}` +
          (what === "created" || typeof f.status === "string"
            ? `, status "${status}"` : ", status left as you had it"));
      }
      done.push(`${b.name} → ${link}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  FAILED    ${msg}`);
      failed.push(`${b.name}: ${msg}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`added ${done.length}/${briefs.length}`);
  if (rejected.length) {
    console.log(`\n${rejected.length} report(s) failed validation and need a hand-touch before sending:`);
    rejected.forEach((r) => console.log("  " + r));
  }
  done.forEach((d) => console.log("  " + d));
  if (failed.length) {
    console.log(`\nfailed ${failed.length}:`);
    failed.forEach((x) => console.log("  " + x));
    console.log("\nRe-running is safe: whoever succeeded is picked up where they are.");
    process.exitCode = 1;
  }
  announce(
    failed.length || rejected.length ? "Delphi: finished with problems" : "Delphi: charts are ready",
    failed.length
      ? `${done.length} of ${briefs.length} done. ${failed.length} need a look.`
      : `${done.length} chart${done.length === 1 ? "" : "s"} published.`);
  console.log("\nTheir reads start with tomorrow's transit report, which reads the roster.\n");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
