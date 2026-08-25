#!/bin/sh
# Wrapper for the nightly Notion -> library sync, invoked by the LaunchAgent
# com.delphihd.sync (3:30 AM, before the 5 AM health check and 6 AM reports).
# Ensures node is on PATH (LaunchAgents get a minimal PATH) and runs from the
# repo root so @/ and .env.local resolve.
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
cd "$(dirname "$0")/.." || exit 1

# Local-only for now: rebuild .cache/chunks.json (the library the reports read).
# No OpenAI embeddings, no Supabase upsert (added when the web product needs it).
# The completeness guard inside the sync holds last-good content for any page
# that came through thin and flags it to System Health/Flags.md.
export SYNC_LOCAL_ONLY=1
# Always re-read Notion on the nightly run so today's edits are picked up. The
# checkpoint/resume path is only for recovering a failed manual run mid-flight.
export SYNC_FORCE_WALK=1

exec ./node_modules/.bin/tsx scripts/sync-notion.ts
