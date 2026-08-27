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

type AdminClientError = {
  message?: string
  status: number
  code?: string
}

function throwIfError(
  error: AdminClientError | null,
  fallback: string
): void {
  if (error) {
    throw new ApiError(error.message || fallback, error.status, error.code)
  }
}

export async function createUser(input: {
  name: string
  email: string
  password: string
  role: UserRole
}): Promise<void> {
  const { error } = await authClient.admin.createUser({
    name: input.name,
    email: input.email,
    password: input.password,
    role: input.role,
  })
  throwIfError(error, 'Failed to create user')
}

/**
 * Edit = name and/or Role. Two admin calls under the hood; each is skipped
 * when unchanged, so renaming yourself never trips the server's
 * you-cannot-change-your-own-role guard.
 */
export async function updateUser(input: {
  userId: string
  name?: string
  role?: UserRole
}): Promise<void> {
  if (input.name !== undefined) {
    const { error } = await authClient.admin.updateUser({
      userId: input.userId,
      data: { name: input.name },
    })
    throwIfError(error, 'Failed to update user')
  }
  if (input.role !== undefined) {
    const { error } = await authClient.admin.setRole({
      userId: input.userId,
      role: input.role,
    })
    throwIfError(error, 'Failed to change role')
  }
}
