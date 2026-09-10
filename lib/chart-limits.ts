/**
 * How often the free chart may be asked for.
 *
 * The endpoint that makes a chart is the most expensive thing on the site and
 * the only one a stranger can reach: it creates an account, calls the chart
 * provider, publishes a file and sends mail. Before this it had no limit at
 * all, so a script could run it in a loop overnight and the bill, the database
 * and the sending reputation would all be hers.
 *
 * Kaycee picked a quiet limit over a captcha, so nobody filling in the form
 * ever sees a "prove you are human" step. The numbers below are chosen for the
 * way she actually works rather than for a textbook:
 *
 * PER EMAIL is tight. One person making a chart for themselves, then their
 * partner, then their mother, is normal. Ten in an hour is not a person.
 *
 * PER CALLER is deliberately loose, and this is the important one. At an event,
 * a room full of people share one wifi and therefore one address. A limit tuned
 * to stop a bot would have stopped her whole audience, which would be a far
 * worse failure than the abuse it prevented.
 *
 * TOTAL is the circuit breaker: a bot spread across many machines defeats the
 * other two, and this catches it. Set well above any real day, so if it ever
 * trips, something is genuinely wrong and worth being woken up for.
 */

import { createHash } from "node:crypto";

export const PER_EMAIL_PER_HOUR = 5;
export const PER_CALLER_PER_HOUR = 40;
export const TOTAL_PER_HOUR = 300;

export interface LimitVerdict {
  ok: boolean;
  /** What to tell the person, in their language, not the system's. */
  message?: string;
  /** What to write in the log, which is allowed to be specific. */
  reason?: string;
}

/**
 * The caller, as something countable and not as a person. An address is
 * personal data and is never stored in the clear: this only has to answer
 * "same caller as a moment ago", which a hash answers just as well.
 */
export function callerHash(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.SUPABASE_PROJECT_REF ?? "delphi";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** The caller's address, as far as Vercel is willing to say. */
export function callerIp(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    // The first entry is the client; the rest are proxies that added themselves.
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

/**
 * An address that could actually receive mail. Not a validator that argues with
 * the RFC: just enough that a chart is never sent at something which is plainly
 * not an address, because every one of those is a bounce against her domain.
 */
export function looksLikeEmail(value: string): boolean {
  const s = value.trim();
  if (s.length < 6 || s.length > 254) return false;
  if (s.includes(" ") || s.includes(",")) return false;
  const at = s.indexOf("@");
  if (at < 1 || at !== s.lastIndexOf("@")) return false;
  const domain = s.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  if (dot < 1 || dot === domain.length - 1) return false;
  // a domain ends in letters: "someone@place.1" is not a mailbox
  return /^[a-z]{2,}$/i.test(domain.slice(dot + 1));
}

type Counter = (args: { email: string | null; caller: string | null; since: string }) =>
  Promise<{ byEmail: number; byCaller: number; total: number }>;

/**
 * Whether this request may make a chart. Never throws: a limit that fails
 * closed on its own bug would take the whole hook down, and the endpoint it
 * guards is the front door of the business.
 */
export async function withinLimits(
  args: { email: string | null; caller: string | null },
  count: Counter,
): Promise<LimitVerdict> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let seen;
  try {
    seen = await count({ email: args.email, caller: args.caller, since });
  } catch (e) {
    console.warn(`chart limits: could not count, allowing — ${e instanceof Error ? e.message : e}`);
    return { ok: true };
  }

  if (args.email && seen.byEmail >= PER_EMAIL_PER_HOUR) {
    return {
      ok: false,
      reason: `email ${args.email} has made ${seen.byEmail} charts in the last hour`,
      message: "That is a lot of charts in one hour. Give it a little while and try again, or write to hello@delphihd.com and we will sort it out.",
    };
  }
  if (args.caller && seen.byCaller >= PER_CALLER_PER_HOUR) {
    return {
      ok: false,
      reason: `caller has made ${seen.byCaller} charts in the last hour`,
      message: "A lot of charts have come from this connection in the last hour. Give it a little while and try again.",
    };
  }
  if (seen.total >= TOTAL_PER_HOUR) {
    return {
      ok: false,
      reason: `${seen.total} charts made site-wide in the last hour, above the ceiling`,
      message: "Charts are unusually busy right now. Please try again shortly.",
    };
  }
  return { ok: true };
}
