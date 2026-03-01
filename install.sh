#!/usr/bin/env bash
set -euo pipefail

# cab-killer install.sh
# Symlinks shared Claude Code agents, skills, and hooks into a target project.
# Usage:
#   ./install.sh                  # installs into current directory
#   ./install.sh /path/to/project # installs into specified directory
#   ./install.sh --uninstall      # removes symlinks from current directory
#   ./install.sh /path --uninstall

TOOLKIT_ROOT="$(cd "$(dirname "$0")" && pwd)"
UNINSTALL=false
TARGET_DIR=""

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --uninstall) UNINSTALL=true ;;
    *) TARGET_DIR="$arg" ;;
  esac
done

TARGET_DIR="${TARGET_DIR:-.}"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
CLAUDE_DIR="$TARGET_DIR/.claude"

DIRS=("agents" "skills" "hooks")

# Required tools
MISSING=()
command -v jq &>/dev/null    || MISSING+=("jq (https://jqlang.github.io/jq/)")
command -v claude &>/dev/null || MISSING+=("claude (https://docs.anthropic.com/en/docs/claude-code)")

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "Error: missing required tools:"
  for tool in "${MISSING[@]}"; do
    echo "  - $tool"
  done
  exit 1
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

# ------------------------------------------------------------------
# Uninstall
# ------------------------------------------------------------------
if $UNINSTALL; then
  echo "Removing cab-killer symlinks from $TARGET_DIR"
  for dir in "${DIRS[@]}"; do
    link="$CLAUDE_DIR/$dir"
    if [ -L "$link" ]; then
      rm "$link"
      info "Removed $link"
    else
      warn "Not a symlink (skipped): $link"
    fi
  done

  # Remove cab-killer hooks from settings.json
  SETTINGS="$CLAUDE_DIR/settings.json"
  if [ -f "$SETTINGS" ]; then
    # Remove hooks whose command starts with .claude/hooks/ (cab-killer hooks)
    UPDATED=$(jq '
      if .hooks.PostToolUse then
        .hooks.PostToolUse |= map(
          .hooks |= map(select(.command | startswith(".claude/hooks/") | not))
        ) |
        .hooks.PostToolUse |= map(select(.hooks | length > 0))
      else . end
    ' "$SETTINGS")

    # If PostToolUse is now empty, remove it; if hooks is empty, remove it
    UPDATED=$(echo "$UPDATED" | jq '
      if .hooks.PostToolUse and (.hooks.PostToolUse | length) == 0 then del(.hooks.PostToolUse) else . end |
      if .hooks and (.hooks | length) == 0 then del(.hooks) else . end
    ')

    # If the whole file is now {}, remove it
    if [ "$(echo "$UPDATED" | jq -c '.')" = "{}" ]; then
      rm "$SETTINGS"
      info "Removed empty settings.json"
    else
      echo "$UPDATED" > "$SETTINGS"
      info "Removed cab-killer hooks from settings.json"
    fi
  fi

  # Remove .claude dir if empty
  if [ -d "$CLAUDE_DIR" ] && [ -z "$(ls -A "$CLAUDE_DIR")" ]; then
    rmdir "$CLAUDE_DIR"
    info "Removed empty $CLAUDE_DIR"
  fi

  echo -e "\nDone. You may want to remove the <!-- cab-killer --> section from CLAUDE.md manually."
  exit 0
fi

# ------------------------------------------------------------------
# Install
# ------------------------------------------------------------------
echo "Installing cab-killer into $TARGET_DIR"
echo "Toolkit source: $TOOLKIT_ROOT"
echo ""

# Prevent installing into the toolkit repo itself
if [ "$TARGET_DIR" = "$TOOLKIT_ROOT" ]; then
  error "Cannot install into the toolkit repo itself"
  exit 1
fi

# Verify toolkit directories exist
for dir in "${DIRS[@]}"; do
  if [ ! -d "$TOOLKIT_ROOT/.claude/$dir" ]; then
    warn "Source directory $TOOLKIT_ROOT/.claude/$dir not found — skipping"
  fi
done

# Create .claude directory
mkdir -p "$CLAUDE_DIR"

# Symlink each .claude subdirectory
for dir in "${DIRS[@]}"; do
  src="$TOOLKIT_ROOT/.claude/$dir"
  dest="$CLAUDE_DIR/$dir"

  if [ ! -d "$src" ]; then
    continue
  fi

  # If dest exists and is already a correct symlink, skip
  if [ -L "$dest" ]; then
    current_target="$(readlink "$dest")"
    if [ "$current_target" = "$src" ]; then
      info "$dir already linked (up to date)"
      continue
    else
      rm "$dest"
      warn "$dir was linked elsewhere — re-linking"
    fi
  elif [ -e "$dest" ]; then
    error "$dest exists and is not a symlink — skipping (move it manually)"
    continue
  fi

  ln -s "$src" "$dest"
  info "Linked .claude/$dir → $src"
done

# ------------------------------------------------------------------
# Merge hooks into settings.json
# ------------------------------------------------------------------
SETTINGS="$CLAUDE_DIR/settings.json"
CAB_KILLER_HOOKS='[
  {"type":"command","command":".claude/hooks/js-fp-review.sh"},
  {"type":"command","command":".claude/hooks/token-efficiency-review.sh"},
  {"type":"command","command":".claude/hooks/eval-compliance-check.sh"}
]'

if [ -f "$SETTINGS" ]; then
  # Check if our hooks are already present
  EXISTING_HOOKS=$(jq -r '
    [.hooks.PostToolUse[]?.hooks[]?.command // empty] | join(",")
  ' "$SETTINGS" 2>/dev/null || echo "")

  if echo "$EXISTING_HOOKS" | grep -q "js-fp-review.sh"; then
    info "settings.json already has cab-killer hooks (up to date)"
  else
    # Merge: find existing Edit|Write matcher or create one
    UPDATED=$(jq --argjson new_hooks "$CAB_KILLER_HOOKS" '
      if .hooks == null then .hooks = {} else . end |
      if .hooks.PostToolUse == null then .hooks.PostToolUse = [] else . end |

      # Find an existing Edit|Write matcher
      (.hooks.PostToolUse | map(.matcher) | index("Edit|Write")) as $idx |

      if $idx != null then
        # Append our hooks to the existing matcher
        .hooks.PostToolUse[$idx].hooks += $new_hooks
      else
        # Create a new matcher entry
        .hooks.PostToolUse += [{"matcher": "Edit|Write", "hooks": $new_hooks}]
      end
    ' "$SETTINGS")

    echo "$UPDATED" | jq '.' > "$SETTINGS"
    info "Merged cab-killer hooks into existing settings.json"
  fi
else
  # Create new settings.json
  jq -n --argjson hooks "$CAB_KILLER_HOOKS" '{
    hooks: {
      PostToolUse: [
        {matcher: "Edit|Write", hooks: $hooks}
      ]
    }
  }' > "$SETTINGS"
  info "Created settings.json with cab-killer hooks"
fi

# ------------------------------------------------------------------
# Update CLAUDE.md
# ------------------------------------------------------------------
CLAUDE_MD="$TARGET_DIR/CLAUDE.md"
MARKER="<!-- cab-killer -->"

if [ -f "$CLAUDE_MD" ] && grep -q "$MARKER" "$CLAUDE_MD"; then
  info "CLAUDE.md already references toolkit"
else
  cat >> "$CLAUDE_MD" <<EOF

$MARKER
## Code Review Toolkit

This project uses [cab-killer](https://github.com/your-org/cab-killer), a shared
Claude Code toolkit for automated code review.

Available skills:
- \`/code-review\` — Run all enabled review agents
- \`/review-agent <name>\` — Run a single agent (e.g., \`/review-agent security-review\`)
- \`/apply-fixes <dir>\` — Apply correction prompts with validation
- \`/eval-audit\` — Audit agents/skills/hooks for compliance
- \`/eval-runner\` — Run eval fixtures against agents and grade results

Hooks fire automatically on Write/Edit (advisory only, never block).

To update the toolkit, pull the latest from the toolkit repo and re-run install.sh.
EOF
  info "Appended toolkit section to CLAUDE.md"
fi

# ------------------------------------------------------------------
# .gitignore
# ------------------------------------------------------------------
GITIGNORE="$TARGET_DIR/.gitignore"
if [ -f "$GITIGNORE" ] && grep -q ".claude/agents" "$GITIGNORE"; then
  info ".gitignore already configured"
else
  cat >> "$GITIGNORE" <<EOF

# cab-killer symlinks (resolve to external repo)
.claude/agents
.claude/skills
.claude/hooks
EOF
  info "Added symlink paths to .gitignore"
fi

echo ""
echo -e "${GREEN}Done!${NC} Toolkit installed into $TARGET_DIR"
echo ""
echo "Next steps:"
echo "  cd $TARGET_DIR"
echo "  claude"
echo "  /code-review            # run all review agents"
echo "  /review-agent js-fp-review # run a single agent"
echo "  /eval-runner            # validate agent accuracy"
echo ""
echo "Optional: install the refactoring plugin for structural fixes:"
echo "  claude plugins install https://github.com/elifiner/refactoring"
echo ""
echo "To remove: $0 $TARGET_DIR --uninstall"
