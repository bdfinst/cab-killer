import { readFile } from 'node:fs/promises'
import { glob } from 'glob'

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
