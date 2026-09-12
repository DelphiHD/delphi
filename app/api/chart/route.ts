/**
 * A chart, made on request.
 *
 * Somebody on the website gives their birth details; this casts their chart,
 * publishes it, and hands back the link. No roster entry, no laptop, no waiting
 * for Kaycee to run anything.
 *
 * The heavy lifting is the same builder that makes her clients' charts. Nothing
 * here draws a chart of its own: one builder, so a fix to hers is a fix to
 * everybody's and the two can never drift.
 *
 * What this route does NOT do is take a place name on trust. The provider's own
 * location lookup resolves it, and its answer for the timezone is what the chart
 * is cast from and what is stored. A timezone guessed from a place name is where
 * wrong charts come from.
 */

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { callerHash, callerIp, looksLikeEmail, withinLimits } from "@/lib/chart-limits";

// A chart takes about ten seconds. Pro allows five minutes; this asks for two,
// which is room for a slow provider without holding a request open all day.
export const maxDuration = 120;
export const runtime = "nodejs";

interface Body {
  name?: string;
  birthDate?: string;      // YYYY-MM-DD
  birthTime?: string;      // HH:MM, or absent when unknown
  place?: string;          // exactly as returned by /api/places
  timezone?: string;       // ditto
  timeAccuracy?: string;   // document | told | approximate | unknown
  forEmail?: string;
  event?: string | null;   // the event whose link they arrived from
}

/**
 * Events with a live registration link. Checked against this rather than
 * stored as given: the value comes from a query string a stranger controls,
 * and it is going to be the thing the teaching module trusts when it asks who
 * registered for an event. An unknown event is dropped, not recorded.
 */
const EVENTS = new Set(["bfki"]);

const ACCURACY = new Set(["document", "told", "approximate", "unknown"]);

