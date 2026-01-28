#!/usr/bin/env node

import { main } from './cli.js'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// Only run when executed directly, not when imported
const isMainModule = resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])

if (isMainModule) {
  main().catch((error) => {
    console.error('Fatal error:', error.message)
    process.exit(1)
  })
}
