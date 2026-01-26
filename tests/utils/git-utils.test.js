import { describe, it } from 'node:test'
import assert from 'node:assert'
import { isGitRepo } from '../../src/utils/git-utils.js'
import { tmpdir } from 'node:os'

describe('git-utils', () => {
  describe('isGitRepo', () => {
    it('should return true for a git repository', () => {
      // The project root is a git repo
      const result = isGitRepo(process.cwd())
      assert.strictEqual(result, true)
    })

    it('should return false for non-git directory', () => {
      const result = isGitRepo(tmpdir())
      assert.strictEqual(result, false)
    })
  })

  // Note: getChangedFiles and getChangedFilesSinceRef are harder to test
  // in isolation as they depend on actual git state
})
