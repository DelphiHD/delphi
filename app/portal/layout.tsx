/**
 * The portal, in Delphi's own clothes.
 *
 * The scaffolding that created this shell dressed it in the starter theme and
 * called the product "HD Reports", which is the name of the repository, not the
 * name a client has ever seen. Everything a client looks at says Delphi Human
 * Design, in Montserrat, in her purple. This matches the chart form at /chart so
 * that signing in does not feel like arriving somewhere else.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

const CSS = `
@import url("https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap");
:root {
  --purple: #845095;
  --purple-light: #b89ac2;
  --ink: #1c1a2e;
  --muted: #6f6880;
  --gold: #f1c232;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #fff;
  font-family: Montserrat, "Helvetica Neue", Arial, sans-serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}
.pbar { border-bottom: 1px solid rgba(132, 80, 149, 0.16); }
.pbar .in {
  max-width: 720px; margin: 0 auto; padding: 16px 20px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
}
.brand img { height: 26px; width: auto; display: block; }
.brand { text-decoration: none; color: var(--purple); font-weight: 600;
  font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; }
.signout { background: none; border: 0; padding: 0; cursor: pointer;
  font-family: inherit; font-size: 12.5px; color: var(--muted); }
.signout:hover { color: var(--purple); }

.wrap { max-width: 720px; margin: 0 auto; padding: 36px 20px 56px; }
/* An account holding a family needs more than a reading column. */
.wrap.wide { width: 100%; max-width: 1040px; }
/* The radio that says which chart is you. */
.tbl td.pickcell, .tbl th.pick { width: 34px; text-align: center; padding-right: 0; }
.tbl td.pickcell input { accent-color: var(--purple); cursor: pointer; }
.fine { font-size: 12.5px; color: var(--muted); margin: 0; }

/* The sortable table, shared with the dashboard. It lived only in the
   dashboard's own page, so the first thing the portal drew with it came out
   bare. One copy, in the layout both pages sit inside. */
.find { width: 100%; font: inherit; font-size: 14px; padding: 9px 12px; margin-bottom: 10px;
  border: 1px solid rgba(132, 80, 149, 0.25); border-radius: 10px; }
.tbl { overflow-x: auto; -webkit-overflow-scrolling: touch;
  border: 1px solid rgba(132, 80, 149, 0.14); border-radius: 12px; }
.tbl table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
.tbl th { text-align: left; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase;
  color: var(--muted); font-weight: 600; padding: 9px 10px; cursor: pointer;
  white-space: nowrap; user-select: none; }
.tbl th.on { color: var(--purple); }
.tbl td { padding: 8px 10px; border-top: 1px solid rgba(132, 80, 149, 0.10); vertical-align: top; }
.tbl td a { color: var(--purple); font-weight: 600; }
.tbl .dim { color: var(--muted); }
.count { font-size: 11px; color: var(--muted); margin: 8px 2px 0; }
@media (max-width: 620px) { .hide-sm { display: none; } }
h1 { font-weight: 400; font-size: clamp(22px, 4vw, 28px); letter-spacing: 0.02em;
  margin: 0 0 8px; text-wrap: balance; }
.sub { margin: 0 0 26px; font-size: 13.5px; line-height: 1.6; color: var(--muted); }
.warn { margin: 0 0 22px; padding: 12px 14px; border-radius: 10px; font-size: 13px;
  background: rgba(132, 80, 149, 0.07); color: var(--ink); }

.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.chart {
  display: block; text-decoration: none; color: inherit;
  border: 1px solid rgba(132, 80, 149, 0.2); border-radius: 14px;
  padding: 16px 18px; transition: border-color .15s, background .15s;
}
.chart:hover { border-color: var(--purple-light); background: rgba(132, 80, 149, 0.04); }
.name { display: block; font-size: 16.5px; font-weight: 600; }
.born { display: block; margin-top: 5px; font-size: 12.5px; line-height: 1.55; color: var(--muted); }
.tier { display: inline-block; margin-top: 10px; padding: 3px 10px; border-radius: 999px;
  font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600;
  color: var(--purple); background: rgba(132, 80, 149, 0.1); }
.tier.paid { color: #7a5c07; background: rgba(241, 194, 50, 0.22); }

.empty { border: 1px dashed rgba(132, 80, 149, 0.3); border-radius: 14px;
  padding: 28px 20px; text-align: center; }
.empty p { margin: 0 0 16px; font-size: 14px; color: var(--muted); }
.go { display: inline-block; background: var(--purple); color: #fff; text-decoration: none;
  font-weight: 600; font-size: 14px; padding: 12px 26px; border-radius: 999px; }
.go:hover { background: var(--gold); color: var(--ink); }

.more { margin: 22px 0 0; font-size: 13px; }
.more a { color: var(--purple); }
.know { margin: 44px 0 0; text-align: center; font-size: 11.5px; letter-spacing: 0.12em;
  color: var(--muted); }

/* Storing charts: adding one, and saying which is yours. */
.linky { background: none; border: 0; padding: 0; cursor: pointer; font: inherit;
  font-size: 13px; color: var(--purple); text-decoration: underline; }
.linky.small { font-size: 11.5px; margin: 6px 0 0 2px; }
.linky[disabled] { opacity: .5; cursor: default; }
.addbox { border: 1px solid rgba(132, 80, 149, 0.2); border-radius: 14px;
  padding: 16px 18px; margin-top: 18px; }
.addbox label { display: block; font-size: 10.5px; letter-spacing: .1em;
  text-transform: uppercase; color: var(--muted); font-weight: 600; margin: 12px 0 4px; }
.addbox label:first-child { margin-top: 0; }
.addbox input, .addbox select { width: 100%; font: inherit; font-size: 14px;
  padding: 9px 11px; border: 1px solid rgba(132, 80, 149, 0.25); border-radius: 10px;
  background: #fff; color: var(--ink); }
.addbox .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.addbox .row { display: flex; align-items: center; gap: 14px; margin-top: 16px; }
.addbox .fine { font-size: 12px; color: var(--purple); margin: 5px 0 0; }
.addbox .places { list-style: none; margin: 5px 0 0; padding: 0;
  border: 1px solid rgba(132, 80, 149, 0.2); border-radius: 10px; overflow: hidden; }
.addbox .places button { width: 100%; text-align: left; font: inherit; font-size: 13.5px;
  padding: 8px 11px; border: 0; background: #fff; color: var(--ink); cursor: pointer; }
.addbox .places button:hover { background: rgba(132, 80, 149, 0.08); }
.addbox .go { border: 0; }
.addbox .go[disabled] { opacity: .45; }
`;

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy already turns away anyone not signed in. This is the second lock:
  // a page holding birth details should not depend on one of them.
  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header className="pbar">
        <div className="in">
          <Link href="/portal" className="brand" aria-label="Delphi Human Design">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/delphi-logo.svg" alt="Delphi Human Design" height={26} />
          </Link>
          <form action={signOut}>
            <button type="submit" className="signout">Sign out</button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
