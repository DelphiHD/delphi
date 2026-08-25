// Evening Echoes — the 6 PM companion to the morning transit report. It reads
// the day's collective THEMES (from that morning's report), searches world and
// public-figure news for events that echo them, has Haiku judge which genuinely
// resonate, and writes a branded, linked list.
//
// Framing is deliberate: these are RESONANCES the field is reflecting back, not
// causation. A named public figure (a head of state, a royal, a celebrity)
// visibly living a gate theme is a first-class example, so those are in scope
// alongside world/politics.
//
// Keyless news via GDELT. Two Haiku 4.5 calls (derive themes + judge matches).
// Cost ~$0.02-0.05/run. Depends on the morning report existing for the date.
//
//   TRANSIT_DATE=2026-07-21 npx tsx scripts/evening-echoes.ts   # a specific day
//   npx tsx scripts/evening-echoes.ts                            # today (UTC)

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { invokeLLM } from "@/lib/llm/core";
import { gdeltSearch, type NewsArticle } from "@/lib/transit/news";

const BRAND_LOGO = "/Users/dorothygale/Desktop/Delphi Brand Assets/brand/Delphi.png";

// ── small local helpers ──────────────────────────────────────────────────────
function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}
function todayUTC(): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
// No em dashes anywhere in user-facing copy (CLAUDE.md).
function stripEmDashes(s: string): string { return s.replace(/\s*[—―]\s*/g, ", ").replace(/,\s*,/g, ","); }
function esc(s: string): string { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[m - 1]} ${d}, ${y}`;
}
// GDELT seendate "20260721T124500Z" -> "Jul 21".
function seenShort(s: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  if (!m) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}`;
}
function jsonFromModel<T>(text: string): T {
  let s = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{"); const last = s.lastIndexOf("}");
  if (first > 0 || last < s.length - 1) s = s.slice(first, last + 1);
  return JSON.parse(s) as T;
}

// ── types ────────────────────────────────────────────────────────────────────
interface Theme { label: string; gates: string; essence: string; queries: string[]; }

// When a theme's model-written queries return nothing (news phrasing rarely
// matches an esoteric theme name on the first try), fall back to a broad OR of
// the theme's own distinctive words. The judge is the quality gate, so a loose
// net here only ever helps: irrelevant hits get dropped, real echoes get a
// chance they would otherwise miss.
const STOP = new Set("and or the a an of to in for on with without over versus vs about who what is are being meets meet not yet clear their them our people systems movements collective field day today this that into than when where while both between around toward away from more most less into out up down".split(" "));
function fallbackQuery(t: Theme): string {
  const words = `${t.label} ${t.essence}`.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
  const uniq = [...new Set(words)].slice(0, 8);
  return uniq.length ? `(${uniq.join(" OR ")}) sourcelang:english` : `(${t.label.split(/\s+/)[0]}) sourcelang:english`;
}
interface KeptArticle { title: string; url: string; domain: string; date: string; why: string; }
interface ThemeResult { theme: Theme; articles: KeptArticle[]; }

