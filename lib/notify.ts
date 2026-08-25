// macOS notification helper for background scripts (LaunchAgents).
//
// Kaycee wants to know THE MOMENT something breaks — not at 6pm when she
// notices yesterday's transit report is missing. Every scheduled script that
// can fail silently in a launchd sandbox should call notifyFailure() from
// its top-level catch so the failure surfaces in Notification Center.
//
// Uses osascript rather than a Node dependency so there's nothing to install
// and no failure mode if a package is missing. Best-effort: if osascript
// itself fails (headless CI, non-macOS), we swallow the error rather than
// mask the original failure the caller was trying to report.

import { spawnSync } from "node:child_process";

export function notifyMac(args: {
  title: string;
  subtitle?: string;
  message: string;
  // Passed through to `sound name` in AppleScript; "Basso" is the default
  // failure tone (a dull thud that's hard to ignore). "Glass" or "Ping" for
  // successes.
  sound?: string;
}): void {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const parts = [`display notification "${esc(args.message)}"`, `with title "${esc(args.title)}"`];
  if (args.subtitle) parts.push(`subtitle "${esc(args.subtitle)}"`);
  parts.push(`sound name "${esc(args.sound ?? "Basso")}"`);
  const script = parts.join(" ");
  try {
    spawnSync("osascript", ["-e", script], { stdio: "ignore" });
  } catch {
    // never let a notification failure mask the original error
  }
}

// Anthropic billing page, surfaced directly in the alert so Kaycee can top up
// without hunting. Only she can do it (billing), so pushing the link to her is
// the fastest possible resolution.
export const ANTHROPIC_BILLING_URL = "https://console.anthropic.com/settings/billing";

export function notifyFailure(scriptName: string, err: unknown): void {
  const raw = err instanceof Error ? err.message : String(err);
  // Out-of-credits is the one failure with a one-step, Kaycee-only fix: show the
  // billing link right in the notification instead of a generic error.
  if (/credit balance is too low|credit balance/i.test(raw)) {
    notifyMac({
      title: "⚠️ Delphi: Anthropic out of credits",
      subtitle: "Reports are paused until you top up",
      message: `Add credits: ${ANTHROPIC_BILLING_URL}`,
      sound: "Basso",
    });
    return;
  }
  const msg = raw.length > 200 ? raw.slice(0, 200) + "…" : raw;
  notifyMac({
    title: `⚠️ Delphi: ${scriptName} failed`,
    subtitle: "Check ~/Library/Logs for details",
    message: msg,
    sound: "Basso",
  });
}
