import { Effect, Layer } from 'effect'
import type * as MailerModule from '../services/mailer'

/**
 * An in-memory Mailer for integration tests. A test file swaps it in for the real one before anything imports the
 * application:
 *
 *   vi.mock('../services/mailer', async (importOriginal) =>
 *     (await import('./memory-mailer')).withMemoryMailer(await importOriginal()),
 *   )
 *
 * and reads what was sent from {@link memoryOutbox}.
 */

type Mail = MailerModule.Mail

/** Everything sent, oldest first */
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

export const memoryOutbox = new MemoryOutbox()

/** The mailer module with `MailerLive` sending into {@link memoryOutbox} */
export const withMemoryMailer = (original: typeof MailerModule): typeof MailerModule => ({
  ...original,
  MailerLive: Layer.effect(
    original.Mailer,
    original.makeMailer(true, (mail) => Effect.sync(() => void memoryOutbox.sent.push(mail))),
  ) as typeof original.MailerLive,
})