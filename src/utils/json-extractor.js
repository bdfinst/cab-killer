/**
 * Extract JSON from a response string that may contain markdown or other text.
 * Handles various formats Claude might return.
 *
 * @param {string} response - Raw response text
 * @returns {string} Extracted JSON string
 */
export function extractJsonFromResponse(response) {
  // Check for markdown code block first
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // Try to find JSON object in response
  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0]
  }

  // Return original response if no patterns match
  return response
}
