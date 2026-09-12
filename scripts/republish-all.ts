/**
 * Rebuild and republish every chart, so none is left on an older version.
 *
 * A chart is a baked file. Changing the builder changes nothing that is already
 * published, and refreshing cannot help: the file behind the link is whatever
 * it was when it was made. That is fine for a handful of charts and quietly
 * wrong for a roster, because the person holding the oldest link is the one
 * least likely to mention it.
 *
 * Built on 2026-09-12 after a day of chart changes left forty-six charts on
 * five different versions of the page.
 *
 * Sequential on purpose. Every build casts real charts, and forty-six at once
 * would be a stampede at bodygraph.com for no gain: nobody is waiting on this.
 *
 * BUILD EACH ONE THE WAY IT WAS FIRST BUILT
 *
 * The first version of this rebuilt everything by token, and for a roster chart
 * that is wrong: the builder read the token as a roster slug, minted a fresh
 * token and published to a new address. The original file, the one behind the
 * link already in somebody's inbox, was never touched. Nothing broke, but
 * thirty-seven charts reported "ok" while staying exactly as they were, and
 * thirty-seven junk link records appeared behind them.
 *
 * So the link record decides. A record whose slug is not its own token is one of
 * Kaycee's roster, and is rebuilt by that slug, which republishes over the file
 * the link already points at.
 *
 * Run:
 *   npx tsx scripts/republish-all.ts            # everything
 *   npx tsx scripts/republish-all.ts --dry-run  # list what would be rebuilt
 */

import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials are not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const { data, error } = await db()
    .from("charts")
    .select("person_name, token, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`could not list the charts: ${error.message}`);

  const links = (await db().from("client_charts").select("token, client_slug")).data ?? [];
  const slugOf = new Map(links.map((r) => [String(r.token), String(r.client_slug)]));

  const charts = (data ?? []).map((c) => {
    const slug = slugOf.get(String(c.token));
    // A roster chart is one whose link record carries a real slug rather than a
    // copy of its own token. It has to be rebuilt by that slug or the file
    // behind its existing link is left alone.
    const roster = !!slug && slug !== String(c.token);
    // The builder takes a roster slug as a bare argument and a database chart
    // behind --token. Passing the wrong one is what caused the mess this
    // comment exists because of.
    return { ...c, how: roster ? [slug!] : ["--token", String(c.token)], roster };
  });
  const rosterCount = charts.filter((c) => c.roster).length;
  console.log(`  ${rosterCount} from the roster, ${charts.length - rosterCount} from the website`);
  console.log(`${charts.length} chart(s)${dry ? " would be rebuilt" : " to rebuild"}\n`);
  if (dry) {
    for (const c of charts) console.log(`  ${String(c.person_name).padEnd(28)} ${c.how.join(" ")}`);
    return;
  }

  const { runBuilder } = await import("@/scripts/energy-flow-diagram");
  const failed: { name: string; token: string; why: string }[] = [];
  const started = Date.now();

  for (let i = 0; i < charts.length; i++) {
    const c = charts[i];
    const label = `[${String(i + 1).padStart(2)}/${charts.length}] ${String(c.person_name).slice(0, 30).padEnd(30)}`;
    const t0 = Date.now();
    try {
      await runBuilder([...c.how, "--publish", "--no-png"]);
      console.log(`${label} ok    ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      failed.push({ name: String(c.person_name), token: c.token, why });
      console.log(`${label} FAILED  ${why.slice(0, 90)}`);
    }
  }

  const mins = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\n${charts.length - failed.length} of ${charts.length} republished in ${mins} minutes`);
  if (failed.length) {
    console.log(`\n${failed.length} still on an older version:`);
    for (const f of failed) console.log(`  ${f.name.padEnd(28)} ${f.token}  ${f.why.slice(0, 80)}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
