/**
 * The problem reports, for working through them from here: what was written,
 * where, on what, the page's errors, and the picture saved beside it.
 *
 *   npx tsx scripts/reports.ts            # open ones (new and looking into it)
 *   npx tsx scripts/reports.ts --all
 *
 * Pictures land in .cache/reports/<id>.jpg to look at. Status, notes and
 * resolution are kept on the dashboard's Reports tab.
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

(async () => {
  const all = process.argv.includes("--all");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  let q = db.from("problem_reports").select("*").order("created_at", { ascending: true });
  if (!all) q = q.in("status", ["new", "looking"]);
  const { data, error } = await q;
  if (error) throw error;
  mkdirSync(".cache/reports", { recursive: true });
  for (const r of data ?? []) {
    const c = (r.context ?? {}) as Record<string, unknown>;
    let pic = "";
    if (r.image_path) {
      const f = await db.storage.from("charts").download(r.image_path);
      if (f.data) { pic = `.cache/reports/${r.id}.${String(r.image_path).split(".").pop()}`; writeFileSync(pic, Buffer.from(await f.data.arrayBuffer())); }
    }
    console.log(`\n── ${r.id}  ${String(r.created_at).slice(0, 16)}  [${r.status}]`);
    console.log(`${r.person} · ${[c.mode, c.view, c.transitAt].filter(Boolean).join(" · ")} · ${[c.device, c.screen].filter(Boolean).join(" ")}`);
    console.log(`from: ${r.reporter_email ?? "not signed in"}`);
    console.log(`what: ${r.what}`);
    if (Array.isArray(c.errors) && c.errors.length) console.log(`errors:\n  ${(c.errors as string[]).join("\n  ")}`);
    if (c.browser) console.log(`browser: ${c.browser}`);
    if (c.version) console.log(`site: ${c.version}`);
    if (pic) console.log(`picture: ${pic}`);
    if (r.notes) console.log(`notes: ${r.notes}`);
    if (r.resolution) console.log(`resolution: ${r.resolution}`);
  }
  console.log(`\n${(data ?? []).length} ${all ? "reports" : "open reports"}`);
})();
