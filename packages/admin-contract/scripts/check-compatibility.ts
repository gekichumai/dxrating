import { ADMIN_CONTRACT_COMPATIBILITY_ID } from '../src/compatibility.js'
import { computeAdminContractCompatibilityId } from '../src/openapi.js'

const computed = await computeAdminContractCompatibilityId()
if (computed !== ADMIN_CONTRACT_COMPATIBILITY_ID) {
  console.error('Administrator contract compatibility identifier is stale.')
  console.error(`Expected ${computed}, found ${ADMIN_CONTRACT_COMPATIBILITY_ID}.`)
  console.error('Run the openapi:compatibility:update command and commit the generated change.')
  process.exitCode = 1
}