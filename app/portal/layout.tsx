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
.brand { text-decoration: none; color: var(--purple); font-weight: 600;
  font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; }
.signout { background: none; border: 0; padding: 0; cursor: pointer;
  font-family: inherit; font-size: 12.5px; color: var(--muted); }
.signout:hover { color: var(--purple); }

.wrap { max-width: 720px; margin: 0 auto; padding: 36px 20px 56px; }
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
          <Link href="/portal" className="brand">Delphi Human Design</Link>
          <form action={signOut}>
            <button type="submit" className="signout">Sign out</button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
