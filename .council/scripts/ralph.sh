#!/bin/bash
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
exit 1