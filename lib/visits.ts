/**
 * Recording chart link opens and the views chosen on them, for the dashboard's
 * Visits tab. See supabase/migrations/20261011_chart_visits.sql.
 *
 * Never in a client's way: everything here runs after the response has gone,
 * and a failure is logged and dropped.
 */
import { createClient } from "@supabase/supabase-js";

export type Device = "phone" | "tablet" | "computer";

/** Link previews and scripts fetch a chart link too: a link sent in Messages
 *  is fetched by a preview robot before anyone taps it. Those are not visits. */
const NOT_A_PERSON = /bot|crawl|spider|preview|facebookexternalhit|slack|whatsapp|telegram|discord|skype|curl|wget|python|node-fetch|undici|go-http|headless|lighthouse|vercel/i;

export function isPerson(ua: string): boolean {
  return !!ua && !NOT_A_PERSON.test(ua);
}

/** From the user agent alone. An iPad asks for the desktop site and reads as a
 *  computer here; the page's own report of views tells the two apart. */
export function deviceOf(ua: string): Device {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return "phone";
  return "computer";
}

const service = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

/** Who the browser is signed in as, read from the session cookie itself.
 *  Not the auth client: asking it can renew the session, and a renewal after
 *  the response has gone never reaches the browser, which is a sign-out
 *  waiting to happen (Kaycee, 2026-10-01: "why do you keep signing me out?").
 *  Unverified, which is fine for the one thing it decides: whether an open is
 *  counted as ours. */
function userIdFrom(cookieHeader: string): string | null {
  const parts = cookieHeader.split(/;\s*/).map((c) => c.split("=")).filter(([k]) => /^sb-.*-auth-token(\.\d+)?$/.test(k ?? ""));
  if (!parts.length) return null;
  parts.sort((a, b) => Number(a[0].split(".")[1] ?? -1) - Number(b[0].split(".")[1] ?? -1));
  try {
    let raw = decodeURIComponent(parts.map((p) => p.slice(1).join("=")).join(""));
    if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64url").toString("utf8");
    const session = JSON.parse(raw);
    const payload = JSON.parse(Buffer.from(String(session.access_token).split(".")[1], "base64url").toString("utf8"));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function isOurs(cookieHeader: string): Promise<boolean> {
  const id = userIdFrom(cookieHeader);
  if (!id) return false;
  const { data } = await service().from("delphi_admins").select("user_id").eq("user_id", id).maybeSingle();
  return !!data;
}

export async function recordVisit(v: { token: string; kind: "open" | "view"; what?: string; device: Device; own: boolean }) {
  const { error } = await service().from("chart_visits").insert({
    token: v.token, kind: v.kind, what: v.what ?? null, device: v.device, own: v.own,
  });
  if (error) console.error(`chart visit ${v.token.slice(0, 6)}: not recorded: ${error.message}`);
}
