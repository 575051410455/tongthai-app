import { createAuthClient } from 'better-auth/react'
import { adminClient, inferAdditionalFields } from 'better-auth/client/plugins'
import type { Auth } from '@server/lib/auth'

/**
 * Typed better-auth client (ADR 0001). Auth endpoints are not part of the
 * Hono RPC surface — this client is the frontend's interface to /api/auth,
 * including user management (authClient.admin.*, Admin-gated server-side).
 * Same-origin: baseURL defaults to the window origin, basePath /api/auth.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>(), adminClient()],
})
