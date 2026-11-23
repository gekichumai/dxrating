import { Context, Data, Duration, Effect, FiberSet, Layer } from 'effect'
import { HttpBody } from 'effect/http'
import { AppConfig } from '../config'
import { Sentry } from '../lib/functions/sentry'
import { HttpClient } from './http-client'

/**
 * Outgoing email (gekichumai/meta#80): verification links and password resets. One of three transports, chosen by the
 * environment (`config.email`):
 *
 * - `resend`: Resend's HTTP API (`RESEND_API_KEY`, sent from `EMAIL_FROM`);
 * - `disabled`: no key, which is how every deployment ran before mail existed. Nothing can be sent, and Better Auth's
 *   mail-dependent features stay off (`enabled: false`);
 * - `memory`: an in-process outbox ({@link memoryOutbox}), for tests only.
 */

/** A message to one recipient. Both bodies say the same thing: clients that can't show HTML show `text`. */
export interface Mail {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html: string
  /** What the message is for (`verify_email`, `reset_password`): tags it at the provider and in error reports */
  readonly kind: string
}

/** Sending is off: no transport is configured */
export class MailerUnavailable extends Data.TaggedError('MailerUnavailable')<{}> {}

/** The provider refused the message or could not be reached */
export class MailerError extends Data.TaggedError('MailerError')<{
  readonly kind: string
  readonly status?: number
  readonly cause: unknown
}> {}

export type MailerTransport = 'resend' | 'memory' | 'disabled'

export class Mailer extends Context.Service<
  Mailer,
  {
    readonly transport: MailerTransport
    /** Whether mail can be sent at all; mail-dependent features check this before they turn on */
    readonly enabled: boolean
    /** Sends and waits for the provider's answer */
    readonly send: (mail: Mail) => Effect.Effect<void, MailerError | MailerUnavailable>
    /**
     * Sends without waiting: the caller's request does not take the provider's time (nor reveal, by taking it, that a
     * message went out). A failure is logged and reported. Sends still running at shutdown are interrupted.
     */
    readonly deliver: (mail: Mail) => Effect.Effect<void>
  }
>()('dxrating/Mailer') {}

/** How long one call to the provider may take before the message counts as failed */
export const MAIL_SEND_TIMEOUT = Duration.seconds(10)

export const RESEND_EMAILS_URL = 'https://api.resend.com/emails'

/** The test transport's outbox: everything sent, oldest first */
export class MemoryOutbox {
  readonly sent: Mail[] = []
  clear() {
    this.sent.length = 0
  }
  /** The messages sent to `to` (case aside), oldest first */
  to(address: string) {
    return this.sent.filter((mail) => mail.to.toLowerCase() === address.toLowerCase())
  }
}

/** The outbox of the `memory` transport; empty and unused with the others */
export const memoryOutbox = new MemoryOutbox()

/**
 * Sends one message through Resend (https://resend.com/docs/api-reference/emails/send-email). The provider's error
 * body names the problem (`validation_error`, `rate_limit_exceeded`…); only that name is kept, never the addresses.
 */
export const sendWithResend = Effect.fn('Mailer.resend')(function* (
  credentials: { readonly apiKey: string; readonly from: string },
  mail: Mail,
) {
  const http = yield* HttpClient
  yield* Effect.gen(function* () {
    const response = yield* http.post(RESEND_EMAILS_URL, {
      headers: { Authorization: `Bearer ${credentials.apiKey}`, 'Content-Type': 'application/json' },
      body: HttpBody.jsonUnsafe({
        from: credentials.from,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        tags: [{ name: 'kind', value: mail.kind }],
      }),
    })
    if (response.status >= 200 && response.status < 300) return
    const body: unknown = yield* response.json.pipe(Effect.catch(() => Effect.void))
    const name = typeof body === 'object' && body !== null && 'name' in body ? String(body.name) : undefined
    return yield* new MailerError({ kind: mail.kind, status: response.status, cause: name ?? 'unknown_error' })
  }).pipe(
    Effect.scoped,
    Effect.timeout(MAIL_SEND_TIMEOUT),
    Effect.mapError((cause) => (cause instanceof MailerError ? cause : new MailerError({ kind: mail.kind, cause }))),
  )
})

const reportFailure = (mail: Mail, error: MailerError | MailerUnavailable) =>
  Effect.gen(function* () {
    // Neither the recipient nor the link goes into logs or Sentry: the link signs its holder in
    if (error instanceof MailerUnavailable) {
      yield* Effect.logWarning('Could not send an email: mail is off', { kind: mail.kind })
    } else {
      yield* Effect.logWarning('Could not send an email', { kind: mail.kind, status: error.status })
      yield* Effect.sync(() =>
        Sentry.captureException(new Error(`Email send failed (${mail.kind}): ${String(error.status ?? 'no status')}`), {
          tags: { component: 'mailer', 'mail.kind': mail.kind },
          extra: { status: error.status, cause: error.cause instanceof Error ? error.cause.message : error.cause },
        }),
      )
    }
  })

/** A service from its transport's `send`, with `deliver` forking into a set the layer's scope interrupts on shutdown */
const makeMailer = (
  transport: MailerTransport,
  send: (mail: Mail) => Effect.Effect<void, MailerError | MailerUnavailable>,
) =>
  Effect.gen(function* () {
    const background = yield* FiberSet.make<void, never>()
    return Mailer.of({
      transport,
      enabled: transport !== 'disabled',
      send,
      deliver: (mail) =>
        FiberSet.run(background, send(mail).pipe(Effect.catch((error) => reportFailure(mail, error)))).pipe(
          Effect.asVoid,
        ),
    })
  })

export const MailerLive = Layer.effect(
  Mailer,
  Effect.gen(function* () {
    const config = yield* AppConfig
    const http = yield* HttpClient
    const email = config.email
    switch (email.transport) {
      case 'resend': {
        const credentials = { apiKey: email.resendApiKey, from: email.from }
        return yield* makeMailer('resend', (mail) =>
          sendWithResend(credentials, mail).pipe(Effect.provideService(HttpClient, http)),
        )
      }
      case 'memory':
        return yield* makeMailer('memory', (mail) => Effect.sync(() => void memoryOutbox.sent.push(mail)))
      case 'disabled':
        if (config.nodeEnv !== 'test') {
          yield* Effect.logWarning(
            'RESEND_API_KEY is not set: no email is sent, so no verification mail and no password reset',
          )
        }
        return yield* makeMailer('disabled', () => Effect.fail(new MailerUnavailable()))
    }
  }),
)