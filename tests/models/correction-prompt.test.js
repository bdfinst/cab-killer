import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createCorrectionPrompt } from '../../src/models/correction-prompt.js'

describe('createCorrectionPrompt', () => {
  it('should create a correction prompt with all required fields', () => {
    const prompt = createCorrectionPrompt({
      priority: 'high',
      category: 'test-quality',
      instruction: 'Add missing test for parseInput function',
    })

    assert.strictEqual(prompt.priority, 'high')
    assert.strictEqual(prompt.category, 'test-quality')
    assert.strictEqual(
      prompt.instruction,
      'Add missing test for parseInput function',
    )
    assert.strictEqual(prompt.context, null)
    assert.deepStrictEqual(prompt.affectedFiles, [])
  })

  it('should create a correction prompt with optional fields', () => {
    const prompt = createCorrectionPrompt({
      priority: 'medium',
      category: 'naming',
      instruction: 'Rename variable to be more descriptive',
      context: 'The variable "x" is used to store user count',
      affectedFiles: ['src/utils/counter.js', 'tests/utils/counter.test.js'],
    })

    assert.strictEqual(prompt.priority, 'medium')
    assert.strictEqual(prompt.category, 'naming')
    assert.strictEqual(
      prompt.instruction,
      'Rename variable to be more descriptive',
    )
    assert.strictEqual(
      prompt.context,
      'The variable "x" is used to store user count',
    )
    assert.deepStrictEqual(prompt.affectedFiles, [
      'src/utils/counter.js',
      'tests/utils/counter.test.js',
    ])
  })

  it('should accept valid priority levels', () => {
    const priorities = ['high', 'medium', 'low']

    for (const priority of priorities) {
      const prompt = createCorrectionPrompt({
        priority,
        category: 'test',
        instruction: 'Test instruction',
      })
      assert.strictEqual(prompt.priority, priority)
    }
  })

  it('should throw error for invalid priority', () => {
    assert.throws(
      () =>
        createCorrectionPrompt({
          priority: 'urgent',
          category: 'test',
          instruction: 'Test',
        }),
      /Invalid priority/,
    )
  })

  it('should throw error for missing required fields', () => {
    assert.throws(() => createCorrectionPrompt({}), /Missing required field/)

    assert.throws(
      () => createCorrectionPrompt({ priority: 'high' }),
      /Missing required field/,
    )

    assert.throws(
      () => createCorrectionPrompt({ priority: 'high', category: 'test' }),
      /Missing required field/,
    )
  })

  it('should throw error for invalid affectedFiles', () => {
    assert.throws(
      () =>
        createCorrectionPrompt({
          priority: 'high',
          category: 'test',
          instruction: 'Test',
          affectedFiles: 'not an array',
        }),
      /affectedFiles must be an array/,
    )
  })
})
