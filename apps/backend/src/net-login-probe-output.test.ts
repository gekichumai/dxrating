import { describe, expect, it } from 'vitest'
import { NetImportError } from './lib/functions/client'
import { describeProbeResult } from './net-login-probe-output'

describe('the login probe RESULT line', () => {
  it('never prints the submitted ID, even when SEGA echoes it in the raw error message', () => {
    const error = new NetImportError('INVALID_CREDENTIALS', 'synthetic-id is locked. Try later.', {
      step: 'login_submit',
      upstreamMessage: '[id] is locked. Try later.',
    })
    const line = describeProbeResult({ ok: false, error }, 'synthetic-id')
    expect(line).not.toContain('synthetic-id')
    expect(line).toBe(
      'RESULT: INVALID_CREDENTIALS step=login_submit net_error_code=- message="[id] is locked. Try later." upstream="[id] is locked. Try later."',
    )
  })

  it('removes the ID and query strings from transport errors', () => {
    const error = {
      _tag: 'NetRequestError',
      operation: 'request maimai NET',
      cause: new Error('synthetic-id at https://x/?ssid=abc'),
    }
    const line = describeProbeResult({ ok: false, error }, 'synthetic-id')
    expect(line).toBe('RESULT: NetRequestError request maimai NET Error: [id] at https://x/?…')
  })

  it('reports a success with the record count only', () => {
    expect(describeProbeResult({ ok: true, recent: 50 }, 'synthetic-id')).toBe(
      'RESULT: success, logged in and read 50 recent records',
    )
  })
})