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
# Files the day's reads in Supabase so every chart shows them without being
# rebuilt. Runs whether or not the report was generated on this pass: a pass
# that skipped because the report already existed may still be the first pass
# since the database came back, and the push is idempotent.
push_reads() {
  ./node_modules/.bin/tsx scripts/push-transit-reads.ts --today || {
    echo "WARNING: reads were not pushed; charts will show the read they were built with"
    return 1
  }
}

DAY=$(date +%Y-%m-%d)
OUT="$HOME/Desktop/HD Reports/Transits/${DAY} - Daily Transit Report.html"
STATUS=".cache/transits/${DAY}.status"
if [ -f "$OUT" ] && [ "$(cat "$STATUS" 2>/dev/null)" = "PASS" ]; then
  echo "already generated and self-check PASSED: $OUT"
  push_reads
  exit 0
fi

./node_modules/.bin/tsx scripts/transit-report.ts || exit 1
push_reads
