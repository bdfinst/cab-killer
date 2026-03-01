#!/usr/bin/env bash
#
# install.sh — Install cab-killer and optional companion plugins
#
# Usage:
#   ./install.sh                    Install cab-killer only
#   ./install.sh --with-refactoring Also install the refactoring plugin
#   ./install.sh --help             Show usage
#
set -euo pipefail

REPO_URL="https://github.com/bdfinst/cab-killer"
REFACTORING_URL="https://github.com/elifiner/refactoring"
WITH_REFACTORING=false

usage() {
  cat <<'USAGE'
Usage: ./install.sh [OPTIONS]

Install cab-killer as a Claude Code plugin.

Options:
  --with-refactoring  Also install the refactoring plugin for legacy code
  --help              Show this help message

Examples:
  ./install.sh
  ./install.sh --with-refactoring
  curl -fsSL https://raw.githubusercontent.com/bdfinst/cab-killer/main/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/bdfinst/cab-killer/main/install.sh | bash -s -- --with-refactoring
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --with-refactoring) WITH_REFACTORING=true ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $arg"; usage; exit 1 ;;
  esac
done

# Check for claude CLI
if ! command -v claude &>/dev/null; then
  echo "Error: 'claude' CLI not found. Install Claude Code first:"
  echo "  https://docs.anthropic.com/en/docs/claude-code"
  exit 1
fi

echo "Installing cab-killer..."
if claude plugin install "$REPO_URL"; then
  echo "cab-killer installed successfully."
else
  echo "Error: Failed to install cab-killer."
  exit 1
fi

if [ "$WITH_REFACTORING" = true ]; then
  echo ""
  echo "Installing refactoring plugin..."
  if claude plugin install "$REFACTORING_URL"; then
    echo "refactoring plugin installed successfully."
  else
    echo "Warning: Failed to install refactoring plugin. cab-killer is still installed."
  fi
fi

echo ""
echo "Done. Available commands:"
echo "  /code-review        Run all review agents"
echo "  /add-agent          Scaffold a new review agent"
echo "  /add-skill          Scaffold a new skill"
if [ "$WITH_REFACTORING" = true ]; then
  echo "  /refactoring        Incremental refactoring for legacy code"
fi
echo ""
echo "Run /code-review in any project to get started."
