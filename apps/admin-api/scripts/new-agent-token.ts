// Usage: pnpm --filter @gekichumai/admin-api token:new <principal> <days> <scope> [scope…]
// Prints the token ONCE (give it to the agent) and the ADMIN_AGENT_TOKENS entry (only its hash) for the admin API's env.
import { AGENT_SCOPES, generateAgentToken } from '../src/agent-tokens'

const [principal, days, ...scopes] = process.argv.slice(2)
const unknown = scopes.filter((scope) => !(AGENT_SCOPES as readonly string[]).includes(scope))
if (!principal || !days || scopes.length === 0 || unknown.length > 0 || !(Number(days) > 0 && Number(days) <= 365)) {
  console.error(`usage: token:new <principal> <days 1-365> <scope…>; scopes: ${AGENT_SCOPES.join(', ')}`)
  process.exit(1)
}
const { token, sha256 } = generateAgentToken()
const expiresAt = new Date(Date.now() + Number(days) * 86_400_000).toISOString()
console.log(`Token for agent:${principal} (shown once, store it in the agent's secret store):\n${token}\n`)
console.log(`ADMIN_AGENT_TOKENS entry:\n${JSON.stringify({ principal, sha256, scopes, expiresAt })}`)