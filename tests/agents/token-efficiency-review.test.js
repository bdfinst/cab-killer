import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { TokenEfficiencyReviewAgent } from '../../src/agents/token-efficiency-review.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('TokenEfficiencyReviewAgent', () => {
  let tempDir;
  let agent;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'token-test-'));
    agent = new TokenEfficiencyReviewAgent({
      maxClaudeMdLength: 1000,
      maxFileLength: 100,
      maxFunctionLength: 20
    });
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('CLAUDE.md review', () => {
    it('should flag overly long CLAUDE.md', async () => {
      const longContent = 'a'.repeat(2000);
      const claudeMd = join(tempDir, 'CLAUDE.md');
      writeFileSync(claudeMd, longContent);

      const result = await agent.review([claudeMd]);

      const lengthIssue = result.issues.find(i => i.message.includes('characters'));
      assert.ok(lengthIssue, 'Should flag excessive length');
      assert.strictEqual(lengthIssue.severity, 'warning');
    });

    it('should flag excessive code examples', async () => {
      const examples = Array(15).fill('```js\ncode\n```').join('\n\n');
      const claudeMd = join(tempDir, 'CLAUDE.md');
      writeFileSync(claudeMd, `# Project\n\n${examples}`);

      const result = await agent.review([claudeMd]);

      const exampleIssue = result.issues.find(i => i.message.includes('code examples'));
      assert.ok(exampleIssue, 'Should flag excessive examples');
    });

    it('should flag multi-step workflows that should be skills', async () => {
      const content = `# Project

## Commit Process

Step 1: Run tests
Step 2: Check linting
Step 3: Commit changes
Then, verify changes
Finally, push to remote`;

      const claudeMd = join(tempDir, 'CLAUDE.md');
      writeFileSync(claudeMd, content);

      const result = await agent.review([claudeMd]);

      const workflowIssue = result.issues.find(i => i.message.includes('workflows detected'));
      assert.ok(workflowIssue, `Should suggest converting workflows to skills. Issues: ${JSON.stringify(result.issues.map(i => i.message))}`);
    });

    it('should flag large ASCII diagrams', async () => {
      const diagram = `┌──────────────┐
│   Component  │
└──────┬───────┘
       │
       ▼
┌──────────────┐`.repeat(5);

      const claudeMd = join(tempDir, 'CLAUDE.md');
      writeFileSync(claudeMd, diagram);

      const result = await agent.review([claudeMd]);

      const diagramIssue = result.issues.find(i => i.message.includes('ASCII diagrams'));
      assert.ok(diagramIssue, 'Should flag large diagrams');
    });

    it('should pass with concise CLAUDE.md', async () => {
      const content = '# Project\n\nShort and sweet instructions.';
      const claudeMd = join(tempDir, 'CLAUDE.md');
      writeFileSync(claudeMd, content);

      const result = await agent.review([claudeMd]);

      assert.strictEqual(result.status, 'pass', 'Should pass with no issues');
      assert.strictEqual(result.issues.length, 0);
    });
  });

  describe('Rules review', () => {
    it('should flag verbose rules', async () => {
      const verboseRule = '- ' + 'This is a very long rule that explains something in excessive detail '.repeat(5);
      const rulesFile = join(tempDir, '.clinerules');
      writeFileSync(rulesFile, verboseRule);

      const result = await agent.review([rulesFile]);

      const verboseIssue = result.issues.find(i => i.message.includes('verbose'));
      assert.ok(verboseIssue, 'Should flag verbose rules');
    });

    it('should detect duplicate rules', async () => {
      const content = `- Always use const instead of let
- Another rule
- Always use const instead of let`;

      const rulesFile = join(tempDir, '.clinerules');
      writeFileSync(rulesFile, content);

      const result = await agent.review([rulesFile]);

      const dupIssue = result.issues.find(i => i.message.includes('Duplicate'));
      assert.ok(dupIssue, `Should detect duplicate rules. Issues: ${JSON.stringify(result.issues.map(i => i.message))}`);
    });

    it('should flag example-heavy rules', async () => {
      const content = Array(10).fill('- Rule\n  Example: code here').join('\n\n');
      const rulesFile = join(tempDir, '.clinerules');
      writeFileSync(rulesFile, content);

      const result = await agent.review([rulesFile]);

      const exampleIssue = result.issues.find(i => i.message.includes('examples'));
      assert.ok(exampleIssue, 'Should flag excessive examples');
    });
  });

  describe('Skills review', () => {
    it('should suggest missing commit skill', async () => {
      const claudeMd = join(tempDir, 'CLAUDE.md');
      writeFileSync(claudeMd, '# Project\n\nTo commit: git commit -m "message"');

      const result = await agent.review([claudeMd]);

      const commitSkillIssue = result.issues.find(i => i.message.includes('Git commit'));
      assert.ok(commitSkillIssue, 'Should suggest creating commit skill');
    });

    it('should flag verbose skill definitions', async () => {
      const verboseSkill = 'a'.repeat(3000);
      const skillDir = join(tempDir, '.claude', 'skills');
      const skillFile = join(skillDir, 'deploy.md');

      // Create directory structure
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(skillFile, verboseSkill);

      const result = await agent.review([skillFile]);

      const verboseIssue = result.issues.find(i => i.message.includes('chars'));
      assert.ok(verboseIssue, `Should flag verbose skills. Issues: ${JSON.stringify(result.issues.map(i => i.message))}`);
    });
  });

  describe('Code structure review', () => {
    it('should flag long files', async () => {
      const longFile = Array(150).fill('const x = 1;').join('\n');
      const codeFile = join(tempDir, 'long.js');
      writeFileSync(codeFile, longFile);

      const result = await agent.review([codeFile]);

      const lengthIssue = result.issues.find(i => i.message.includes('lines'));
      assert.ok(lengthIssue, 'Should flag long files');
    });

    it('should flag long functions', async () => {
      const longFunction = `function test() {
${Array(30).fill('  console.log("line");').join('\n')}
}`;

      const codeFile = join(tempDir, 'func.js');
      writeFileSync(codeFile, longFunction);

      const result = await agent.review([codeFile]);

      const funcIssue = result.issues.find(i => i.message.includes('Function'));
      assert.ok(funcIssue, 'Should flag long functions');
    });

    it('should flag deep nesting', async () => {
      const deepNested = `function test() {
  if (a) {
    if (b) {
      if (c) {
        if (d) {
          if (e) {
            if (f) {
              console.log('deep');
            }
          }
        }
      }
    }
  }
}`;

      const codeFile = join(tempDir, 'nested.js');
      writeFileSync(codeFile, deepNested);

      const result = await agent.review([codeFile]);

      const nestIssue = result.issues.find(i => i.message.includes('nesting'));
      assert.ok(nestIssue, 'Should flag deep nesting');
    });

    it('should detect duplicate code blocks', async () => {
      const duplicateCode = `const block1 = () => {
  const x = 1;
  const y = 2;
  const z = 3;
  const a = 4;
  const b = 5;
  return x + y + z + a + b;
};

const block2 = () => {
  const x = 1;
  const y = 2;
  const z = 3;
  const a = 4;
  const b = 5;
  return x + y + z + a + b;
};`;

      const codeFile = join(tempDir, 'dup.js');
      writeFileSync(codeFile, duplicateCode);

      const result = await agent.review([codeFile]);

      const dupIssue = result.issues.find(i => i.message.includes('Duplicate code'));
      assert.ok(dupIssue, `Should detect duplicate blocks. Issues: ${JSON.stringify(result.issues.map(i => i.message))}`);
    });
  });

  describe('Documentation review', () => {
    it('should flag verbose JSDoc', async () => {
      const verboseDoc = `/**
 * This is a very long JSDoc comment
 * that goes on for many lines
 * explaining every little detail
 * about what this function does
 * and how it works internally
 * with lots of examples
 * and edge cases
 * and notes
 * and warnings
 * and see also links
 * and more details
 * and even more
 * and more
 * and more
 */
function test() {}`;

      const codeFile = join(tempDir, 'doc.js');
      writeFileSync(codeFile, verboseDoc);

      const result = await agent.review([codeFile]);

      const docIssue = result.issues.find(i => i.message.includes('JSDoc'));
      assert.ok(docIssue, 'Should flag verbose JSDoc');
    });

    it('should flag tutorial-style comments', async () => {
      const tutorialCode = `// Example: This shows how to use the function
// For example, you can call it like this:
// Note: Make sure to check the return value
function test() {}`;

      const codeFile = join(tempDir, 'tutorial.js');
      writeFileSync(codeFile, tutorialCode);

      const result = await agent.review([codeFile]);

      const tutorialIssue = result.issues.find(i => i.message.includes('Tutorial-style'));
      assert.ok(tutorialIssue, 'Should flag tutorial comments');
    });

    it('should flag excessive commented-out code', async () => {
      const commentedCode = Array(10).fill('// function old() { return 1; }').join('\n');
      const codeFile = join(tempDir, 'commented.js');
      writeFileSync(codeFile, commentedCode);

      const result = await agent.review([codeFile]);

      const commentIssue = result.issues.find(i => i.message.includes('commented-out'));
      assert.ok(commentIssue, 'Should flag commented code');
    });
  });

  describe('Review result structure', () => {
    it('should return valid review result', async () => {
      const result = await agent.review([]);

      assert.strictEqual(result.agentName, 'token-efficiency', 'Should have correct agent name');
      assert.ok(Array.isArray(result.issues), 'Should have issues array');
      assert.ok(['pass', 'warn', 'fail'].includes(result.status), 'Should have valid status');
      assert.ok(result.summary, 'Should have summary');
    });

    it('should have pass status with no issues', async () => {
      const result = await agent.review([]);

      assert.strictEqual(result.status, 'pass');
      assert.strictEqual(result.issues.length, 0);
    });
  });
});
