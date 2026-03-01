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

  # Remove settings.json symlink
  if [ -L "$CLAUDE_DIR/settings.json" ]; then
    rm "$CLAUDE_DIR/settings.json"
    info "Removed $CLAUDE_DIR/settings.json"
  fi

  # Remove config symlink
  if [ -L "$TARGET_DIR/config" ]; then
    rm "$TARGET_DIR/config"
    info "Removed $TARGET_DIR/config"
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

# Symlink settings.json
SETTINGS_SRC="$TOOLKIT_ROOT/.claude/settings.json"
SETTINGS_DEST="$CLAUDE_DIR/settings.json"
if [ -f "$SETTINGS_SRC" ]; then
  if [ -L "$SETTINGS_DEST" ]; then
    current_target="$(readlink "$SETTINGS_DEST")"
    if [ "$current_target" = "$SETTINGS_SRC" ]; then
      info "settings.json already linked (up to date)"
    else
      rm "$SETTINGS_DEST"
      ln -s "$SETTINGS_SRC" "$SETTINGS_DEST"
      warn "settings.json was linked elsewhere — re-linked"
    fi
  elif [ -e "$SETTINGS_DEST" ]; then
    error "$SETTINGS_DEST exists and is not a symlink — skipping (move it manually)"
  else
    ln -s "$SETTINGS_SRC" "$SETTINGS_DEST"
    info "Linked .claude/settings.json"
  fi
fi

# Symlink config directory
CONFIG_SRC="$TOOLKIT_ROOT/config"
CONFIG_DEST="$TARGET_DIR/config"
if [ -d "$CONFIG_SRC" ]; then
  if [ -L "$CONFIG_DEST" ]; then
    current_target="$(readlink "$CONFIG_DEST")"
    if [ "$current_target" = "$CONFIG_SRC" ]; then
      info "config/ already linked (up to date)"
    else
      rm "$CONFIG_DEST"
      ln -s "$CONFIG_SRC" "$CONFIG_DEST"
      warn "config/ was linked elsewhere — re-linked"
    fi
  elif [ -e "$CONFIG_DEST" ]; then
    error "$CONFIG_DEST exists and is not a symlink — skipping (move it manually)"
  else
    ln -s "$CONFIG_SRC" "$CONFIG_DEST"
    info "Linked config/"
  fi
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
.claude/settings.json
config
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
echo "  /review-agent fp-review # run a single agent"
echo ""
echo "To remove: $0 $TARGET_DIR --uninstall"
