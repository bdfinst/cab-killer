import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  discoverFiles,
  readFileContent,
  filterByExtension,
} from '../../src/utils/file-utils.js'

describe('file-utils', () => {
  let testDir

  beforeEach(() => {
    testDir = join(tmpdir(), `cab-killer-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    mkdirSync(join(testDir, 'src'), { recursive: true })
    mkdirSync(join(testDir, 'tests'), { recursive: true })
    mkdirSync(join(testDir, 'node_modules', 'pkg'), { recursive: true })

    writeFileSync(join(testDir, 'src', 'index.js'), 'export default {}')
    writeFileSync(join(testDir, 'src', 'utils.js'), 'export function util() {}')
    writeFileSync(
      join(testDir, 'tests', 'index.test.js'),
      'test("works", () => {})',
    )
    writeFileSync(join(testDir, 'README.md'), '# Test')
    writeFileSync(
      join(testDir, 'node_modules', 'pkg', 'index.js'),
      'module.exports = {}',
    )
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  describe('discoverFiles', () => {
    it('should discover all files in directory', async () => {
      const files = await discoverFiles(testDir)

      assert.ok(files.some((f) => f.endsWith('src/index.js')))
      assert.ok(files.some((f) => f.endsWith('src/utils.js')))
      assert.ok(files.some((f) => f.endsWith('tests/index.test.js')))
      assert.ok(files.some((f) => f.endsWith('README.md')))
    })

    it('should exclude node_modules by default', async () => {
      const files = await discoverFiles(testDir)

      assert.ok(!files.some((f) => f.includes('node_modules')))
    })

    it('should filter by glob pattern', async () => {
      const files = await discoverFiles(testDir, { pattern: '**/*.js' })

      assert.ok(files.every((f) => f.endsWith('.js')))
      assert.ok(!files.some((f) => f.endsWith('.md')))
    })

    it('should respect custom ignore patterns', async () => {
      const files = await discoverFiles(testDir, {
        ignore: ['**/tests/**'],
      })

      assert.ok(!files.some((f) => f.includes('tests')))
    })
  })

  describe('readFileContent', () => {
    it('should read file content', async () => {
      const content = await readFileContent(join(testDir, 'src', 'index.js'))

      assert.strictEqual(content, 'export default {}')
    })

    it('should return null for non-existent file', async () => {
      const content = await readFileContent(join(testDir, 'nonexistent.js'))

      assert.strictEqual(content, null)
    })
  })

  describe('filterByExtension', () => {
    it('should filter files by extension', () => {
      const files = ['src/index.js', 'src/style.css', 'src/app.ts', 'README.md']

      const jsFiles = filterByExtension(files, ['.js', '.ts'])

      assert.deepStrictEqual(jsFiles, ['src/index.js', 'src/app.ts'])
    })

    it('should return empty array for no matches', () => {
      const files = ['README.md', 'package.json']

      const jsFiles = filterByExtension(files, ['.js'])

      assert.deepStrictEqual(jsFiles, [])
    })
  })
})
