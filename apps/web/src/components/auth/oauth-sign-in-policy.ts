export type PublicOauthProvider = 'github' | 'google'

export const createPublicOauthSignInInput = ({
  callbackURL,
  isSignUp,
  provider,
}: {
  readonly callbackURL: string
  readonly isSignUp: boolean
  readonly provider: PublicOauthProvider
}) => ({
  callbackURL,
  errorCallbackURL: callbackURL,
  provider,
  requestSignUp: isSignUp,
})