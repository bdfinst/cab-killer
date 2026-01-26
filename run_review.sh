#!/bin/bash

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
./.council/scripts/ralph.sh "$FIXER_PROMPT"