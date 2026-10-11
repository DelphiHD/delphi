/**
 * One pass over the kept rollback copies: the newest five per chart stay,
 * compressed; older ones go. Shows the plan first; --go does it.
 *
 * Kaycee, 2026-10-11: the copies had grown to 2.65 GB (the clean-up looked in
 * the wrong folder, and every copy was stored uncompressed) against a free
 * plan of 1.1 GB, and she is staying on the free plan until launch. She
 * approved keeping five and clearing the rest. From now on publishChart
 * stores copies compressed and clears the right folder itself; this only
 * tidies what was already there.
 *
 *   npx tsx scripts/tidy-rollbacks.ts         # the plan
 *   npx tsx scripts/tidy-rollbacks.ts --go    # do it
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { gzipSync } from "node:zlib";

const KEEP = 5;

(async () => {
  const go = process.argv.includes("--go");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: links } = await db.from("client_charts").select("token, client_name, storage_path");
  let drop = 0, squeeze = 0, before = 0, after = 0;
  const folders = new Map<string, string[]>();
  for (const l of links ?? []) {
    const sp = String(l.storage_path);
    const folder = sp.includes("/") ? sp.slice(0, sp.lastIndexOf("/")) : String(l.token);
    folders.set(folder, [...(folders.get(folder) ?? []), String(l.token)]);
  }
  for (const [folder, tokens] of folders) {
    const { data: files } = await db.storage.from("charts").list(`${folder}/versions`, { limit: 1000 });
    for (const token of tokens) {
      const mine = (files ?? []).filter((f) => f.name.startsWith(`${token}-`)).sort((a, b) => a.name.localeCompare(b.name));
      const old = mine.slice(0, Math.max(0, mine.length - KEEP)), kept = mine.slice(-KEEP);
      for (const f of mine) before += Number((f.metadata as { size?: number })?.size ?? 0);
      drop += old.length;
      if (go && old.length) await db.storage.from("charts").remove(old.map((f) => `${folder}/versions/${f.name}`));
      for (const f of kept) {
        const size = Number((f.metadata as { size?: number })?.size ?? 0);
        if (f.name.endsWith(".gz")) { after += size; continue; }
        squeeze++;
        if (!go) { after += size / 3.6; continue; }
        const path = `${folder}/versions/${f.name}`;
        const got = await db.storage.from("charts").download(path);
        if (!got.data) { console.log(`  ! could not read ${path}, left as it is`); after += size; continue; }
        const gz = gzipSync(Buffer.from(await got.data.arrayBuffer()), { level: 9 });
        const up = await db.storage.from("charts").upload(`${path}.gz`, gz, { contentType: "application/gzip", upsert: true });
        if (up.error) { console.log(`  ! could not compress ${path}: ${up.error.message}, left as it is`); after += size; continue; }
        // the compressed copy is safely stored before the original goes
        await db.storage.from("charts").remove([path]);
        after += gz.length;
      }
    }
  }
  console.log(`${go ? "Done" : "Plan"}: ${drop} older copies ${go ? "cleared" : "to clear"}, ${squeeze} kept copies ${go ? "compressed" : "to compress"}.`);
  console.log(`Rollback copies: ${(before / 1e9).toFixed(2)} GB -> about ${(after / 1e9).toFixed(2)} GB.`);
})();
