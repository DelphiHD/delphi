/**
 * The journal is private: proved inside the database, as real roles.
 *
 * RLS correctness is one of the three things this project tests for real
 * (CLAUDE.md). Kaycee, 2026-10-11, on the journal: "completely private".
 *
 * Everything runs in one transaction that always ends in an error, so the
 * database rolls it back: two entries are written for two real accounts, then
 * each check acts as one of them (or as a browser not signed in) through the
 * same role and claims Supabase sets for a request. The error carries the
 * results; nothing is ever kept. The first account is an admin, so "an admin
 * cannot read a client's journal" is one of the checks.
 *
 *   npx tsx scripts/test-journal-rls.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function run(sql: string): Promise<{ ok: boolean; text: string }> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  return { ok: res.ok, text: await res.text() };
}

const SQL = `
do $$
declare
  a uuid; b uuid; ea uuid; eb uuid; n int; r jsonb := '{}'::jsonb; denied boolean;
begin
  select user_id into a from public.delphi_admins limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  insert into public.journal_entries (owner_id, kind, person, body) values (a, 'note', 'A', 'a') returning id into ea;
  insert into public.journal_entries (owner_id, kind, person, body) values (b, 'note', 'B', 'b') returning id into eb;

  -- as A (an admin)
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.journal_entries where id in (ea, eb);
  r := r || jsonb_build_object('a_sees_only_own', n = 1 and exists (select 1 from public.journal_entries where id = ea));
  update public.journal_entries set body = 'x' where id = eb; get diagnostics n = row_count;
  r := r || jsonb_build_object('a_cannot_edit_b', n = 0);
  delete from public.journal_entries where id = eb; get diagnostics n = row_count;
  r := r || jsonb_build_object('a_cannot_delete_b', n = 0);
  denied := false;
  begin insert into public.journal_entries (owner_id, kind) values (b, 'note'); exception when others then denied := true; end;
  r := r || jsonb_build_object('a_cannot_write_as_b', denied);
  update public.journal_entries set body = 'mine' where id = ea; get diagnostics n = row_count;
  r := r || jsonb_build_object('a_can_edit_own', n = 1);
  execute 'reset role';

  -- as B
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.journal_entries where id = ea;
  r := r || jsonb_build_object('b_cannot_see_a', n = 0);
  execute 'reset role';

  -- as a browser not signed in
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  denied := false;
  begin select count(*) into n from public.journal_entries; exception when others then denied := true; end;
  r := r || jsonb_build_object('anon_cannot_read', denied);
  denied := false;
  begin insert into public.journal_entries (owner_id, kind) values (a, 'note'); exception when others then denied := true; end;
  r := r || jsonb_build_object('anon_cannot_write', denied);
  execute 'reset role';

  raise exception 'JOURNAL-RLS %', r::text;   -- always: rolls everything back
end $$;`;

(async () => {
  const { text } = await run(SQL);
  const m = /JOURNAL-RLS (\{.*?\})/.exec(text.replace(/\\"/g, '"'));
  if (!m) { console.error("Could not read the result:", text.slice(0, 600)); process.exit(1); }
  const r = JSON.parse(m[1]) as Record<string, boolean>;
  let failed = 0;
  for (const [k, v] of Object.entries(r)) { console.log(`${v ? "pass" : "FAIL"}  ${k.replace(/_/g, " ")}`); if (!v) failed++; }
  if (Object.keys(r).length !== 8) { console.error("Expected 8 checks."); process.exit(1); }
  process.exit(failed ? 1 : 0);
})();
