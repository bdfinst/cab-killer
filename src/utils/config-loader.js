import { readFile } from 'node:fs/promises'
import { createConfig } from '../models/config.js'

/**
 * Load configuration from file
 */
export async function loadConfig(configPath) {
  if (!configPath) {
    return createConfig()
  }

  try {
    const content = await readFile(configPath, 'utf-8')
    const userConfig = JSON.parse(content)
    return createConfig(userConfig)
  } catch (error) {
    console.error(
      `Warning: Could not load config from ${configPath}:`,
      error.message,
    )
    return createConfig()
  }
}
