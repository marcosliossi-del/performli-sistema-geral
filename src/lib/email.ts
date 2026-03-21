import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export const FROM_EMAIL = process.env.FROM_EMAIL ?? 'alertas@performli.com.br'
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
}

/**
 * Sends an email via Resend.
 * Silently swallows errors in development when RESEND_API_KEY is not set.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping email:', opts.subject)
    return false
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
    })
    if (error) {
      console.error('[email] Resend error:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[email] Unexpected error:', err)
    return false
  }
}
