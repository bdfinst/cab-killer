import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { FPReviewAgent } from '../../src/agents/fp-review.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('FPReviewAgent', () => {
  let tempDir;
  let agent;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'fp-test-'));
    agent = new FPReviewAgent();
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('let vs const analysis', () => {
    it('should flag let that is never reassigned', async () => {
      const code = `let x = 5;
console.log(x);`;

      const codeFile = join(tempDir, 'let-const.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const letIssue = result.issues.find(i => i.message.includes("never reassigned"));
      assert.ok(letIssue, `Should flag let not reassigned. Issues: ${JSON.stringify(result.issues.map(i => i.message))}`);
      assert.strictEqual(letIssue.severity, 'warning');
    });

    it('should not flag let that is reassigned', async () => {
      const code = `let x = 5;
x = 10;
console.log(x);`;

      const codeFile = join(tempDir, 'let-reassigned.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const letIssue = result.issues.find(i => i.message.includes("'x'") && i.message.includes("never reassigned"));
      assert.ok(!letIssue, 'Should not flag reassigned let');
    });

    it('should not flag let with compound assignment', async () => {
      const code = `let count = 0;
count += 1;`;

      const codeFile = join(tempDir, 'compound.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const letIssue = result.issues.find(i => i.message.includes("'count'") && i.message.includes("never reassigned"));
      assert.ok(!letIssue, 'Should not flag let with compound assignment');
    });

    it('should allow mutable prefix variables', async () => {
      const code = `let mutValue = 5;
let _temp = 10;
console.log(mutValue, _temp);`;

      const codeFile = join(tempDir, 'mutable-prefix.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const mutIssue = result.issues.find(i => i.message.includes("mutValue") || i.message.includes("_temp"));
      assert.ok(!mutIssue, 'Should allow mutable prefixed variables');
    });
  });

  describe('array mutation detection', () => {
    it('should flag push mutation', async () => {
      const code = `const arr = [1, 2, 3];
arr.push(4);`;

      const codeFile = join(tempDir, 'push.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const pushIssue = result.issues.find(i => i.message.includes("push"));
      assert.ok(pushIssue, 'Should flag push mutation');
      assert.ok(pushIssue.suggestedFix.includes('spread'), 'Should suggest spread operator');
    });

    it('should flag pop mutation', async () => {
      const code = `const items = [1, 2, 3];
items.pop();`;

      const codeFile = join(tempDir, 'pop.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const popIssue = result.issues.find(i => i.message.includes("pop"));
      assert.ok(popIssue, 'Should flag pop mutation');
    });

    it('should flag sort without spread', async () => {
      const code = `const numbers = [3, 1, 2];
numbers.sort();`;

      const codeFile = join(tempDir, 'sort.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const sortIssue = result.issues.find(i => i.message.includes("sort"));
      assert.ok(sortIssue, 'Should flag sort mutation');
      assert.ok(sortIssue.suggestedFix.includes('toSorted'), 'Should suggest toSorted');
    });

    it('should flag reverse without spread', async () => {
      const code = `const list = [1, 2, 3];
list.reverse();`;

      const codeFile = join(tempDir, 'reverse.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const reverseIssue = result.issues.find(i => i.message.includes("reverse"));
      assert.ok(reverseIssue, 'Should flag reverse mutation');
    });

    it('should flag splice mutation', async () => {
      const code = `const data = [1, 2, 3, 4];
data.splice(1, 2);`;

      const codeFile = join(tempDir, 'splice.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const spliceIssue = result.issues.find(i => i.message.includes("splice"));
      assert.ok(spliceIssue, 'Should flag splice mutation');
    });

    it('should not flag sort on spread copy', async () => {
      const code = `const numbers = [3, 1, 2];
const sorted = [...numbers].sort();`;

      const codeFile = join(tempDir, 'sort-spread.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const sortIssue = result.issues.find(i => i.message.includes("sort"));
      assert.ok(!sortIssue, 'Should not flag sort on spread copy');
    });

    it('should allow mutations on mutable-prefixed arrays', async () => {
      const code = `const mutArray = [1, 2, 3];
mutArray.push(4);`;

      const codeFile = join(tempDir, 'mut-array.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const pushIssue = result.issues.find(i => i.message.includes("mutArray"));
      assert.ok(!pushIssue, 'Should allow mutable-prefixed arrays');
    });
  });

  describe('parameter mutation detection', () => {
    it('should flag property assignment on parameter', async () => {
      const code = `function update(obj) {
  obj.value = 10;
}`;

      const codeFile = join(tempDir, 'param-mutation.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const paramIssue = result.issues.find(i => i.message.includes("Mutating parameter"));
      assert.ok(paramIssue, `Should flag parameter mutation. Issues: ${JSON.stringify(result.issues.map(i => i.message))}`);
      assert.strictEqual(paramIssue.severity, 'error');
    });

    it('should flag bracket assignment on parameter', async () => {
      const code = `function setItem(arr, idx, val) {
  arr[idx] = val;
}`;

      const codeFile = join(tempDir, 'bracket-mutation.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const bracketIssue = result.issues.find(i => i.message.includes("bracket assignment"));
      assert.ok(bracketIssue, 'Should flag bracket assignment on parameter');
    });

    it('should flag delete on parameter', async () => {
      const code = `function removeKey(obj) {
  delete obj.key;
}`;

      const codeFile = join(tempDir, 'delete-param.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const deleteIssue = result.issues.find(i => i.message.includes("delete"));
      assert.ok(deleteIssue, 'Should flag delete on parameter');
    });

    it('should flag arrow function parameter mutations', async () => {
      const code = `const process = (data) => {
  data.processed = true;
  return data;
};`;

      const codeFile = join(tempDir, 'arrow-mutation.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const arrowIssue = result.issues.find(i => i.message.includes("Mutating parameter"));
      assert.ok(arrowIssue, 'Should flag arrow function parameter mutations');
    });

    it('should not flag this.property assignments', async () => {
      const code = `class Example {
  update() {
    this.value = 10;
  }
}`;

      const codeFile = join(tempDir, 'this-assign.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const thisIssue = result.issues.find(i => i.message.includes("'this'"));
      assert.ok(!thisIssue, 'Should not flag this.property assignments');
    });
  });

  describe('global state mutation detection', () => {
    it('should flag window mutations', async () => {
      const code = `window.myGlobal = 'value';`;

      const codeFile = join(tempDir, 'window-mutation.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const windowIssue = result.issues.find(i => i.message.includes("window"));
      assert.ok(windowIssue, 'Should flag window mutations');
      assert.strictEqual(windowIssue.severity, 'error');
    });

    it('should flag globalThis mutations', async () => {
      const code = `globalThis.shared = {};`;

      const codeFile = join(tempDir, 'globalthis-mutation.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const globalIssue = result.issues.find(i => i.message.includes("globalThis"));
      assert.ok(globalIssue, 'Should flag globalThis mutations');
    });

    it('should flag Object.assign to existing object', async () => {
      const code = `const target = { a: 1 };
Object.assign(target, { b: 2 });`;

      const codeFile = join(tempDir, 'object-assign.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const assignIssue = result.issues.find(i => i.message.includes("Object.assign"));
      assert.ok(assignIssue, 'Should flag Object.assign to existing object');
    });
  });

  describe('reassignment detection', () => {
    it('should flag increment outside of loops', async () => {
      const code = `let value = 0;
function process() {
  value++;
}`;

      const codeFile = join(tempDir, 'increment.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const incIssue = result.issues.find(i => i.message.includes("mutated with ++"));
      assert.ok(incIssue, 'Should flag increment');
    });

    it('should not flag loop counters', async () => {
      const code = `for (let i = 0; i < 10; i++) {
  console.log(i);
}`;

      const codeFile = join(tempDir, 'loop-counter.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      const loopIssue = result.issues.find(i => i.message.includes("'i'") && i.message.includes("mutated"));
      assert.ok(!loopIssue, 'Should not flag loop counters');
    });
  });

  describe('review result structure', () => {
    it('should return valid review result', async () => {
      const result = await agent.review([]);

      assert.strictEqual(result.agentName, 'fp-review', 'Should have correct agent name');
      assert.ok(Array.isArray(result.issues), 'Should have issues array');
      assert.ok(['pass', 'warn', 'fail'].includes(result.status), 'Should have valid status');
      assert.ok(result.summary, 'Should have summary');
    });

    it('should pass with pure functional code', async () => {
      const code = `const double = x => x * 2;
const items = [1, 2, 3];
const doubled = items.map(double);
const sorted = [...items].sort();
const newObj = { ...existingObj, newProp: 'value' };`;

      const codeFile = join(tempDir, 'pure.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      assert.strictEqual(result.status, 'pass', `Should pass. Issues: ${JSON.stringify(result.issues)}`);
    });

    it('should fail with multiple mutation violations', async () => {
      const code = `function mutateAll(obj, arr) {
  obj.value = 10;
  arr.push(1);
  window.global = true;
}`;

      const codeFile = join(tempDir, 'multiple-mutations.js');
      writeFileSync(codeFile, code);

      const result = await agent.review([codeFile]);

      assert.strictEqual(result.status, 'fail', 'Should fail with errors');
      assert.ok(result.issues.length >= 3, 'Should have multiple issues');
    });
  });

  describe('configuration options', () => {
    it('should respect custom mutable prefixes', async () => {
      const customAgent = new FPReviewAgent({
        allowedMutablePrefixes: ['temp', 'working']
      });

      const code = `let tempValue = 5;
const workingArray = [];
workingArray.push(1);`;

      const codeFile = join(tempDir, 'custom-prefix.js');
      writeFileSync(codeFile, code);

      const result = await customAgent.review([codeFile]);

      const prefixIssues = result.issues.filter(i =>
        i.message.includes('tempValue') || i.message.includes('workingArray')
      );
      assert.strictEqual(prefixIssues.length, 0, 'Should allow custom mutable prefixes');
    });
  });
});
