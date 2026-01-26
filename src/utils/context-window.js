/**
 * Estimate token count from text
 * Uses rough approximation of ~4 characters per token
 *
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  if (!text) {
    return 0
  }
  return Math.ceil(text.length / 4)
}

/**
 * Chunk files into groups that fit within token limit
 *
 * @param {Array<{path: string, content: string}>} files - Files to chunk
 * @param {number} maxTokens - Maximum tokens per chunk
 * @returns {Array<Array<{path: string, content: string}>>} Chunked files
 */
export function chunkFiles(files, maxTokens) {
  const chunks = []
  let currentChunk = []
  let currentTokens = 0

  for (const file of files) {
    const fileTokens = estimateTokens(file.content) + estimateTokens(file.path)

    // If single file exceeds limit, put it in its own chunk
    if (fileTokens > maxTokens && currentChunk.length === 0) {
      chunks.push([file])
      continue
    }

    // If adding this file would exceed limit, start new chunk
    if (currentTokens + fileTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk)
      currentChunk = []
      currentTokens = 0
    }

    currentChunk.push(file)
    currentTokens += fileTokens
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks.length > 0 ? chunks : [[]]
}

/**
 * Truncate content to fit within token limit, preserving start and end
 *
 * @param {string} content - Content to truncate
 * @param {number} maxTokens - Maximum tokens
 * @returns {string} Truncated content
 */
export function truncateContent(content, maxTokens) {
  const currentTokens = estimateTokens(content)

  if (currentTokens <= maxTokens) {
    return content
  }

  // Keep ~40% from start, ~40% from end, truncate middle
  const maxChars = maxTokens * 4
  const keepChars = Math.floor(maxChars * 0.4)
  const truncateMsg = '\n\n... [truncated] ...\n\n'

  const start = content.slice(0, keepChars)
  const end = content.slice(-keepChars)

  return start + truncateMsg + end
}
