import z from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { userQueryOptions } from '@/lib/api'
import { Users } from '@/features/users'
import { userRoles, userStatuses } from '@/features/users/data/schema'

const usersSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  // Facet filters (mutually exclusive — list-users takes one filter clause)
  status: z.array(z.enum(userStatuses)).optional().catch([]),
  role: z.array(z.enum(userRoles)).optional().catch([]),
  // Server-side email search
  email: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/users/')({
  validateSearch: usersSearchSchema,
  // Admin-only. The server refuses non-Admins on every admin call — this
  // guard just keeps them from landing on an empty shell.
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(userQueryOptions)
    if (user.role !== 'admin') {
      throw redirect({ to: '/403' })
    }
  },
  component: Users,
})
