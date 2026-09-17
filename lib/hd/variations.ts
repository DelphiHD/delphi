/**
 * A person's birth day, as the charts it holds.
 *
 * Kaycee, 2026-09-14/15 (docs/CHART_VARIATIONS_PLAN.md): every chart gets a
 * Variations view, one card per stretch of the birth day where the reading
 * changes, so anyone can see what their chart would be at other times. "It
 * helps to start understanding the pattern."
 *
 * The day is cut wherever Type, Profile, Authority, Definition, the Incarnation
 * Cross, a channel or a center changes (lib/hd/time-window.ts finds the exact
 * minutes), stretches under ten minutes fold into their neighbour, and each
 * stretch is cast once, at its middle, by the provider. The provider decides
 * every chart; this only decides which minutes to ask about.
 *
 * Same method as the workshop Stage's Sanduleak and Blavatsky cards
 * (scripts/workshop-deck.ts variationsOf).
 */

import { scanWindow } from "@/lib/hd/time-window";
import { getChart } from "@/lib/mybodygraph";

export interface Variation {
  from: string;            // "05:59"
  to: string;              // "18:05"
  type: string;
  profile: string;
  authority: string;
  definition: string;
  cross: string;
  channels: string[];      // "10-20"
  centers: string[];       // defined centers, as the provider names them
  svg: string;             // the provider's Delphi bodygraph, ids made unique
  yours?: boolean;         // holds the recorded birth time of an exact chart
}

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export async function castVariations(birth: { birthDate: string; timezone: string },
  opts: { recordedTime?: string; exact?: boolean } = {}): Promise<Variation[]> {
  const scan = await scanWindow(birth, "00:00", "23:59", { maxCasts: 80 });
  const cuts = new Set<string>(["00:00"]);
  for (const c of scan.changes) {
    if (c.kind === "property" || c.kind === "channel" || c.kind === "center") for (const sp of c.spans) cuts.add(sp.from);
  }
  // a stretch under ten minutes (one right at midnight, say) folds into its neighbour
  const starts = [...cuts].sort().filter((t, i, all) => i === 0 || (mins(all[i + 1] ?? "23:59") - mins(t)) >= 10);

  const out: Variation[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i], to = starts[i + 1] ?? "23:59";
    const c = await getChart({ ...birth, birthTime: hhmm(Math.floor((mins(from) + mins(to)) / 2)), brandedSvg: true });
    // several bodygraphs share one page, so each one's ids are its own
    const ns = `var${i}`;
    const svg = String(c.bodygraphSvg ?? "")
      .replace(/\bid="([^"]+)"/g, `id="${ns}-$1"`)
      .replace(/url\(#([^)]+)\)/g, `url(#${ns}-$1)`)
      .replace(/href="#([^"]+)"/g, `href="#${ns}-$1"`);
    out.push({
      from, to,
      type: c.type.value, profile: c.profile.value, authority: c.authority.value,
      definition: c.definition.value, cross: c.incarnationCross.value,
      channels: (c.channels ?? []).map((x) => String(x.id)),
      centers: (c.centers ?? []).filter((x) => x.defined).map((x) => String(x.name)),
      svg,
    });
  }

  // an exact chart's own time is marked; an unknown or approximate one is not,
  // because its recorded time is a placeholder, not a birth
  if (opts.exact && opts.recordedTime && /^\d{2}:\d{2}/.test(opts.recordedTime)) {
    const t = mins(opts.recordedTime.slice(0, 5));
    const hit = out.find((v, i) => t >= mins(v.from) && (i === out.length - 1 || t < mins(out[i + 1].from)));
    if (hit) hit.yours = true;
  }
  return out;
}
