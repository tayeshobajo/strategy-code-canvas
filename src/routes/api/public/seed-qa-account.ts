// Token-guarded QA seed endpoint. Creates (or resets) a confirmed operator/admin
// test user so QA automation can sign in without a real invite flow.
// Guarded by the QA_SEED_TOKEN secret (bearer). Never expose that token to clients.
import { createFileRoute } from '@tanstack/react-router'

const QA_EMAIL = 'qa-operator@trust-tai.com'

function unauthorized() {
  return new Response('Unauthorized', { status: 401 })
}

export const Route = createFileRoute('/api/public/seed-qa-account')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.QA_SEED_TOKEN
        const password = process.env.QA_SEED_PASSWORD
        if (!token || !password) {
          return new Response('Seed not configured', { status: 500 })
        }
        const auth = request.headers.get('authorization') ?? ''
        const provided = auth.startsWith('Bearer ') ? auth.slice(7) : ''
        if (provided.length !== token.length) return unauthorized()
        // constant-time compare
        let diff = 0
        for (let i = 0; i < token.length; i++) diff |= provided.charCodeAt(i) ^ token.charCodeAt(i)
        if (diff !== 0) return unauthorized()

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

        // Find or create the auth user.
        let userId: string | null = null
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        })
        if (listErr) return new Response(`listUsers failed: ${listErr.message}`, { status: 500 })
        const existing = list.users.find((u) => u.email?.toLowerCase() === QA_EMAIL)
        if (existing) {
          userId = existing.id
          const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
            password,
            email_confirm: true,
          })
          if (updErr) return new Response(`updateUser failed: ${updErr.message}`, { status: 500 })
        } else {
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: QA_EMAIL,
            password,
            email_confirm: true,
          })
          if (createErr || !created.user) {
            return new Response(`createUser failed: ${createErr?.message ?? 'unknown'}`, {
              status: 500,
            })
          }
          userId = created.user.id
        }

        // Grant admin + operator roles (idempotent).
        for (const role of ['admin', 'operator'] as const) {
          const { error: roleErr } = await supabaseAdmin
            .from('user_roles')
            .upsert(
              { email: QA_EMAIL, role, user_id: userId, granted_by: 'qa-seed' },
              { onConflict: 'email,role' },
            )
          if (roleErr) {
            return new Response(`grant ${role} failed: ${roleErr.message}`, { status: 500 })
          }
        }

        return Response.json({
          ok: true,
          email: QA_EMAIL,
          userId,
          roles: ['admin', 'operator'],
          note: 'Password is the QA_SEED_PASSWORD secret. Sign in via /auth or /portal/login.',
        })
      },
    },
  },
})
