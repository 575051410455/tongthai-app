import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { type User, type UserRole, type UserStatus } from './data/schema'

/**
 * User management rides the auth surface (ADR 0001): authClient.admin.*
 * against /api/auth/admin/*, Admin-gated server-side. Nothing here touches
 * the Hono RPC contract.
 */

export type UsersListInput = {
  page: number
  pageSize: number
  email?: string
  role?: UserRole[]
  status?: UserStatus[]
  sortBy?: 'name' | 'email' | 'createdAt'
  sortDirection?: 'asc' | 'desc'
}

type RawUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role?: string | null
  banned?: boolean | null
  createdAt: Date | string
  updatedAt: Date | string
}

function toRow(raw: RawUser): User {
  const banned = raw.banned === true
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email,
    emailVerified: raw.emailVerified,
    role: raw.role === 'admin' ? 'admin' : 'user',
    banned,
    status: banned ? 'banned' : 'active',
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
  }
}

export async function listUsers(
  input: UsersListInput
): Promise<{ users: User[]; total: number }> {
  // list-users accepts one search clause plus at most ONE filter clause, so
  // the toolbar keeps the role/status facets mutually exclusive; role wins
  // here as belt-and-braces if both ever arrive.
  const role = input.role?.length === 1 ? input.role[0] : undefined
  const status = input.status?.length === 1 ? input.status[0] : undefined
  const { data, error } = await authClient.admin.listUsers({
    query: {
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
      sortBy: input.sortBy ?? 'createdAt',
      sortDirection: input.sortDirection ?? 'desc',
      ...(input.email
        ? {
            searchField: 'email' as const,
            searchOperator: 'contains' as const,
            searchValue: input.email,
          }
        : {}),
      ...(role
        ? {
            filterField: 'role',
            filterOperator: 'eq' as const,
            filterValue: role,
          }
        : status
          ? {
              filterField: 'banned',
              filterOperator: 'eq' as const,
              filterValue: status === 'banned',
            }
          : {}),
    },
  })
  if (error) {
    throw new ApiError(
      error.message || 'Failed to list users',
      error.status,
      error.code
    )
  }
  return { users: (data.users as RawUser[]).map(toRow), total: data.total }
}

export const usersQueryOptions = (input: UsersListInput) =>
  queryOptions({
    queryKey: ['users', 'list', input],
    queryFn: () => listUsers(input),
    placeholderData: keepPreviousData,
  })
