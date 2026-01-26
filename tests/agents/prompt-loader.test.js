import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PromptLoader } from '../../src/agents/prompt-loader.js'

describe('PromptLoader', () => {
  let testDir
  let loader

  beforeEach(() => {
    testDir = join(tmpdir(), `cab-killer-prompts-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    loader = new PromptLoader(testDir)
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('should load a prompt file', async () => {
    const promptContent = `# Test Review Agent

<role>
You are a test quality expert.
</role>

<objective>
Review test files for quality issues.
</objective>

<checklist>
- Check for proper assertions
- Verify test isolation
</checklist>

<output_format>
Return JSON matching ReviewResult schema.
</output_format>
`
    writeFileSync(join(testDir, 'test-review.md'), promptContent)

    const prompt = await loader.load('test-review')

    assert.ok(prompt.role.includes('test quality expert'))
    assert.ok(prompt.objective.includes('Review test files'))
    assert.ok(prompt.checklist.includes('proper assertions'))
    assert.ok(prompt.outputFormat.includes('ReviewResult'))
    assert.ok(prompt.raw.includes('# Test Review Agent'))
  })

  it('should throw for non-existent prompt', async () => {
    await assert.rejects(
      async () => loader.load('nonexistent'),
      /Prompt file not found/,
    )
  })

  it('should list available prompts', async () => {
    writeFileSync(join(testDir, 'agent-a.md'), '# Agent A')
    writeFileSync(join(testDir, 'agent-b.md'), '# Agent B')
    writeFileSync(join(testDir, 'not-a-prompt.txt'), 'ignore me')

    const prompts = await loader.list()

    assert.deepStrictEqual(prompts.sort(), ['agent-a', 'agent-b'])
  })

  it('should parse sections from prompt', async () => {
    const promptContent = `# Agent

<role>Role content here</role>

<objective>Objective content here</objective>

<checklist>
- Item 1
- Item 2
</checklist>

<output_format>
{
  "type": "object"
}
</output_format>
`
    writeFileSync(join(testDir, 'test.md'), promptContent)

    const prompt = await loader.load('test')

    assert.strictEqual(prompt.role.trim(), 'Role content here')
    assert.strictEqual(prompt.objective.trim(), 'Objective content here')
    assert.ok(prompt.checklist.includes('Item 1'))
    assert.ok(prompt.outputFormat.includes('"type": "object"'))
  })
})
