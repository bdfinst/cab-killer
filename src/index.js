#!/usr/bin/env node

import { main } from './cli.js'

main().catch((error) => {
  console.error('Fatal error:', error.message)
  process.exit(1)
})
