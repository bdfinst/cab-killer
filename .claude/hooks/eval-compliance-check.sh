#!/usr/bin/env bash
#
# eval-compliance-check.sh - Claude Code PostToolUse hook
#
# Fires after Write or Edit on agent/skill files. Checks whether the
# modified file follows eval system patterns for code-review agents.
#
# Input: JSON on stdin with tool_input.file_path
# Output: Warnings on stdout (shown to user as hook feedback)
# Exit 0: Always (advisory, never blocks)

set -uo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)

# Only check agent and skill files
case "$FILE_PATH" in
  */.claude/agents/*.md) FILE_TYPE="agent" ;;
  */.claude/skills/*/SKILL.md) FILE_TYPE="skill" ;;
  *) exit 0 ;;
esac

if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

CONTENT=$(cat "$FILE_PATH")
WARNINGS=""

warn() {
  WARNINGS="${WARNINGS}  [eval-audit] $1\n"
}

# --- Agent checks ---
if [ "$FILE_TYPE" = "agent" ]; then
  AGENT_NAME=$(basename "$FILE_PATH" .md)

  # Check for structured output format (all review agents should have one)
  if ! echo "$CONTENT" | grep -qiE 'output.*json|json.*output|status.*pass.*warn.*fail'; then
    warn "$AGENT_NAME: Missing structured output format. Review agents should specify JSON output schema."
  fi

  # Check for severity levels
  if ! echo "$CONTENT" | grep -qiE 'severity.*error.*warning|error.*warning.*suggestion'; then
    warn "$AGENT_NAME: Missing severity definitions. Review agents should define error/warning/suggestion levels."
  fi

  # Check for detection rules
  if ! echo "$CONTENT" | grep -qiE '## Detect|## Check|## Rules'; then
    warn "$AGENT_NAME: Missing detection rules section. Review agents should list what they detect."
  fi
fi

# --- Skill checks ---
if [ "$FILE_TYPE" = "skill" ]; then
  SKILL_NAME=$(echo "$FILE_PATH" | sed 's|.*skills/||; s|/SKILL.md||')

  # Check for structured steps
  if ! echo "$CONTENT" | grep -qE '### [0-9]+\.|## Steps'; then
    warn "$SKILL_NAME: Missing numbered steps. Skills should have structured steps for reproducibility."
  fi

  # Check for argument parsing
  if ! echo "$CONTENT" | grep -qiE 'argument|parse|args'; then
    warn "$SKILL_NAME: Missing argument parsing section."
  fi

  # Check for output/report section (review-related skills)
  if echo "$CONTENT" | grep -qiE 'review|audit|fix'; then
    if ! echo "$CONTENT" | grep -qiE 'report|summary|output'; then
      warn "$SKILL_NAME: Review-related skill missing report/summary section."
    fi
  fi
fi

# --- Output warnings ---
if [ -n "$WARNINGS" ]; then
  printf "\n"
  printf "$WARNINGS"
  printf "  Run /eval-audit for a full compliance report.\n"
fi

exit 0
