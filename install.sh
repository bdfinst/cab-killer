#!/usr/bin/env bash
#
# install.sh — Install cab-killer and configured companion plugins
#
# Usage:
#   ./install.sh                    Install required plugins only
#   ./install.sh --with-refactoring Also install the refactoring plugin
#   ./install.sh --clean            Remove existing installs before installing
#   ./install.sh --help             Show usage
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGINS_CONFIG="${SCRIPT_DIR}/plugins.json"
CLEAN=false
declare -A ENABLED_FLAGS

# --- dependency checks -------------------------------------------------------

if ! command -v jq &>/dev/null; then
  echo "Error: 'jq' is required. Install it with: brew install jq"
  exit 1
fi

if ! command -v claude &>/dev/null; then
  echo "Error: 'claude' CLI not found. Install Claude Code first:"
  echo "  https://docs.anthropic.com/en/docs/claude-code"
  exit 1
fi

if [ ! -f "$PLUGINS_CONFIG" ]; then
  echo "Error: plugins.json not found at $PLUGINS_CONFIG"
  exit 1
fi

# --- usage -------------------------------------------------------------------

usage() {
  echo "Usage: ./install.sh [OPTIONS]"
  echo ""
  echo "Install plugins defined in plugins.json."
  echo ""
  echo "Options:"
  echo "  --clean   Remove existing installations before installing"
  while IFS= read -r plugin; do
    flag=$(echo "$plugin" | jq -r '.flag // empty')
    desc=$(echo "$plugin" | jq -r '.description // "optional plugin"')
    [ -n "$flag" ] && printf "  --%-20s %s\n" "$flag" "Also install: $desc"
  done < <(jq -c '.plugins[] | select(.required == false)' "$PLUGINS_CONFIG")
  echo "  --help    Show this help message"
}

# --- arg parsing -------------------------------------------------------------

for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN=true ;;
    --help|-h) usage; exit 0 ;;
    --*)
      flag="${arg#--}"
      if jq -e ".plugins[] | select(.flag == \"$flag\")" "$PLUGINS_CONFIG" >/dev/null 2>&1; then
        ENABLED_FLAGS["$flag"]=true
      else
        echo "Unknown option: $arg"
        usage
        exit 1
      fi
      ;;
    *) echo "Unknown option: $arg"; usage; exit 1 ;;
  esac
done

# --- install function --------------------------------------------------------

install_plugin() {
  local repo="$1"
  local marketplace="$2"
  local name="$3"

  if [ "$CLEAN" = true ]; then
    echo "Removing existing $name..."
    claude plugin uninstall "${name}@${marketplace}" 2>/dev/null || true
    [ -n "$repo" ] && claude plugin marketplace remove "$marketplace" 2>/dev/null || true
  fi

  if [ -n "$repo" ]; then
    echo "Adding $name marketplace..."
    if ! claude plugin marketplace add "$repo"; then
      echo "Error: Failed to add marketplace for $name."
      return 1
    fi
  fi

  echo "Installing $name..."
  if claude plugin install "${name}@${marketplace}"; then
    echo "$name installed successfully."
  else
    echo "Error: Failed to install $name."
    return 1
  fi
}

# --- install required plugins ------------------------------------------------

while IFS= read -r plugin; do
  repo=$(echo "$plugin" | jq -r '.repo // empty')
  marketplace=$(echo "$plugin" | jq -r '.marketplace')
  name=$(echo "$plugin" | jq -r '.name')
  echo ""
  install_plugin "$repo" "$marketplace" "$name"
done < <(jq -c '.plugins[] | select(.required == true)' "$PLUGINS_CONFIG")

# --- install optional plugins if flagged -------------------------------------

while IFS= read -r plugin; do
  flag=$(echo "$plugin" | jq -r '.flag // empty')
  [ -z "$flag" ] && continue
  [ -z "${ENABLED_FLAGS[$flag]+_}" ] && continue

  repo=$(echo "$plugin" | jq -r '.repo // empty')
  marketplace=$(echo "$plugin" | jq -r '.marketplace')
  name=$(echo "$plugin" | jq -r '.name')
  echo ""
  install_plugin "$repo" "$marketplace" "$name"
done < <(jq -c '.plugins[] | select(.required == false)' "$PLUGINS_CONFIG")

# --- summary -----------------------------------------------------------------

echo ""
echo "Done. Available commands:"
echo "  /code-review        Run all review agents"
echo "  /add-agent          Scaffold a new review agent"
echo "  /add-skill          Scaffold a new skill"
echo ""
echo "Run /code-review in any project to get started."
