import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  loadRepositoryRules,
  formatRulesForPrompt,
  fileExists,
} from '../../src/utils/repo-rules-loader.js'

describe('repo-rules-loader', () => {
  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'test-'))
      const testFile = join(tempDir, 'test.txt')
      await writeFile(testFile, 'content')

      const exists = await fileExists(testFile)
      assert.equal(exists, true)

      await rm(tempDir, { recursive: true })
    })

    it('should return false for non-existing file', async () => {
      const exists = await fileExists('/nonexistent/file.txt')
      assert.equal(exists, false)
    })
  })

  describe('loadRepositoryRules', () => {
    it('should load CLAUDE.md if present', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'test-'))
      const claudeMd = join(tempDir, 'CLAUDE.md')
      await writeFile(claudeMd, '# Project Rules\nFollow these rules.')

      const rules = await loadRepositoryRules(tempDir)

      assert.equal(rules.length, 1)
      assert.equal(rules[0].filename, 'CLAUDE.md')
      assert.ok(rules[0].content.includes('Project Rules'))

      await rm(tempDir, { recursive: true })
    })

    it('should load multiple rules files', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'test-'))
      await writeFile(join(tempDir, 'CLAUDE.md'), '# Claude rules')
      await writeFile(join(tempDir, '.clinerules'), 'rule1=value')
      await writeFile(join(tempDir, 'README.md'), '# Project')

      const rules = await loadRepositoryRules(tempDir)

      assert.equal(rules.length, 3)
      const filenames = rules.map((r) => r.filename)
      assert.ok(filenames.includes('CLAUDE.md'))
      assert.ok(filenames.includes('.clinerules'))
      assert.ok(filenames.includes('README.md'))

      await rm(tempDir, { recursive: true })
    })

    it('should return empty array when no rules files exist', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'test-'))
      const rules = await loadRepositoryRules(tempDir)

      assert.equal(rules.length, 0)

      await rm(tempDir, { recursive: true })
    })
  })

  describe('formatRulesForPrompt', () => {
    it('should format rules for prompt inclusion', () => {
      const rules = [
        { filename: 'CLAUDE.md', content: 'Follow these rules' },
        { filename: '.clinerules', content: 'rule1=value' },
      ]

      const formatted = formatRulesForPrompt(rules)

      assert.ok(formatted.includes('## Repository Rules and Guidelines'))
      assert.ok(formatted.includes('### CLAUDE.md'))
      assert.ok(formatted.includes('### .clinerules'))
      assert.ok(formatted.includes('Follow these rules'))
      assert.ok(formatted.includes('rule1=value'))
    })

    it('should return empty string for no rules', () => {
      const formatted = formatRulesForPrompt([])
      assert.equal(formatted, '')
    })
  })
})