function bad(message: string, status = 400): Response {
  return Response.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("that request was not readable");
  }

  const name = (body.name ?? "").trim();
  const birthDate = (body.birthDate ?? "").trim();
  const birthTime = (body.birthTime ?? "").trim();
  const place = (body.place ?? "").trim();
  const timezone = (body.timezone ?? "").trim();
  const timeAccuracy = (body.timeAccuracy ?? "told").trim();

  if (!name) return bad("a name is needed");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return bad("a birth date is needed, as YYYY-MM-DD");
  if (!place) return bad("a birth place is needed, chosen from the list");
  // The place and its timezone come from the provider's own lookup together. A
  // place without one means the form sent something typed rather than chosen.
  if (!timezone) return bad("that place was typed rather than chosen from the list");
  if (!ACCURACY.has(timeAccuracy)) return bad("that is not one of the birth time answers");
  if (timeAccuracy !== "unknown" && !/^\d{2}:\d{2}$/.test(birthTime)) {
    return bad("a birth time is needed, as HH:MM, unless it is unknown");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return bad("this server cannot reach the database", 500);
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Checked before anything is created and before the provider is called, so a
  // script in a loop costs a database count rather than a chart.
  const caller = callerHash(callerIp(request));
  const asked = (body.event ?? "").toString().trim().toLowerCase();
  const eventSlug = EVENTS.has(asked) ? asked : null;
  const askedFor = (body.forEmail ?? "").trim().toLowerCase() || null;
  const verdict = await withinLimits({ email: askedFor, caller }, async ({ email, caller: c, since }) => {
    const [e, i, t] = await Promise.all([
      email
        ? db.from("charts").select("id", { count: "exact", head: true }).eq("for_email", email).gte("created_at", since)
        : Promise.resolve({ count: 0 }),
      c
        ? db.from("charts").select("id", { count: "exact", head: true }).eq("request_ip_hash", c).gte("created_at", since)
        : Promise.resolve({ count: 0 }),
      db.from("charts").select("id", { count: "exact", head: true }).gte("created_at", since),
    ]);
    return { byEmail: e.count ?? 0, byCaller: i.count ?? 0, total: t.count ?? 0 };
  });
  if (!verdict.ok) {
    console.warn(`chart refused: ${verdict.reason}`);
    return Response.json({ ok: false, error: verdict.message }, { status: 429 });
  }

  // The account, made now rather than when they click something in an email.
  // Their address is the hook's whole purpose, and a signup that depends on an
  // email arriving is a signup that half of them never complete. No password:
  // they come back through a magic link when we can send one.
  const emailGiven = (body.forEmail ?? "").trim().toLowerCase();
  if (emailGiven && !looksLikeEmail(emailGiven)) {
    return bad("that email address does not look right");
  }
  let ownerId: string | null = null;
  if (emailGiven) {
    try {
      const made = await db.auth.admin.createUser({
        email: emailGiven,
        // Deliberately NOT confirmed. Anyone can type anyone's address into a
        // public form; confirming it here would let a stranger create a
        // standing account on somebody else's email. Unconfirmed, it is only a
        // place to hang their charts, and it becomes theirs the first time they
        // ask for a magic link at their own inbox.
        email_confirm: false,
        user_metadata: { full_name: name, source: "free chart" },
      });
      if (made.data.user) ownerId = made.data.user.id;
      // Already here: this is somebody's second chart, or a client Kaycee
      // already knows. Find them rather than refusing them.
      if (!ownerId && made.error) {
        const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
        ownerId = list?.users.find((u) => (u.email ?? "").toLowerCase() === emailGiven)?.id ?? null;
      }
    } catch {
      // An account that cannot be made must not cost somebody their chart.
      ownerId = null;
    }
  }

  // 32 hex characters, the same shape every existing link has.
  const token = randomBytes(16).toString("hex");
  const storagePath = `${token}.html`;

  // client_charts first: charts points at it, and a chart with no link is a
  // chart nobody can open.
  const { error: linkErr } = await db.from("client_charts").insert({
    token,
    client_slug: token,
    client_name: name,
    storage_path: storagePath,
  });
  if (linkErr) return bad(`could not reserve a link: ${linkErr.message}`, 500);

  const { error: chartErr } = await db.from("charts").insert({
    owner_id: ownerId,
    person_name: name,
    birth_date: birthDate,
    birth_time: timeAccuracy === "unknown" ? null : birthTime,
    birth_place: place,
    birth_timezone: timezone,
    time_accuracy: timeAccuracy,
    tier: "free",
    token,
    request_ip_hash: caller,
    source: eventSlug,
    for_email: body.forEmail?.trim() || null,
  });
  if (chartErr) {
    await db.from("client_charts").delete().eq("token", token);
    return bad(`could not record the chart: ${chartErr.message}`, 500);
  }

  try {
    // Imported here rather than at the top of the file: the builder is a large
    // module, and a request that fails validation should not pay to load it.
    const { runBuilder } = await import("@/scripts/energy-flow-diagram");
    await runBuilder(["--token", token, "--publish", "--no-png"]);
  } catch (e) {
    // A chart that failed to build must not leave a link that opens nothing.
    await db.from("charts").delete().eq("token", token);
    await db.from("client_charts").delete().eq("token", token);
    return bad(`the chart could not be drawn: ${e instanceof Error ? e.message : e}`, 500);
  }

  // The link, in their inbox, so closing the tab does not lose the chart. This
  // happens after the chart exists and cannot undo it: mail is a convenience on
  // top of something they are already looking at.
  const chartUrl = `https://charts.delphihd.com/c/${token}`;
  let emailed = false;
  if (emailGiven) {
    const { sendChartEmail } = await import("@/lib/email");
    const sent = await sendChartEmail({ to: emailGiven, name, url: chartUrl });
    emailed = sent.sent;
    if (!sent.sent && sent.reason) console.warn(`chart ${token}: not emailed — ${sent.reason}`);
  }

  return Response.json({
    ok: true,
    token,
    url: chartUrl,
    account: !!ownerId,
    emailed,
  });
}
