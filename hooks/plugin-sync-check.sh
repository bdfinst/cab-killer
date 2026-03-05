#!/usr/bin/env bash
#
# plugin-sync-check.sh — Warn when .claude/settings.json has a plugin
# not listed in plugins.json
#
# Fires on PostToolUse for Write/Edit to .claude/settings.json

TOOL_INPUT=$(cat)
FILE_PATH=$(echo "$TOOL_INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)

# Only run for .claude/settings.json
[[ "$FILE_PATH" != *".claude/settings.json" ]] && exit 0

SETTINGS_FILE="$FILE_PATH"
PLUGINS_CONFIG="$(dirname "$FILE_PATH")/../plugins.json"

[ ! -f "$SETTINGS_FILE" ] && exit 0
[ ! -f "$PLUGINS_CONFIG" ] && exit 0
command -v jq &>/dev/null || exit 0

# Get plugin names from settings.json (strip @marketplace suffix)
SETTINGS_PLUGINS=$(jq -r '.enabledPlugins // {} | keys[]' "$SETTINGS_FILE" 2>/dev/null | sed 's/@.*//')

# Get plugin names from plugins.json
CONFIG_PLUGINS=$(jq -r '.plugins[].name' "$PLUGINS_CONFIG" 2>/dev/null)

MISSING=()
while IFS= read -r plugin; do
  [ -z "$plugin" ] && continue
  if ! echo "$CONFIG_PLUGINS" | grep -qx "$plugin"; then
    MISSING+=("$plugin")
  fi
done <<< "$SETTINGS_PLUGINS"

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "WARNING: The following plugins are in .claude/settings.json but missing from plugins.json:"
  for p in "${MISSING[@]}"; do
    echo "  - $p"
  done
  echo "Add them to plugins.json so others can install the full plugin set via ./install.sh"
fi

exit 0
