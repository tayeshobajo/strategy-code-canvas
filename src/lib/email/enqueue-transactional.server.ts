import * as React from 'react'
import { render } from 'react-email'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const SITE_NAME = 'Trust Tai'
const SENDER_DOMAIN = 'notify.trusttai.com'
const FROM_DOMAIN = 'trusttai.com'

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Server-side helper to render a registered template and enqueue it for
 * the shared email dispatcher. Mirrors the logic in
 * /lovable/email/transactional/send but callable from other server functions
 * without a self-HTTP call.
 */
export async function enqueueTransactionalEmail(opts: {
  templateName: string
  recipientEmail: string
  templateData?: Record<string, unknown>
  idempotencyKey?: string
}): Promise<{ queued: boolean; reason?: string; messageId?: string }> {
  const template = TEMPLATES[opts.templateName]
  if (!template) {
    throw new Error(`Template '${opts.templateName}' not found`)
  }

  const effectiveRecipient = (template.to || opts.recipientEmail || '').trim()
  if (!effectiveRecipient) throw new Error('recipientEmail is required')
  const normalized = effectiveRecipient.toLowerCase()
  const messageId = crypto.randomUUID()
  const idempotencyKey = opts.idempotencyKey ?? messageId
  const data = opts.templateData ?? {}

  // Suppression check (fail-closed)
  const { data: suppressed, error: suppErr } = await supabaseAdmin
    .from('suppressed_emails')
    .select('id')
    .eq('email', normalized)
    .maybeSingle()
  if (suppErr) throw new Error(`Suppression check failed: ${suppErr.message}`)
  if (suppressed) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: opts.templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
    })
    return { queued: false, reason: 'email_suppressed' }
  }

  // Get or create unsubscribe token
  let unsubscribeToken: string
  const { data: existing } = await supabaseAdmin
    .from('email_unsubscribe_tokens')
    .select('token, used_at')
    .eq('email', normalized)
    .maybeSingle()
  if (existing && !existing.used_at) {
    unsubscribeToken = existing.token
  } else {
    unsubscribeToken = generateToken()
    await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .upsert({ token: unsubscribeToken, email: normalized }, { onConflict: 'email', ignoreDuplicates: true })
    const { data: stored } = await supabaseAdmin
      .from('email_unsubscribe_tokens')
      .select('token')
      .eq('email', normalized)
      .maybeSingle()
    if (stored?.token) unsubscribeToken = stored.token
  }

  // Render
  const element = React.createElement(template.component, data as Record<string, unknown>)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function' ? template.subject(data as Record<string, unknown>) : template.subject

  // Log pending, then enqueue
  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: opts.templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
  })

  const { error: enqErr } = await supabaseAdmin.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: opts.templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })
  if (enqErr) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: opts.templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: enqErr.message,
    })
    throw new Error(`enqueue_email failed: ${enqErr.message}`)
  }

  return { queued: true, messageId }
}
