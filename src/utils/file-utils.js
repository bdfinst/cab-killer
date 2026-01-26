import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { glob } from 'glob'
import {
  isGitRepo,
  getChangedFiles,
  getChangedFilesSinceRef,
} from './git-utils.js'

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
]

/**
 * Discover files in a directory matching patterns
 *
 * @param {string} dir - Directory to search
 * @param {Object} options
 * @param {string} [options.pattern] - Glob pattern (default: all files)
 * @param {string[]} [options.ignore] - Additional patterns to ignore
 * @returns {Promise<string[]>} List of file paths
 */
export async function discoverFiles(dir, options = {}) {
  const { pattern = '**/*', ignore = [] } = options

  const files = await glob(pattern, {
    cwd: dir,
    nodir: true,
    absolute: true,
    ignore: [...DEFAULT_IGNORE, ...ignore],
  })

  return files
}

/**
 * Read file content
 *
 * @param {string} filePath - Path to file
 * @returns {Promise<string|null>} File content or null if not found
 */
export async function readFileContent(filePath) {
  try {
    return await readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Filter files by extension
 *
 * @param {string[]} files - List of file paths
 * @param {string[]} extensions - Extensions to include (e.g., .js, .ts)
 * @returns {string[]} Filtered file paths
 */
export function filterByExtension(files, extensions) {
  return files.filter((file) => extensions.some((ext) => file.endsWith(ext)))
}

/**
 * Get file paths from git diff (changed files mode)
 *
 * @param {string} absolutePath - Absolute path to repository
 * @param {Object} options
 * @param {string} [options.since] - Git ref to compare against
 * @returns {string[]} List of changed file paths
 */
function getGitChangedFilePaths(absolutePath, options) {
  if (!isGitRepo(absolutePath)) {
    throw new Error('--changed requires a git repository')
  }

  const filePaths = options.since
    ? getChangedFilesSinceRef(absolutePath, options.since)
    : getChangedFiles(absolutePath)

  const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs']
  return filterByExtension(filePaths, codeExtensions)
}

/**
 * Get file paths from full directory scan
 *
 * @param {string} absolutePath - Absolute path to scan
 * @param {Object} options
 * @param {string} [options.pattern] - Glob pattern for files
 * @param {string[]} [options.ignore] - Patterns to ignore
 * @returns {Promise<string[]>} List of file paths
 */
async function getFullScanFilePaths(absolutePath, options) {
  return discoverFiles(absolutePath, {
    pattern: options.pattern || '**/*.{js,ts,jsx,tsx,mjs,cjs}',
    ignore: options.ignore || [],
  })
}

/**
 * Read file contents and create file objects
 *
 * @param {string[]} filePaths - Absolute file paths to read
 * @param {string} basePath - Base path to strip from file paths
 * @returns {Promise<Array<{path: string, content: string}>>}
 */
async function readFilesWithContent(filePaths, basePath) {
  const files = []
  for (const filePath of filePaths) {
    const content = await readFileContent(filePath)
    if (content !== null) {
      files.push({
        path: filePath.replace(basePath + '/', ''),
        content,
      })
    }
  }
  return files
}

/**
 * Load changed files from git diff
 *
 * @param {string} targetPath - Path to repository
 * @param {Object} options
 * @param {string} [options.since] - Git ref to compare against
 * @returns {Promise<Array<{path: string, content: string}>>}
 */
export async function loadChangedFiles(targetPath, options = {}) {
  const absolutePath = resolve(targetPath)
  const filePaths = getGitChangedFilePaths(absolutePath, options)
  return readFilesWithContent(filePaths, absolutePath)
}

/**
 * Load all files from directory scan
 *
 * @param {string} targetPath - Path to scan
 * @param {Object} options
 * @param {string} [options.pattern] - Glob pattern for files
 * @param {string[]} [options.ignore] - Patterns to ignore
 * @returns {Promise<Array<{path: string, content: string}>>}
 */
export async function loadAllFiles(targetPath, options = {}) {
  const absolutePath = resolve(targetPath)
  const filePaths = await getFullScanFilePaths(absolutePath, options)
  return readFilesWithContent(filePaths, absolutePath)
}
