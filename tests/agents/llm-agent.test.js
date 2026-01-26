import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LLMReviewAgent } from '../../src/agents/llm-agent.js'
import { PromptLoader } from '../../src/agents/prompt-loader.js'

describe('LLMReviewAgent', () => {
  let testDir
  let promptDir
  let loader

  beforeEach(() => {
    testDir = join(tmpdir(), `cab-killer-llm-test-${Date.now()}`)
    promptDir = join(testDir, 'prompts')
    mkdirSync(promptDir, { recursive: true })

    const promptContent = `# Test Agent

<role>You are a code reviewer.</role>

<objective>Find issues in code.</objective>

<checklist>
- Check for bugs
</checklist>

<output_format>
Return valid JSON matching ReviewResult schema.
</output_format>
`
    writeFileSync(join(promptDir, 'test-review.md'), promptContent)
    loader = new PromptLoader(promptDir)
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('should construct with name and prompt loader', () => {
    const agent = new LLMReviewAgent('test-review', loader)

    assert.strictEqual(agent.name, 'test-review')
  })

  it('should build prompt with code context', async () => {
    const agent = new LLMReviewAgent('test-review', loader)

    const files = [
      { path: 'src/index.js', content: 'const x = 1' },
      { path: 'src/utils.js', content: 'export function foo() {}' },
    ]

    const prompt = await agent.buildPrompt(files)

    assert.ok(prompt.includes('You are a code reviewer'))
    assert.ok(prompt.includes('src/index.js'))
    assert.ok(prompt.includes('const x = 1'))
    assert.ok(prompt.includes('src/utils.js'))
  })

  it('should parse LLM response into ReviewResult', () => {
    const agent = new LLMReviewAgent('test-review', loader)

    const response = JSON.stringify({
      status: 'warn',
      issues: [
        {
          severity: 'warning',
          file: 'src/index.js',
          line: 1,
          message: 'Unused variable',
        },
      ],
      summary: 'Found 1 issue',
    })

    const result = agent.parseResponse(response)

    assert.strictEqual(result.agentName, 'test-review')
    assert.strictEqual(result.status, 'warn')
    assert.strictEqual(result.issues.length, 1)
    assert.strictEqual(result.summary, 'Found 1 issue')
  })

  it('should handle JSON wrapped in markdown code blocks', () => {
    const agent = new LLMReviewAgent('test-review', loader)

    const response = `Here is my analysis:

\`\`\`json
{
  "status": "pass",
  "issues": [],
  "summary": "No issues found"
}
\`\`\`
`

    const result = agent.parseResponse(response)

    assert.strictEqual(result.status, 'pass')
    assert.deepStrictEqual(result.issues, [])
  })

  it('should throw on invalid JSON response', () => {
    const agent = new LLMReviewAgent('test-review', loader)

    assert.throws(
      () => agent.parseResponse('not valid json'),
      /Failed to parse/,
    )
  })
})
