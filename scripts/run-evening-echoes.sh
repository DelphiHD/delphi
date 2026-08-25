#!/bin/sh
# Wrapper for the 6 PM Evening Echoes report, invoked by the LaunchAgent
# com.delphihd.evening-echoes and runnable by hand. Mirrors run-transit-report.sh.
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1

# Pin the date to the machine's LOCAL calendar day. This matters: 6 PM local is
# already past midnight UTC, so a naive UTC "today" would point at tomorrow and
# miss this morning's transit report. The morning report is named with the same
# local day, so this lines them up.
DAY=$(date +%Y-%m-%d)
export TRANSIT_DATE="$DAY"

OUT="$HOME/Desktop/HD Reports/Transits/${DAY} - Evening Echoes.html"
if [ -f "$OUT" ]; then
  echo "already generated: $OUT"
  exit 0
fi

# Needs this morning's transit report to read the day's themes from.
MORNING="$HOME/Desktop/HD Reports/Transits/${DAY} - Daily Transit Report.md"
if [ ! -f "$MORNING" ]; then
  echo "no morning report for ${DAY}; skipping Evening Echoes (nothing to echo)."
  exit 0
fi

exec ./node_modules/.bin/tsx scripts/evening-echoes.ts
