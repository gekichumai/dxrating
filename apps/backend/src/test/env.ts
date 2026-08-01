// This file is loaded via vitest setupFiles BEFORE any test imports.
// It provides local defaults while preserving explicit CI/test-runner values.
import * as dotenv from 'dotenv'
import * as path from 'node:path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.test'), override: false })