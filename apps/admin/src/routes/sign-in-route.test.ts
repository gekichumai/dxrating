import { describe, expect, it, vi } from 'vitest'
import { stripAdminSignInQuery } from './sign-in-route'

describe('administrator sign-in callback cleanup', () => {
  it('removes the complete provider-controlled query without retaining it in history', () => {
    const replaceState = vi.fn()
    const history = { replaceState, state: { route: 'sign-in' } }

    stripAdminSignInQuery({ hash: '#continue', history, pathname: '/sign-in' })

    expect(replaceState).toHaveBeenCalledWith(history.state, '', '/sign-in#continue')
  })
})