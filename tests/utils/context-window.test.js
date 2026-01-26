import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  estimateTokens,
  chunkFiles,
  truncateContent,
} from '../../src/utils/context-window.js'

describe('context-window', () => {
  describe('estimateTokens', () => {
    it('should estimate tokens from text length', () => {
      const text = 'Hello world this is a test'
      const tokens = estimateTokens(text)

      // Rough estimate: ~4 chars per token
      assert.ok(tokens > 0)
      assert.ok(tokens < text.length)
    })

    it('should return 0 for empty string', () => {
      assert.strictEqual(estimateTokens(''), 0)
    })
  })

  describe('chunkFiles', () => {
    it('should return single chunk if within limit', () => {
      const files = [
        { path: 'a.js', content: 'const a = 1' },
        { path: 'b.js', content: 'const b = 2' },
      ]

      const chunks = chunkFiles(files, 10000)

      assert.strictEqual(chunks.length, 1)
      assert.strictEqual(chunks[0].length, 2)
    })

    it('should split into multiple chunks if exceeding limit', () => {
      const files = [
        { path: 'a.js', content: 'x'.repeat(1000) },
        { path: 'b.js', content: 'y'.repeat(1000) },
        { path: 'c.js', content: 'z'.repeat(1000) },
      ]

      const chunks = chunkFiles(files, 600) // ~150 tokens per file

      assert.ok(chunks.length > 1)
    })

    it('should handle single large file', () => {
      const files = [{ path: 'large.js', content: 'x'.repeat(10000) }]

      const chunks = chunkFiles(files, 500)

      // Large file should still be in a chunk (even if it exceeds limit)
      assert.strictEqual(chunks.length, 1)
      assert.strictEqual(chunks[0].length, 1)
    })
  })

  describe('truncateContent', () => {
    it('should not truncate content within limit', () => {
      const content = 'Short content'
      const result = truncateContent(content, 1000)

      assert.strictEqual(result, content)
    })

    it('should truncate long content', () => {
      const content = 'x'.repeat(10000)
      const result = truncateContent(content, 100)

      assert.ok(result.length < content.length)
      assert.ok(result.includes('... [truncated]'))
    })

    it('should preserve beginning and end of content', () => {
      const content = 'START' + 'x'.repeat(10000) + 'END'
      const result = truncateContent(content, 100)

      assert.ok(result.startsWith('START'))
      assert.ok(result.endsWith('END'))
    })
  })
})
