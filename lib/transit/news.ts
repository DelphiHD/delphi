// Keyless world-news retrieval for the evening "echoes" report. Uses GDELT's
// DOC 2.0 API, which is free, needs no API key (ideal for an unattended 6 PM
// LaunchAgent run), and indexes worldwide English-language news in near real
// time. We query it once per theme and let a cheap model judge which headlines
// genuinely echo the day's transit themes.
//
// GDELT constraints we honor:
//   - Rate limit: one request every ~5s. The caller throttles between queries.
//   - Multi-word phrases must be quoted inside the boolean query ("budget cuts").
//   - On overload it returns a plain-text notice instead of JSON; we retry once.

export interface NewsArticle {
  title: string;
  url: string;
  domain: string;
  /** GDELT seendate, e.g. "20260721T124500Z". */
  seendate: string;
  country?: string;
}

const GDELT = "https://api.gdeltproject.org/api/v2/doc/doc";

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Run one GDELT article-list query. Returns recent English articles, newest
 * first, de-duplicated by title (GDELT syndicates the same story across many
 * local outlets). Never throws on a bad response, returns [] so one weak theme
 * cannot abort the whole run.
 */
export async function gdeltSearch(
  query: string,
  opts: { timespanHours?: number; maxRecords?: number } = {},
): Promise<NewsArticle[]> {
  const params = new URLSearchParams({
    query,
    mode: "ArtList",
    format: "json",
    timespan: `${opts.timespanHours ?? 20}h`,
    maxrecords: String(opts.maxRecords ?? 25),
    sort: "DateDesc",
  });
  const url = `${GDELT}?${params.toString()}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "delphi-hd-evening-echoes/1.0" } });
      const raw = await res.text();
      // Overload / malformed-query responses are plain text, not JSON.
      if (!raw.trimStart().startsWith("{")) {
        if (attempt === 0) { await new Promise((r) => setTimeout(r, 6000)); continue; }
        return [];
      }
      const data = JSON.parse(raw) as { articles?: Array<Record<string, string>> };
      const seen = new Set<string>();
      const out: NewsArticle[] = [];
      for (const a of data.articles ?? []) {
        if (a.language && a.language !== "English") continue;
        const title = (a.title ?? "").trim();
        const link = (a.url ?? "").trim();
        if (!title || !link) continue;
        const key = normTitle(title);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ title, url: link, domain: (a.domain ?? "").trim(), seendate: a.seendate ?? "", country: a.sourcecountry });
      }
      return out;
    } catch {
      if (attempt === 0) { await new Promise((r) => setTimeout(r, 6000)); continue; }
      return [];
    }
  }
  return [];
}
