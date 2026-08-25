// The reliable failure log. "Fail loud" only works if there is a place to see
// the failures, and that place must be more dependable than the things it
// records. So this writes to a plain local file that cannot fail as long as the
// disk works: ~/Desktop/HD Reports/System Health/Flags.md. Every product and the
// sync append here. A Notion mirror can be layered on later as a review surface,
// but this local log stays the source of truth.
//
// Two severities:
//   - "flag"     : something was off; the system handled it (held last-good,
//                  continued, skipped one item). Logged, not interrupting.
//   - "critical" : a defined broken condition. Logged AND a macOS notification.
//                  (Full-stop behavior per product is a separate, reviewed list;
//                  this module only records + alerts.)

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { notifyMac } from "./notify";

export type Severity = "flag" | "critical";

const HEALTH_DIR = resolve(homedir(), "Desktop", "HD Reports", "System Health");
const FLAGS_PATH = resolve(HEALTH_DIR, "Flags.md");

function stamp(): string {
  // Regular Node context (not a workflow), so Date is available.
  return new Date().toISOString().replace("T", " ").slice(0, 16);
}

export function logFlag(args: { product: string; severity: Severity; message: string; action?: string }): void {
  try {
    mkdirSync(HEALTH_DIR, { recursive: true });
    if (!existsSync(FLAGS_PATH)) {
      appendFileSync(
        FLAGS_PATH,
        "# System Flags and Failures\n\n" +
          "Every product and the nightly sync append here. This is the reliable record of what went wrong and what the system did about it. Newest entries are at the bottom.\n\n" +
          "Legend: WARN = handled, kept running. STOP = a critical condition (also sent a notification).\n\n",
      );
    }
    const tag = args.severity === "critical" ? "STOP " : "WARN ";
    const line = `- ${tag} ${stamp()} UTC · **${args.product}** — ${args.message}${args.action ? `  _(action: ${args.action})_` : ""}\n`;
    appendFileSync(FLAGS_PATH, line);
  } catch {
    // Logging must never throw and mask the original problem.
  }
  if (args.severity === "critical") {
    notifyMac({
      title: `Delphi: ${args.product} critical`,
      subtitle: "See HD Reports / System Health / Flags.md",
      message: args.message.length > 150 ? args.message.slice(0, 150) + "…" : args.message,
      sound: "Basso",
    });
  }
}

export { FLAGS_PATH, HEALTH_DIR };
