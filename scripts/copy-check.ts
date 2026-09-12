/**
 * The chart can only say things Kaycee has approved.
 *
 * Four times in one morning on 2026-09-12 a sentence I had written appeared on
 * her client charts: the chart explaining its own drawing conventions, a card
 * restating its own heading, a note about how fast things move. Every one of
 * them cost her a screenshot on her phone, an airdrop, and a message telling me
 * where to find it. Kaycee: "Am I speaking to a god damned wall?" and then the
 * right question: "how are we going to stop it from happening?"
 *
 * Not by me remembering. CLAUDE.md already knows why, about em dashes: "A
 * linter must catch this; prompt-only enforcement leaks."
 *
 * So this takes every sentence a client can read out of the files that produce
 * client artifacts, and compares them against an approved list. A sentence that
 * is not on the list fails the push. Adding one is deliberate and visible: the
 * diff on docs/CLIENT_COPY.json is exactly the new words, which is the thing to
 * put in front of her rather than a wall of code.
 *
 * It cannot judge whether a sentence is good. It only guarantees no sentence
 * reaches a client without someone having looked at it.
 *
 * Run:
 *   npx tsx scripts/copy-check.ts              # check, exit 1 on anything new
 *   npx tsx scripts/copy-check.ts --approve    # bless what is there now
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

/** The files that put words in front of a client. */
const SOURCES = [
  "scripts/energy-flow-diagram.ts",  // the chart itself
  "app/chart/page.tsx",              // the form on her website
  "scripts/event-qr.ts",             // the QR card an organiser prints
  "lib/email.ts",                    // the chart email
];

const APPROVED = "docs/CLIENT_COPY.json";

/**
 * Comments are where the reasoning belongs, so they must not be mistaken for
 * copy. Block comments go first, then a // that is not inside a string.
 */
function stripComments(src: string): string {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlocks.split("\n").map((line) => {
    let quote: string | null = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === "\\") { i++; continue; }
        if (c === quote) quote = null;
      } else if (c === "'" || c === '"' || c === "`") {
        quote = c;
      } else if (c === "/" && line[i + 1] === "/") {
        return line.slice(0, i);
      }
    }
    return line;
  }).join("\n");
}

/**
 * A sentence, as opposed to a class name, a selector, a colour or a bit of
 * markup. Deliberately loose: a false positive costs one line in the approved
 * list, a false negative costs Kaycee a screenshot.
 */
function sentences(src: string): string[] {
  const out = new Set<string>();
  const re = /'([^'\\\n]{12,400})'|"([^"\\\n]{12,400})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const t = (m[1] ?? m[2]).trim();
    if (t.split(" ").length < 4) continue;
    if (/[<>{}#;:=|]/.test(t)) continue;
    if (/^[.#[\-]/.test(t)) continue;
    if (!/[a-z]{3}\s+[a-z]{2}/.test(t)) continue;
    out.add(t);
  }
  return [...out];
}

function current(): string[] {
  const all = new Set<string>();
  for (const f of SOURCES) {
    if (!existsSync(f)) continue;
    for (const s of sentences(stripComments(readFileSync(f, "utf8")))) all.add(s);
  }
  return [...all].sort();
}

function main() {
  const now = current();
  const approve = process.argv.includes("--approve");

  if (approve || !existsSync(APPROVED)) {
    writeFileSync(APPROVED, JSON.stringify({
      what: "Every sentence a client can read, approved by Kaycee. scripts/copy-check.ts fails a push on anything not listed here. Adding a line means she has seen those words.",
      updated: new Date().toISOString().slice(0, 10),
      copy: now,
    }, null, 1) + "\n");
    console.log(`${now.length} sentences approved and written to ${APPROVED}`);
    return;
  }

  const known = new Set<string>(
    (JSON.parse(readFileSync(APPROVED, "utf8")).copy ?? []) as string[],
  );
  const added = now.filter((s) => !known.has(s));
  const gone = [...known].filter((s) => !now.includes(s));

  if (!added.length) {
    console.log(`client copy: ${now.length} sentences, all approved${gone.length ? ` (${gone.length} no longer used)` : ""}`);
    return;
  }

  console.error(`\nclient copy: ${added.length} sentence(s) a client could read that Kaycee has not approved:\n`);
  for (const s of added) console.error(`  ${s}`);
  console.error(
    `\nShow her these words. If she approves them:\n` +
    `  npx tsx scripts/copy-check.ts --approve\n`,
  );
  process.exit(1);
}

main();
