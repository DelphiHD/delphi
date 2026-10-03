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

# This used to ask her Desktop two questions first: is today's Echoes already
# there, and is there a morning report to echo. Both answers stopped being true
# when the morning report moved to the cloud and nothing landed on the Desktop
# any more, so from 10-02 the wrapper skipped every single evening. The script
# itself asks storage now, which is the only place that knows.
exec ./node_modules/.bin/tsx scripts/evening-echoes.ts
