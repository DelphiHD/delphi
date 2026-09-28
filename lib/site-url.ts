/**
 * The one address this site signs people in on.
 *
 * Kaycee, 2026-09-28: a magic link opened on delphi-delphihd.vercel.app and
 * failed with "PKCE code verifier not found in storage". The sign-in had begun
 * on charts.delphihd.com, and a cookie set on one host is not readable on the
 * other, so the verifier was simply not there. The cause was an environment
 * variable set 141 days ago, when the vercel.app address was all there was.
 *
 * Environment variables drift; this does not. A link always comes back to the
 * domain the client actually uses, unless we are running on localhost.
 */

export const CANONICAL_SITE = "https://charts.delphihd.com";

export function siteUrl(): string {
  const set = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  // Only honour an override that is a real Delphi address; anything else, and
  // anything empty, falls back to the canonical one.
  if (set && /^https:\/\/[a-z0-9.-]*delphihd\.com$/i.test(set)) return set;
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  return CANONICAL_SITE;
}

/** In the browser, prefer the page's own origin: it is where the cookie is. */
export function browserSiteUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return siteUrl();
}