// ── 1. extract the theme material from the morning report ────────────────────
// Everything from "The Weather Today" up to the roster ("Who Feels It Most") is
// the collective narrative, which is exactly the theme material we search on.
function extractNarrative(md: string): string {
  const start = md.search(/^##\s.*Weather Today/im);
  const end = md.search(/^##\s.*Who Feels It Most/im);
  const from = start >= 0 ? start : 0;
  const to = end >= 0 ? end : md.search(/^---\s*$/m);
  return md.slice(from, to > from ? to : undefined).trim();
}

// ── 2. derive searchable themes (one grounded Haiku call) ────────────────────
async function deriveThemes(args: {
  date: string; narrative: string; identityMd: string; voiceMd: string; apiKey: string; ceiling: number;
}): Promise<Theme[]> {
  const system = [
    args.identityMd, args.voiceMd,
    `You turn a Human Design collective transit report into searchable news themes.`,
    `The report describes the day's COLLECTIVE field through the transiting gates. Your job: extract 4 to 6 distinct THEMES actually present in this report, and for each, write news-search queries that would surface real-world events echoing it.`,
    `Scope is world news, politics, AND prominent public figures: heads of state, royals, business leaders, celebrities. A named person publicly living a theme is one of the best examples, so include a public-figure query for most themes.`,
    `Each query is a GDELT boolean string. KEEP QUERIES BROAD so they actually return results: one core concept per query expressed as 5 to 8 synonyms joined with OR inside a single parenthesis, then sourcelang:english. Do NOT AND multiple concepts together (that returns nothing). Put multi-word phrases in double quotes. Use no other operators. Good example: (reckoning OR accountability OR investigation OR "held to account" OR exposed OR scandal OR reform) sourcelang:english`,
    `Return ONLY JSON, no prose, in this exact shape:`,
    `{"themes":[{"label":"short theme name","gates":"the gate numbers this draws from, e.g. 60, 41","essence":"one plain-language sentence naming what to look for in the news","queries":["(term OR \\"two words\\" OR term) sourcelang:english","(figure-focused terms) sourcelang:english"]}]}`,
  ].join("\n\n");
  const res = await invokeLLM(
    { model: "claude-haiku-4-5", max_tokens: 1600, system, messages: [{ role: "user", content: `Report date ${args.date}. Collective narrative:\n\n${args.narrative}` }], temperature: 0.2 },
    { apiKey: args.apiKey, hardCostCeilingCents: args.ceiling },
  );
  const parsed = jsonFromModel<{ themes: Theme[] }>(res.text);
  const themes = (parsed.themes ?? []).filter((t) => t.label && t.essence && Array.isArray(t.queries) && t.queries.length);
  console.log(`  derived ${themes.length} themes ($${(res.cost_cents / 100).toFixed(4)})`);
  return themes.slice(0, 6);
}

// ── 4. judge which candidates genuinely echo their theme (one Haiku call) ─────
async function judge(args: {
  date: string; themes: Theme[]; candidates: Map<string, NewsArticle[]>;
  identityMd: string; voiceMd: string; apiKey: string; ceiling: number;
}): Promise<ThemeResult[]> {
  // Number every candidate globally so the model can reference them compactly.
  const index: NewsArticle[] = [];
  const blocks: string[] = [];
  args.themes.forEach((t) => {
    const arts = args.candidates.get(t.label) ?? [];
    if (!arts.length) return;
    const lines = arts.map((a) => { const n = index.push(a) - 1; return `  [${n}] ${a.title} (${a.domain})`; });
    blocks.push(`THEME "${t.label}" (gates ${t.gates}) — ${t.essence}\n${lines.join("\n")}`);
  });
  if (!index.length) return args.themes.map((t) => ({ theme: t, articles: [] }));

  const system = [
    args.identityMd, args.voiceMd,
    `You are matching real news headlines to the day's Human Design collective themes for a teaching feature called Evening Echoes.`,
    `These are RESONANCES the field reflects, never causation. Be selective and honest: keep only headlines that clearly echo their theme's essence. Prefer concrete events and named public figures over vague listicles, press releases, or duplicates. Keep at most 4 per theme; a theme may keep zero.`,
    `For each kept article write "why" as ONE short sentence, in Kaycee's voice, naming the resonance with the gate theme. Never claim the transit caused the event. No em dashes.`,
    `Return ONLY JSON: {"keep":[{"n":<article number>,"theme":"<exact theme label>","why":"<one sentence>"}]}`,
  ].join("\n\n");
  const res = await invokeLLM(
    { model: "claude-haiku-4-5", max_tokens: 2200, system, messages: [{ role: "user", content: `Date ${args.date}.\n\n${blocks.join("\n\n")}` }], temperature: 0.5 },
    { apiKey: args.apiKey, hardCostCeilingCents: args.ceiling },
  );
  const parsed = jsonFromModel<{ keep: Array<{ n: number; theme: string; why: string }> }>(res.text);
  console.log(`  judge kept ${parsed.keep?.length ?? 0} of ${index.length} candidates ($${(res.cost_cents / 100).toFixed(4)})`);

  const byTheme = new Map<string, KeptArticle[]>();
  for (const k of parsed.keep ?? []) {
    const a = index[k.n];
    if (!a) continue;
    const list = byTheme.get(k.theme) ?? [];
    if (list.some((x) => x.url === a.url)) continue;
    list.push({ title: a.title, url: a.url, domain: a.domain, date: seenShort(a.seendate), why: stripEmDashes(k.why || "") });
    byTheme.set(k.theme, list);
  }
  return args.themes.map((t) => ({ theme: t, articles: (byTheme.get(t.label) ?? []).slice(0, 4) }));
}

// ── 5. render markdown + branded HTML ────────────────────────────────────────
function renderMarkdown(date: string, results: ThemeResult[]): string {
  const lines: string[] = [];
  lines.push(`# Evening Echoes`);
  lines.push(`\n**${prettyDate(date)}** · where today's collective weather showed up in the world\n`);
  lines.push(`*Delphi HD · resonances, not causation. These are events the field is reflecting back, chosen because they echo the day's transit themes.*\n`);
  lines.push(`---\n`);
  const withHits = results.filter((r) => r.articles.length);
  if (!withHits.length) { lines.push(`_No clear echoes surfaced in today's news pass._`); return stripEmDashes(lines.join("\n")); }
  for (const r of withHits) {
    lines.push(`## ${r.theme.label}  \n*Gates ${r.theme.gates} · ${r.theme.essence}*\n`);
    for (const a of r.articles) {
      lines.push(`- [${a.title}](${a.url}) — ${a.domain}${a.date ? `, ${a.date}` : ""}  \n  ${a.why}`);
    }
    lines.push("");
  }
  return stripEmDashes(lines.join("\n"));
}

function renderHtml(date: string, results: ThemeResult[]): string {
  const logo = existsSync(BRAND_LOGO) ? `data:image/png;base64,${readFileSync(BRAND_LOGO).toString("base64")}` : "";
  const withHits = results.filter((r) => r.articles.length);
  const sections = withHits.map((r) => {
    const items = r.articles.map((a) => `
      <li class="echo">
        <a class="ttl" href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>
        <span class="src">${esc(a.domain)}${a.date ? ` · ${esc(a.date)}` : ""}</span>
        <p class="why">${esc(a.why)}</p>
      </li>`).join("");
    return `
    <section class="theme">
      <h2>${esc(r.theme.label)}</h2>
      <p class="ess"><span class="gates">Gates ${esc(r.theme.gates)}</span> · ${esc(r.theme.essence)}</p>
      <ul class="echoes">${items}</ul>
    </section>`;
  }).join("\n");
  const empty = `<p class="muted">No clear echoes surfaced in today's news pass.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Evening Echoes · ${esc(date)}</title>
<style>
:root{ --purple:#845095; --purple-d:#5f3a6c; --gold:#c79a2e; --ink:#1c1320; --muted:#7a6f80; --line:#e7e0ea; --bg:#fbf9fc; --card:#ffffff; }
*{ box-sizing:border-box; }
body{ margin:0; background:var(--bg); color:var(--ink); font-family:Montserrat,"Helvetica Neue",Arial,sans-serif; line-height:1.55; }
.wrap{ max-width:900px; margin:0 auto; padding:32px 28px 80px; }
header.top{ display:flex; align-items:center; gap:18px; border-bottom:2px solid var(--purple); padding-bottom:16px; margin-bottom:8px; }
header.top img{ height:46px; width:auto; }
header.top .t{ margin-left:auto; text-align:right; }
h1{ font-size:30px; color:var(--purple); margin:14px 0 2px; letter-spacing:.3px; }
.dateline{ color:var(--muted); font-size:14px; margin:0 0 4px; }
.frame{ color:var(--muted); font-size:13px; font-style:italic; margin:0 0 8px; border-left:3px solid var(--line); padding-left:12px; }
h2{ font-size:19px; color:var(--purple); text-transform:uppercase; letter-spacing:.6px; border-bottom:1px solid var(--line); padding-bottom:6px; margin:32px 0 6px; }
.theme .ess{ color:var(--muted); font-size:13px; margin:0 0 10px; }
.theme .gates{ color:var(--purple); font-weight:600; text-transform:uppercase; letter-spacing:.4px; font-size:12px; }
ul.echoes{ list-style:none; margin:0; padding:0; }
li.echo{ background:var(--card); border:1px solid var(--line); border-left:3px solid var(--purple); border-radius:10px; padding:12px 14px; margin:0 0 10px; box-shadow:0 1px 3px rgba(90,50,100,.05); }
li.echo .ttl{ color:var(--ink); font-weight:600; font-size:15px; text-decoration:none; }
li.echo .ttl:hover{ color:var(--purple); text-decoration:underline; }
li.echo .src{ display:inline-block; margin-left:8px; color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; }
li.echo .why{ margin:6px 0 0; color:var(--ink); font-size:13.5px; }
.muted{ color:var(--muted); }
footer{ margin-top:44px; color:var(--muted); font-size:12px; text-align:center; }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    ${logo ? `<img src="${logo}" alt="Delphi HD">` : `<strong style="color:var(--purple);font-size:20px">Delphi HD</strong>`}
    <div class="t"><div class="muted">Evening Echoes</div><div class="muted">${esc(date)}</div></div>
  </header>
  <h1>Evening Echoes</h1>
  <p class="dateline">${esc(prettyDate(date))} · where today's collective weather showed up in the world</p>
  <p class="frame">Resonances, not causation. These are events the field is reflecting back, chosen because they echo the day's transit themes.</p>
  ${sections || empty}
  <footer>Delphi HD · www.delphihd.com · generated ${esc(date)}</footer>
</div>
</body>
</html>`;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const date = process.env.TRANSIT_DATE ?? todayUTC();
  console.log(`\n=== Evening Echoes, ${date} ===\n`);
  const apiKey = must("ANTHROPIC_API_KEY");
  const ceiling = Number(process.env.HARD_COST_CEILING_CENTS ?? 40);
  const root = resolve(__dirname, "..");
  const identityMd = readFileSync(resolve(root, "docs/IDENTITY.md"), "utf8");
  const voiceMd = readFileSync(resolve(root, "docs/VOICE.md"), "utf8");

  // 1. the morning report is the source of the day's themes.
  const outDir = resolve(homedir(), "Desktop", "HD Reports", "Transits");
  const morningPath = resolve(outDir, `${date} - Daily Transit Report.md`);
  if (!existsSync(morningPath)) {
    throw new Error(`morning report not found: ${morningPath}\nEvening Echoes reads the day's themes from it. Run the 6 AM transit report first.`);
  }
  const narrative = extractNarrative(readFileSync(morningPath, "utf8"));
  console.log(`Read morning themes (${Math.round(narrative.length / 1000)}k chars).`);

  // 2. themes.
  console.log(`Deriving searchable themes (Haiku 4.5)…`);
  const themes = await deriveThemes({ date, narrative, identityMd, voiceMd, apiKey, ceiling });
  for (const t of themes) console.log(`  · ${t.label} [${t.gates}] ${t.queries.length} queries`);

  // 3. news per theme (GDELT, throttled to its 1-req/5s limit).
  console.log(`\nSearching world + public-figure news…`);
  const candidates = new Map<string, NewsArticle[]>();
  for (const t of themes) {
    const bag: NewsArticle[] = [];
    for (const q of t.queries) {
      bag.push(...await gdeltSearch(q, { timespanHours: 20, maxRecords: 20 }));
      await sleep(6000);
    }
    // Safety net: no hits from the model queries, cast the broad fallback net.
    if (!bag.length) {
      bag.push(...await gdeltSearch(fallbackQuery(t), { timespanHours: 24, maxRecords: 25 }));
      await sleep(6000);
    }
    const seen = new Set<string>();
    const deduped = bag.filter((a) => { const k = a.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    candidates.set(t.label, deduped.slice(0, 18));
    console.log(`  ${t.label}: ${deduped.length} candidates${bag.length && !t.queries.length ? " (fallback)" : ""}`);
  }

  // 4. judge.
  console.log(`\nJudging which echo the themes (Haiku 4.5)…`);
  const results = await judge({ date, themes, candidates, identityMd, voiceMd, apiKey, ceiling });
  const total = results.reduce((n, r) => n + r.articles.length, 0);
  console.log(`  kept ${total} echoes across ${results.filter((r) => r.articles.length).length} themes`);

  // 5. write md + html.
  mkdirSync(outDir, { recursive: true });
  const md = renderMarkdown(date, results);
  const mdPath = resolve(outDir, `${date} - Evening Echoes.md`);
  writeFileSync(mdPath, md);
  console.log(`\n✓ ${mdPath}`);
  const htmlPath = resolve(outDir, `${date} - Evening Echoes.html`);
  writeFileSync(htmlPath, renderHtml(date, results));
  console.log(`✓ ${htmlPath}`);

  // em-dash guard (fail loud, matching the morning report's discipline).
  const dashes = (md.match(/—/g) ?? []).length;
  if (dashes) console.log(`  ⚠ ${dashes} em dash(es) slipped into the markdown`);

  // log.
  const logDir = resolve(homedir(), "Library", "Logs");
  try {
    appendFileSync(resolve(logDir, "com.delphihd.evening-echoes.log"),
      `${new Date().toISOString()}  ${date}  themes=${themes.length} echoes=${total}\n`);
  } catch { /* log is best-effort */ }

  console.log(`\nDone. ${total} echoes.\n`);
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  try {
    const { notifyFailure } = await import("../lib/notify");
    notifyFailure("Evening Echoes", e);
  } catch { /* notification best-effort */ }
  process.exit(1);
});
