// This file is loaded via vitest setupFiles BEFORE any test imports.
// It sets env vars so config.ts parses correctly when imported.
import * as dotenv from 'dotenv'
import * as path from 'node:path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test'), override: true })
