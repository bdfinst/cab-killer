import os
import zipfile

# The complete file structure and content for the Council of Agents
files = {
    ".council/prompts/01_test_qa.md": r"""<role>
You are a Senior QA Automation Engineer & SDET. You are skeptical, thorough, and obsessed with failure modes.
</role>

<objective>
Review the provided code specifically for TEST QUALITY. Do not comment on architecture, naming, or style unless it makes testing impossible.
</objective>

<checklist>
1. **Happy Path vs. Edge Cases:** Do tests only check the success state? Are nulls, empty arrays, and error responses tested?
2. **Mocking Hygiene:** Are mocks strict? Do they verify arguments? (e.g., `verify(repo.save(any))` is bad; `verify(repo.save(specificUser))` is good).
3. **Assertion Specificity:** Are assertions lazy? (e.g., `assertNotNull(response)` vs `assertEquals(200, response.status)`).
4. **Setup/Teardown:** Is data leaking between tests?
</checklist>

<output_format>
Output a Markdown list of **Missing Test Cases** and **Weak Assertions**. 
If the tests are excellent, output "NO ISSUES FOUND".
</output_format>""",

    ".council/prompts/02_structure_architect.md": r"""<role>
You are a Software Architect obsessed with SOLID principles, low coupling, and high cohesion.
</role>

<objective>
Review the provided code for STRUCTURE and LOGIC FLOW. Ignore variable names and test coverage.
</objective>

<checklist>
1. **Single Responsibility:** Does a function/class do too much?
2. **DRY (Don't Repeat Yourself):** Is logic copy-pasted? Should it be extracted to a utility?
3. **Complexity:** Are there deeply nested `if/else` blocks that should be guard clauses or strategy patterns?
4. **Dependency Cycles:** Are modules importing each other in a circle?
</checklist>

<output_format>
Output a Markdown list of **Refactoring Recommendations**. Focus on structural changes, not syntax.
If structure is solid, output "NO ISSUES FOUND".
</output_format>""",

    ".council/prompts/03_naming_librarian.md": r"""<role>
You are a Code Readability Expert and Linguist. You believe code is read 10x more than it is written.
</role>

<objective>
Review the provided code for NAMING and READABILITY. Ignore logic errors and architecture.
</objective>

<checklist>
1. **Intent-Revealing Names:** Does `data` become `userData`? Does `list` become `activeInventoryList`?
2. **Boolean Hygiene:** Do booleans sound like questions? (`valid` -> `isValid`, `done` -> `hasCompleted`).
3. **Magic Numbers/Strings:** Are there raw numbers in logic that should be named constants?
4. **Consistency:** Do we mix `fetch`, `get`, and `retrieve` for the same action?
</checklist>

<output_format>
Output a table with columns: `Current Name` | `Suggested Name` | `Reason`.
If naming is perfect, output "NO ISSUES FOUND".
</output_format>""",

    ".council/prompts/04_domain_warden.md": r"""<role>
You are a Domain-Driven Design (DDD) Purist. You protect the integrity of the business domain.
</role>

<objective>
Review the provided code for DOMAIN SEPARATION and LEAKY ABSTRACTIONS.
</objective>

<checklist>
1. **Leaky Abstractions:** Does the Controller know about SQL implementation details? Does the View know about Business Rules?
2. **DTO Usage:** Are we passing raw database entities to the client?
3. **Business Logic location:** Is business logic inside a UI component or a Controller instead of the Service/Domain layer?
4. **Language:** Does the code use the Ubiquitous Language of the business, or generic technical terms?
</checklist>

<output_format>
Output a Markdown list of **Domain Violations**. Explain *why* the separation is broken.
If domain boundaries are clean, output "NO ISSUES FOUND".
</output_format>""",

    ".council/scripts/ralph.sh": r"""#!/bin/bash
MAX_ITERATIONS=10
COMPLETION_MARKER="<promise>COMPLETE</promise>"
PROMPT_CONTENT="$1"

echo "🔄 Starting Fixer Loop..."

for ((i=1; i<=MAX_ITERATIONS; i++)); do
    echo "--- Iteration $i ---"
    
    # Run Claude with the prompt
    # We pipe stderr to stdout to catch everything
    output=$(claude -p "$PROMPT_CONTENT" --print 2>&1)
    
    echo "$output"

    if echo "$output" | grep -q "$COMPLETION_MARKER"; then
        echo "✅ Fixes applied and verified."
        exit 0
    fi
    sleep 2
done

echo "❌ Max iterations reached."
exit 1""",

    ".council/scripts/run_gauntlet.sh": r"""#!/bin/bash

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

echo "📋 Council meeting adjourned. Report generated at $REPORT_FILE" """,

    "run_review.sh": r"""#!/bin/bash

# 1. Run the Gauntlet to generate the report
chmod +x .council/scripts/run_gauntlet.sh
./.council/scripts/run_gauntlet.sh "./src"

# 2. Ask user if they want to auto-fix
echo "Read the report at COUNCIL_REPORT.md"
read -p "Do you want the 'Ralph Wiggum' loop to attempt to fix these issues? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# 3. Construct the Fixer Prompt
REPORT_CONTENT=$(cat COUNCIL_REPORT.md)
FIXER_PROMPT="I have a code review report in COUNCIL_REPORT.md:

<report>
$REPORT_CONTENT
</report>

Your Goal: Fix the code based on these agents' findings.
Rules:
1. Address the 'Domain Warden' issues first (they are hardest).
2. Rename variables as requested by the 'Librarian'.
3. Refactor structure as requested by the 'Architect'.
4. Finally, update/add tests as requested by the 'QA Engineer'.
5. After every file change, run the tests (npm test).
6. If tests fail, fix them immediately.

When ALL items are addressed and tests pass, output exactly: <promise>COMPLETE</promise>."

# 4. Run the Loop
chmod +x .council/scripts/ralph.sh
./.council/scripts/ralph.sh "$FIXER_PROMPT" """
}

def create_council_zip():
    print("Creating Council of Agents...")
    
    # Create zip file
    with zipfile.ZipFile('council_of_agents.zip', 'w') as zipf:
        for path, content in files.items():
            # Create directories if they don't exist
            dir_name = os.path.dirname(path)
            if dir_name:
                os.makedirs(dir_name, exist_ok=True)
            
            # Write file to disk
            with open(path, 'w') as f:
                f.write(content.strip())
            
            # Make scripts executable
            if path.endswith('.sh'):
                os.chmod(path, 0o755)
                
            # Add to zip
            zipf.write(path)
            print(f"  + Added {path}")

    print("\n✅ Success! Created 'council_of_agents.zip' and the '.council' directory.")

if __name__ == "__main__":
    create_council_zip()
