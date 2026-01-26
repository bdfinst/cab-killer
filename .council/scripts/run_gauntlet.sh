#!/bin/bash

# Target directory (passed as arg or defaults to current dir)
TARGET_DIR="${1:-.}"
REPORT_FILE="COUNCIL_REPORT.md"
PROMPT_DIR=".council/prompts"

# Gather the code context (filtering out node_modules, git, etc.)
# Note: For massive repos, replace this with a specific file list or use 'repomix'
echo "📖 Reading code context..."
CODE_CONTEXT=$(find "$TARGET_DIR" -maxdepth 3 -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -not -path "*/node_modules/*" | xargs cat)

echo "# Council of Agents Report" > $REPORT_FILE
echo "Target: $TARGET_DIR" >> $REPORT_FILE
echo "Date: $(date)" >> $REPORT_FILE
echo "------------------------------------------------" >> $REPORT_FILE

run_agent() {
    local name=$1
    local prompt_path=$2
    
    echo "🤖 Agent [$name] is analyzing..."
    
    # Combine System Prompt + Code Context
    local full_prompt="$(cat $prompt_path)
    
    <code_to_review>
    $CODE_CONTEXT
    </code_to_review>"
    
    local result=$(claude -p "$full_prompt" --print 2>&1)
    
    echo "## 🕵️ Agent: $name" >> $REPORT_FILE
    echo "$result" >> $REPORT_FILE
    echo "------------------------------------------------" >> $REPORT_FILE
}

# Run in parallel
run_agent "QA Engineer" "$PROMPT_DIR/01_test_qa.md" &
run_agent "Architect" "$PROMPT_DIR/02_structure_architect.md" &
run_agent "Librarian" "$PROMPT_DIR/03_naming_librarian.md" &
run_agent "Domain Warden" "$PROMPT_DIR/04_domain_warden.md" &

wait

echo "📋 Council meeting adjourned. Report generated at $REPORT_FILE"