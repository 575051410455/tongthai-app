import { createFileRoute, redirect } from '@tanstack/react-router'
import { userQueryOptions } from '@/lib/api'
import { AuthenticatedLayout } from '@/components/layout/authenticated-layout'

export const Route = createFileRoute('/_authenticated')({
  // Every page under this layout requires a valid session — the server is
  // the source of truth (GET /api/auth/me), cached for the app's lifetime.
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData(userQueryOptions)
    } catch {
      throw redirect({
        to: '/sign-in',
        search: { redirect: location.href },
      })
    }
  },
  component: AuthenticatedLayout,
})
