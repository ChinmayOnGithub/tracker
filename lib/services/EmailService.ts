import { logger } from '@/lib/logger'

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

export interface EmailProvider {
  name: string
  isConfigured(): boolean
  send(message: EmailMessage): Promise<boolean>
}

export class MockEmailProvider implements EmailProvider {
  name = 'MOCK'
  public sentEmails: EmailMessage[] = []

  isConfigured(): boolean {
    return true
  }

  async send(message: EmailMessage): Promise<boolean> {
    this.sentEmails.push(message)
    logger.info('EmailService', `[MockEmail] Sent to ${message.to}: ${message.subject}`)
    return true
  }

  clear(): void {
    this.sentEmails = []
  }
}

export class ConsoleEmailProvider implements EmailProvider {
  name = 'CONSOLE'

  isConfigured(): boolean {
    return process.env.NODE_ENV !== 'production'
  }

  async send(message: EmailMessage): Promise<boolean> {
    logger.info('EmailService', `[DevEmail] Simulated dispatch to ${message.to}: ${message.subject}`)
    return true
  }
}

export class UnconfiguredEmailProvider implements EmailProvider {
  name = 'UNCONFIGURED'

  isConfigured(): boolean {
    return false
  }

  async send(message: EmailMessage): Promise<boolean> {
    const domain = message.to.includes('@') ? message.to.split('@')[1] : 'unknown'
    logger.warn('EmailService', 'Email provider is not configured. Email was not delivered.', {
      toDomain: domain,
      subject: message.subject
    })
    return false
  }
}

export class ResendEmailProvider implements EmailProvider {
  name = 'RESEND'
  private apiKey: string
  private fromEmail: string

  constructor(apiKey: string, fromEmail = process.env.EMAIL_FROM || 'Tracker OS <noreply@tracker.local>') {
    this.apiKey = apiKey
    this.fromEmail = fromEmail
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey)
  }

  async send(message: EmailMessage): Promise<boolean> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text
        })
      })
      if (!res.ok) {
        const errorText = await res.text()
        logger.error('EmailService', 'Resend API error:', { status: res.status, error: errorText })
        return false
      }
      return true
    } catch (err) {
      logger.error('EmailService', 'Failed to send email via Resend:', { error: String(err) })
      return false
    }
  }
}

function resolveDefaultProvider(): EmailProvider {
  if (process.env.NODE_ENV === 'test') {
    return new MockEmailProvider()
  }
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    return new ResendEmailProvider(resendKey)
  }
  if (process.env.NODE_ENV === 'production') {
    return new UnconfiguredEmailProvider()
  }
  return new ConsoleEmailProvider()
}

let activeProvider: EmailProvider = resolveDefaultProvider()

export class EmailService {
  /**
   * Sets the active email provider. Used in tests and production integrations.
   */
  public static setProvider(provider: EmailProvider | null): void {
    activeProvider = provider || resolveDefaultProvider()
  }

  /**
   * Gets the active email provider.
   */
  public static getProvider(): EmailProvider {
    return activeProvider
  }

  /**
   * Returns whether a real email delivery provider is configured.
   */
  public static isConfigured(): boolean {
    return activeProvider.isConfigured()
  }

  /**
   * Sends an email via the active provider.
   */
  public static async sendEmail(message: EmailMessage): Promise<boolean> {
    try {
      return await activeProvider.send(message)
    } catch (err) {
      logger.error('EmailService', 'Failed to send email:', { error: String(err) })
      return false
    }
  }

  /**
   * Sends a password reset email with canonical token link.
   * Does NOT log the raw token or the full URL containing the raw token.
   */
  public static async sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
    const subject = 'Reset your Tracker OS password'
    const text = `You requested a password reset for Tracker OS.\n\nPlease click the link below to set a new password:\n${resetUrl}\n\nThis link will expire in 30 minutes.\nIf you did not request this, you can safely ignore this email.`
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">Reset your Tracker OS password</h2>
        <p style="margin-bottom: 24px; line-height: 1.6;">You requested a password reset. Click the button below to set a new password. This link is valid for <strong>30 minutes</strong>.</p>
        <p style="margin-bottom: 24px;">
          <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Reset Password</a>
        </p>
        <p style="font-size: 13px; color: #64748b; line-height: 1.5;">If the button does not work, copy and paste this URL into your browser:<br/><span style="color: #2563eb; word-break: break-all;">${resetUrl}</span></p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
        <p style="font-size: 12px; color: #94a3b8;">If you did not request a password reset, no action is needed. Your account remains secure.</p>
      </div>
    `
    return this.sendEmail({ to, subject, html, text })
  }
}
