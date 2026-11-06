// gdp-ts `ViewerIs`: the runtime backstop for what TypeScript cannot see (see src/test/gdp-mistakes.ts for the rest).
import { describe, expect, it } from 'vitest'
import { viewerFromSession, viewerId, withViewer, type SessionUser } from '../proofs/viewer-is'

const sessionUser: SessionUser = {
  id: 'synthetic-viewer',
  name: 'Synthetic',
  email: 'synthetic@example.invalid',
  emailVerified: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

describe('ViewerIs', () => {
  it('reads the id of the viewer withViewer named', () => {
    expect(withViewer(viewerFromSession(sessionUser), (viewer, proof) => viewerId(viewer, proof))).toBe(
      'synthetic-viewer',
    )
  })

  it('rejects a spread copy that swaps in another id, though it type-checks', () => {
    expect(() =>
      withViewer(viewerFromSession(sessionUser), (viewer, proof) =>
        viewerId({ ...viewer, value: 'someone-else' }, proof),
      ),
    ).toThrow('ViewerIs: this viewer was not named by withViewer')
  })
})