#!/usr/bin/env bash
#
# eval-compliance-check.sh - Claude Code PostToolUse hook
#
# Fires after Write or Edit on agent/skill files. Runs quick structural
# checks and instructs Claude to run /eval-audit on agent files.
#
# Input: JSON on stdin with tool_input.file_path
# Output: Feedback on stdout (shown to Claude as hook feedback)
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
FAILS=""

fail() {
  FAILS="${FAILS}  FAIL: $1\n"
}

warn() {
  WARNINGS="${WARNINGS}  WARN: $1\n"
}

# --- Agent checks ---
if [ "$FILE_TYPE" = "agent" ]; then
  AGENT_NAME=$(basename "$FILE_PATH" .md)

  # 1. Structured output format (FAIL)
  if ! echo "$CONTENT" | grep -qiE 'output.*json|json.*output|status.*pass.*warn.*fail'; then
    fail "$AGENT_NAME: Missing structured output format (must include status/issues/summary JSON schema)."
  fi

  # 2. Severity definitions (FAIL)
  if ! echo "$CONTENT" | grep -qiE 'severity.*error.*warning|error.*warning.*suggestion'; then
    fail "$AGENT_NAME: Missing severity definitions (must define error/warning/suggestion)."
  fi

  # 3. Detection rules (WARN)
  if ! echo "$CONTENT" | grep -qiE '## Detect|## Check|## Rules'; then
    warn "$AGENT_NAME: Missing detection rules section."
  fi

  # 4. Scope boundaries (WARN)
  if ! echo "$CONTENT" | grep -qiE '## Ignore|handled by other'; then
    warn "$AGENT_NAME: Missing scope boundaries (what does this agent NOT check?)."
  fi

  # 5. Self-describing: must not depend on external config (FAIL)
  if echo "$CONTENT" | grep -qiE 'config.*json|review-config|config/'; then
    fail "$AGENT_NAME: References external config file. Agents must be self-describing — declare thresholds, file scope, and defaults inline."
  fi

  # 7. Skip support (WARN)
  if ! echo "$CONTENT" | grep -qiE '## Skip'; then
    warn "$AGENT_NAME: Missing ## Skip section (must define when agent is inapplicable)."
  fi

  # 6. File scope for language-specific agents (WARN)
  if echo "$CONTENT" | grep -qiE 'javascript\|typescript\|python\|ruby\|go\|rust\|java'; then
    if ! echo "$CONTENT" | grep -qiE 'scope:|\.js\b|\.ts\b|\.py\b|\.rb\b|\.go\b|\.rs\b|\.java\b|files only'; then
      warn "$AGENT_NAME: Mentions a language but doesn't declare file scope (e.g., 'Scope: *.js, *.ts files only')."
    fi
  fi

  # Always require /eval-audit after agent changes
  printf "\n"
  if [ -n "$FAILS" ]; then
    printf "$FAILS"
  fi
  if [ -n "$WARNINGS" ]; then
    printf "$WARNINGS"
  fi
  printf "\n"
  printf "  Agent file changed: $AGENT_NAME\n"
  printf "  ACTION REQUIRED: Run /eval-audit $FILE_PATH\n"
fi

# --- Skill checks ---
if [ "$FILE_TYPE" = "skill" ]; then
  SKILL_NAME=$(echo "$FILE_PATH" | sed 's|.*skills/||; s|/SKILL.md||')

  # 1. Structured steps (FAIL)
  if ! echo "$CONTENT" | grep -qE '### [0-9]+\.|## Steps'; then
    fail "$SKILL_NAME: Missing numbered steps."
  fi

  # 2. Argument parsing (WARN)
  if ! echo "$CONTENT" | grep -qiE 'argument|parse|args'; then
    warn "$SKILL_NAME: Missing argument parsing section."
  fi

  # 3. Output/report section (WARN)
  if echo "$CONTENT" | grep -qiE 'review|audit|fix'; then
    if ! echo "$CONTENT" | grep -qiE 'report|summary|output'; then
      warn "$SKILL_NAME: Review-related skill missing report/summary section."
    fi
  fi

  if [ -n "$FAILS" ] || [ -n "$WARNINGS" ]; then
    printf "\n"
    if [ -n "$FAILS" ]; then
      printf "$FAILS"
    fi
    if [ -n "$WARNINGS" ]; then
      printf "$WARNINGS"
    fi
    printf "\n"
    printf "  Run /eval-audit for a full compliance report.\n"
  fi
fi

exit 0
