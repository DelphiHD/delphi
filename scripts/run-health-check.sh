#!/bin/sh
# Wrapper for the morning health check, invoked by the LaunchAgent
# com.delphihd.health-check and runnable by hand. Ensures node is on PATH
# (LaunchAgents get a minimal PATH) and runs from the repo root so @/ and
# .env.local resolve.
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1
exec ./node_modules/.bin/tsx scripts/health-check.ts
