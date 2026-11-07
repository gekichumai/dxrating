// Graceful shutdown: SIGTERM lets an in-flight request finish while new requests are refused.
import { spawn, type ChildProcess } from 'node:child_process'
import { request } from 'node:http'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const backendRoot = path.resolve(__dirname, '../..')
const tsx = path.resolve(backendRoot, '../../node_modules/.bin/tsx')

let child: ChildProcess | undefined

afterEach(() => {
  if (child && child.exitCode === null) child.kill('SIGKILL')
})

function start() {
  child = spawn(tsx, ['src/test/fixtures/drain-server.ts'], {
    cwd: backendRoot,
    env: { ...process.env, SLOW_MS: '1500' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  const exited = new Promise<number | null>((resolve) => child!.once('exit', (code) => resolve(code)))
  const ready = new Promise<number>((resolve, reject) => {
    child!.stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      const match = /READY (\d+)/.exec(output)
      if (match) resolve(Number(match[1]))
    })
    child!.stderr!.on('data', (chunk: Buffer) => (output += chunk.toString()))
    void exited.then(() => reject(new Error(`drain server exited early:\n${output}`)))
  })
  return { ready, exited, output: () => output }
}

/** One request on its own connection (no keep-alive pool), resolving to the status and body, or the socket error. */
function get(port: number, pathname: string, agentOptions: { reuse?: import('node:http').Agent } = {}) {
  return new Promise<{ status: number; body: string } | { error: string }>((resolve) => {
    const req = request({ host: '127.0.0.1', port, path: pathname, agent: agentOptions.reuse ?? false }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', (error: NodeJS.ErrnoException) => resolve({ error: error.code ?? error.message }))
    req.end()
  })
}

describe('graceful shutdown', () => {
  it('lets an in-flight request finish after SIGTERM, refuses new ones and exits once drained', async () => {
    const server = start()
    const port = await server.ready
    expect(await get(port, '/health')).toEqual({ status: 200, body: '{"status":"ok"}' })

    const inFlight = get(port, '/slow')
    await new Promise((resolve) => setTimeout(resolve, 300))
    const signalledAt = Date.now()
    child!.kill('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 200))

    // A new connection is refused while the in-flight request is still running
    expect(await get(port, '/health')).toEqual({ error: 'ECONNREFUSED' })

    expect(await inFlight).toEqual({ status: 200, body: 'completed' })
    await server.exited
    expect(server.output()).toContain('DRAINED')
    // It waited for the request (about 1.2s left) and no longer than the drain bound
    expect(Date.now() - signalledAt).toBeGreaterThan(900)
    expect(Date.now() - signalledAt).toBeLessThan(20_000)
  }, 30_000)
})