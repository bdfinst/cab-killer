# Fix Application with Repository Rules and Validation

This example demonstrates how the fix orchestrator now uses target repository rules and validates changes.

## How It Works

### 1. Repository Rules Detection

When applying fixes, the system automatically detects and loads rules from:

```
target-repo/
├── CLAUDE.md              # AI assistant guidelines
├── .clinerules            # Custom coding rules
├── .claude/rules/         # Structured rules directory
├── CONTRIBUTING.md        # Contribution guidelines
└── README.md              # Project conventions
```

### 2. Fix Application with Context

Each fix agent receives a prompt that includes:

```
Fix this code issue:

**Issue:** Add missing test for parseInput function
**Location:** The function handles user input but has no tests
**Files:** src/utils/parser.js, tests/utils/parser.test.js

## Repository Rules and Guidelines

Follow these rules and conventions from the target repository:

### CLAUDE.md

```
# Project Guidelines
- Use Jest for testing
- All functions must have unit tests
- Follow naming convention: describe('moduleName', ...)
```

### .clinerules

```
prefer-const=on
no-var=error
test-coverage=80%
```

Instructions:
1. Read the affected file(s)
2. Make the minimal fix required following the repository rules and conventions
3. Do not change anything else
4. Ensure your changes follow all coding standards and conventions listed above

Apply the fix now.
```

### 3. Automatic Validation

After applying each fix, the system automatically runs:

1. **Lint** - Checks code style (if `lint` script exists in package.json)
2. **Build** - Verifies compilation (if `build` script exists)
3. **Tests** - Runs full test suite (if `test` script exists)

### 4. Results Categorization

Fixes are categorized into three groups:

- **Applied & Validated** ✓ - Successfully applied and passed all checks
- **Validation Failed** ⚠️ - Applied but failed lint/build/tests
- **Failed** ✗ - Could not apply the fix

## Usage Examples

### Basic usage with validation

```bash
# Generate review prompts
node src/index.js --prompts-output ./review-prompts /path/to/target/repo

# Apply fixes with automatic validation
node src/index.js apply-fixes ./review-prompts --repo /path/to/target/repo --verbose
```

### Skip specific validation steps

```bash
# Skip tests (useful for quick iterations)
node src/index.js apply-fixes ./review-prompts --skip-tests

# Skip both build and tests
node src/index.js apply-fixes ./review-prompts --skip-build --skip-tests

# Only apply fixes without any validation
node src/index.js apply-fixes ./review-prompts --skip-lint --skip-build --skip-tests
```

### Dry run to preview

```bash
# See what would be applied without making changes
node src/index.js apply-fixes ./review-prompts --dry
```

## Example Output

```
Found 5 prompts in ./review-prompts
Loaded 2 repository rules file(s): CLAUDE.md, .clinerules

[1/5] 001-test-quality.json
  Priority: high
  Category: test-quality
  Files: src/utils/parser.js, tests/utils/parser.test.js
  Running lint...
  Running build...
  Running tests...
  Status: Applied & Validated

[2/5] 002-naming.json
  Priority: medium
  Category: naming
  Files: src/api/handler.js
  Running lint...
  Running build...
  Status: Applied but validation failed
  Failed step: build
  Details: Type error: Cannot find name 'Request'

============================================================
  FIX SUMMARY REPORT
============================================================

Total: 5 | Applied: 3 | Failed: 1 | Validation Failed: 1

--- APPLIED & VALIDATED ---

[test-quality] 001-test-quality.json
  Add missing test for parseInput function
  Files: src/utils/parser.js, tests/utils/parser.test.js

[structure-review] 003-structure-review.json
  Extract validation logic into separate module
  Files: src/api/validator.js

--- VALIDATION FAILED ---

[naming] 002-naming.json
  Rename handler to handleRequest for clarity
  Files: src/api/handler.js
  Failed step: build
  Reason: Type error: Cannot find name 'Request'

--- FAILED ---

[complexity-review] 005-complexity-review.json
  Simplify nested conditions in processData
  Files: src/data/processor.js
  Reason: Failed to spawn Claude: Command not found

============================================================
```

## Benefits

1. **Consistency** - Fixes automatically follow the target repository's coding standards
2. **Safety** - No fix is considered successful unless it passes all validation checks
3. **Transparency** - Clear reporting on which fixes succeeded and which failed validation
4. **Flexibility** - Can skip validation steps for quick iterations during development
5. **Context-aware** - Each fix agent has full knowledge of the repository's conventions
