#!/usr/bin/env bash
# Before any agent edit: a core file (see the list in .githooks/pre-push) needs
# Kaycee. Structural changes are her decision (CLAUDE.md, "Change governance");
# on 2026-08-24 one rode in unasked and broke the reports for two months.
# Keep this list in step with .githooks/pre-push.
#
# Where Claude Code shows her a prompt (default, acceptEdits, plan), it asks.
# Where it would approve on its own (auto, bypassPermissions, dontAsk), an ask
# is approved without her ever seeing it (found 2026-10-29), so it refuses.
input=$(cat)
f=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
mode=$(printf '%s' "$input" | jq -r '.permission_mode // "default"')
[ -z "$f" ] && exit 0
rel=${f#"$CLAUDE_PROJECT_DIR"/}
printf '%s\n' "$rel" | grep -qE '^(scripts/sync-notion\.ts|lib/hd/chunks-source\.ts|lib/hd/library-names\.ts|lib/retrieval/|lib/chart/datapass\.ts|lib/chart/types\.ts|lib/report/|scripts/generate-report\.ts|scripts/add-client\.ts|lib/llm/core\.ts|lib/mybodygraph\.ts|lib/transit/sky\.ts|lib/render/mandala\.ts|supabase/migrations/|\.githooks/|\.claude/settings\.json|\.claude/hooks/)' || exit 0
case "$mode" in
  default|acceptEdits|plan) decision=ask
    why="Core file: $rel. Changes here can break the sync, the reports or the charts. Allow only if Kaycee approved this change." ;;
  *) decision=deny
    why="Core file: $rel is locked in $mode mode, where nothing would ask Kaycee. Tell her what you want to change and why; to approve, she switches this session to Ask permissions and you try again." ;;
esac
jq -n --arg d "$decision" --arg w "$why" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:$d,permissionDecisionReason:$w}}'
exit 0
