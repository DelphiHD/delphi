#!/bin/sh
# Wrapper for the daily transit report, invoked by the LaunchAgent
# com.delphihd.transit-report and runnable by hand. Ensures node is on PATH
# (LaunchAgents get a minimal PATH) and runs from the repo root so @/ and
# .env.local resolve.
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1

# Idempotent, but keyed on the SELF-CHECK, not just file existence: the 7:30
# backup run skips only if the 6:00 run both produced a file AND passed its
# completeness self-check. A report that generated but came out incomplete
# (missing images, empty gate popups, etc.) has status FAIL, so the backup
# regenerates it instead of leaving the broken one. Uses the machine's local
# date, which matches TRANSIT_TZ (America/Denver) here.
DAY=$(date +%Y-%m-%d)
OUT="$HOME/Desktop/HD Reports/Transits/${DAY} - Daily Transit Report.html"
STATUS=".cache/transits/${DAY}.status"
if [ -f "$OUT" ] && [ "$(cat "$STATUS" 2>/dev/null)" = "PASS" ]; then
  echo "already generated and self-check PASSED: $OUT"
  exit 0
fi

exec ./node_modules/.bin/tsx scripts/transit-report.ts
