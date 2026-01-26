import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { isGitRepo, getChangedFiles, getChangedFilesSinceRef } from '../../src/utils/git-utils.js'
import { tmpdir } from 'node:os'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

describe('git-utils', () => {
  describe('isGitRepo', () => {
    it('should return true for a git repository', () => {
      // The project root is a git repo
      const result = isGitRepo(process.cwd())
      assert.strictEqual(result, true)
    })

    it('should return false for non-git directory', () => {
      // Create a dedicated temp directory to ensure isolation from any parent .git
      const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-test-'))
      try {
        // Create an empty .git file (not a directory, not a valid gitdir pointer)
        // This blocks git from traversing upward to find any parent .git directory
        writeFileSync(join(nonGitDir, '.git'), '')
        const result = isGitRepo(nonGitDir)
        assert.strictEqual(result, false)
      } finally {
        rmSync(nonGitDir, { recursive: true, force: true })
      }
    })
  })

  describe('getChangedFiles', () => {
    let tempDir

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'git-utils-test-'))
      execSync('git init', { cwd: tempDir, stdio: 'pipe' })
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' })
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' })
      // Create initial commit so we have a valid repo state
      writeFileSync(join(tempDir, 'initial.txt'), 'initial')
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' })
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' })
    })

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true })
    })

    it('should return empty array when no changes', () => {
      const result = getChangedFiles(tempDir)
      assert.deepStrictEqual(result, [])
    })

    it('should detect untracked files', () => {
      writeFileSync(join(tempDir, 'untracked.txt'), 'content')
      const result = getChangedFiles(tempDir)
      assert.deepStrictEqual(result, [join(tempDir, 'untracked.txt')])
    })

    it('should detect staged files', () => {
      writeFileSync(join(tempDir, 'staged.txt'), 'content')
      execSync('git add staged.txt', { cwd: tempDir, stdio: 'pipe' })
      const result = getChangedFiles(tempDir)
      assert.deepStrictEqual(result, [join(tempDir, 'staged.txt')])
    })

    it('should detect unstaged changes to tracked files', () => {
      writeFileSync(join(tempDir, 'initial.txt'), 'modified')
      const result = getChangedFiles(tempDir)
      assert.deepStrictEqual(result, [join(tempDir, 'initial.txt')])
    })

    it('should dedupe files that appear in multiple categories', () => {
      // Modify tracked file, stage it, then modify again
      writeFileSync(join(tempDir, 'initial.txt'), 'modified')
      execSync('git add initial.txt', { cwd: tempDir, stdio: 'pipe' })
      writeFileSync(join(tempDir, 'initial.txt'), 'modified again')
      const result = getChangedFiles(tempDir)
      // Should only appear once despite being in both staged and unstaged
      assert.deepStrictEqual(result, [join(tempDir, 'initial.txt')])
    })

    it('should throw error when called on non-git directory', () => {
      const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-test-'))
      try {
        // Create an empty .git file to block traversal to parent repos
        writeFileSync(join(nonGitDir, '.git'), '')
        assert.throws(
          () => getChangedFiles(nonGitDir),
          /fatal:|not a git repository/i
        )
      } finally {
        rmSync(nonGitDir, { recursive: true, force: true })
      }
    })

    it('should throw error when git command fails due to invalid repo state', () => {
      // Corrupt the git repo by removing the HEAD file
      rmSync(join(tempDir, '.git', 'HEAD'))
      assert.throws(
        () => getChangedFiles(tempDir),
        Error
      )
    })

    it('should throw error when git command fails due to invalid repo state', () => {
      // Corrupt the git repo by creating an invalid .git/HEAD
      writeFileSync(join(tempDir, '.git', 'HEAD'), 'invalid content')
      assert.throws(
        () => getChangedFiles(tempDir),
        Error
      )
    })
  })

  describe('getChangedFilesSinceRef', () => {
    let tempDir

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'git-utils-test-'))
      execSync('git init', { cwd: tempDir, stdio: 'pipe' })
      execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' })
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' })
      // Create initial commit
      writeFileSync(join(tempDir, 'initial.txt'), 'initial')
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' })
      execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' })
    })

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true })
    })

    it('should return empty array when no changes since ref', () => {
      const result = getChangedFilesSinceRef(tempDir, 'HEAD')
      assert.deepStrictEqual(result, [])
    })

    it('should detect files changed since HEAD~1', () => {
      // Make a second commit with a new file
      writeFileSync(join(tempDir, 'second.txt'), 'content')
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' })
      execSync('git commit -m "second"', { cwd: tempDir, stdio: 'pipe' })

      const result = getChangedFilesSinceRef(tempDir, 'HEAD~1')
      assert.deepStrictEqual(result, [join(tempDir, 'second.txt')])
    })

    it('should detect uncommitted changes compared to HEAD', () => {
      writeFileSync(join(tempDir, 'initial.txt'), 'modified')
      const result = getChangedFilesSinceRef(tempDir, 'HEAD')
      assert.deepStrictEqual(result, [join(tempDir, 'initial.txt')])
    })

    it('should throw error with invalid git ref', () => {
      assert.throws(
        () => getChangedFilesSinceRef(tempDir, 'non-existent-branch-xyz'),
        /unknown revision|bad revision|not a valid object name/i
      )
    })
  })
})
