// Resend wrapper with console fallback for local/no-creds.
// Returns true on send; false on failure. Always logs the link so dev can copy it.

import { Resend } from 'resend'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM = process.env.EMAIL_FROM ?? 'Genesis Swarm <onboarding@resend.dev>'

const client = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

export async function sendMagicLink(email: string, link: string): Promise<{ delivered: boolean; via: 'resend' | 'console' }> {
  // Always log to server so dev can recover from console
  console.log(`[auth] magic link for ${email}: ${link}`)

  if (!client) return { delivered: false, via: 'console' }

  try {
    await client.emails.send({
      from: FROM,
      to: email,
      subject: 'Your Genesis Swarm sign-in link',
      html: `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#111">
  <h1 style="font-size:22px;font-weight:900;letter-spacing:.05em;color:#00aa55">GENESIS SWARM</h1>
  <p style="font-size:14px;color:#444">Tap the button to sign in to your Genesis Swarm dashboard. This link expires in 15 minutes.</p>
  <a href="${link}" style="display:inline-block;margin:18px 0;padding:14px 24px;background:#00cc6a;color:#000;font-weight:900;text-decoration:none;border-radius:6px;letter-spacing:.05em;font-size:13px">
    SIGN IN TO DASHBOARD →
  </a>
  <p style="font-size:11px;color:#888;margin-top:24px">If the button doesn't work, paste this URL into your browser:<br><span style="color:#00aa55;word-break:break-all">${link}</span></p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #eee">
  <p style="font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:.1em">Genesis Swarm · RegTech AI · Luxembourg · CSSF-aligned</p>
</div>
      `,
      text: `Sign in to Genesis Swarm:\n\n${link}\n\nThis link expires in 15 minutes.`,
    })
    return { delivered: true, via: 'resend' }
  } catch (e) {
    console.error('[email] resend send failed', e)
    return { delivered: false, via: 'console' }
  }
}
