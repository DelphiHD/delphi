/**
 * A written daily read, checked against the chart it is about.
 *
 * On 2026-09-07 Kaycee's read called her G center open. Her G is defined, and
 * the data line the model was given said nothing either way, so it filled the
 * gap itself. The prompt now states each center's condition outright, and this
 * catches it if a read says otherwise anyway.
 *
 * This is a factual check, not a style one: it only fires when a sentence
 * contradicts the provider's own defined / undefined answer for that person.
 */

export interface CentreFault {
  centre: string;
  claimed: "open" | "defined";
  truth: "open" | "defined";
  phrase: string;
}

/** The names a read might use for each center, including Kaycee's own. */
const ALIASES: Record<string, string[]> = {
  head: ["head"],
  ajna: ["ajna"],
  throat: ["throat"],
  g: ["g", "identity", "self"],
  heart: ["heart", "ego", "will"],
  spleen: ["spleen", "splenic"],
  sacral: ["sacral"],
  "solar plexus": ["solar plexus", "emotional"],
  root: ["root"],
};

/** Normalise "splenic center", "Solar Plexus Center" and friends to one key. */
function keyOf(name: string): string | null {
  const t = name.toLowerCase().replace(/\s*centers?\s*$/, "").trim();
  for (const [key, names] of Object.entries(ALIASES)) {
    if (names.includes(t)) return key;
  }
  return null;
}

/**
 * Every way a read says a center is open or defined. Kept deliberately narrow:
 * the phrasings the reads actually use, so a sentence about an open door or a
 * defined edge is never mistaken for a claim about a center.
 */
function claimsIn(text: string, aliases: string[]): { open: string[]; defined: string[] } {
  const open: string[] = [];
  const defined: string[] = [];
  for (const n of aliases) {
    const forms: [string, "open" | "defined"][] = [
      [`open ${n} center`, "open"],
      [`${n} center is open`, "open"],
      [`${n} center, which is open`, "open"],
      [`${n} center remains open`, "open"],
      [`their open ${n}`, "open"],
      [`her open ${n}`, "open"],
      [`his open ${n}`, "open"],
      [`defined ${n} center`, "defined"],
      [`${n} center is defined`, "defined"],
      [`${n} center, which is defined`, "defined"],
      [`${n} center is already defined`, "defined"],
      [`their defined ${n}`, "defined"],
      [`her defined ${n}`, "defined"],
      [`his defined ${n}`, "defined"],
    ];
    for (const [phrase, kind] of forms) {
      if (text.includes(phrase)) (kind === "open" ? open : defined).push(phrase);
    }
  }
  return { open, defined };
}

/**
 * Faults in one person's read. `openCentres` and `definedCentres` are the
 * provider's own lists for that person, in whatever spelling it returns.
 */
export function centreFaults(
  paragraph: string,
  openCentres: readonly string[],
  definedCentres: readonly string[],
): CentreFault[] {
  const text = paragraph.toLowerCase();
  const truth = new Map<string, "open" | "defined">();
  for (const c of openCentres) {
    const k = keyOf(c);
    if (k) truth.set(k, "open");
  }
  for (const c of definedCentres) {
    const k = keyOf(c);
    if (k) truth.set(k, "defined");
  }

  // One fault per center: "their open g center" matches several phrasings of
  // the same sentence, and reporting it three times would overstate the damage.
  const faults: CentreFault[] = [];
  for (const [key, state] of truth) {
    const { open, defined } = claimsIn(text, ALIASES[key] ?? [key]);
    const wrong = state === "defined" ? open : defined;
    if (!wrong.length) continue;
    faults.push({
      centre: key,
      claimed: state === "defined" ? "open" : "defined",
      truth: state,
      phrase: wrong.sort((a, b) => b.length - a.length)[0],
    });
  }
  return faults;
}
