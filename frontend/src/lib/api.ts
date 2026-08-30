import { queryOptions } from '@tanstack/react-query'
import { hc } from 'hono/client'
import { type ApiRoutes } from '@server/app'
import { type CreateExpense } from '@server/sharedTypes'
import { authClient } from '@/lib/auth-client'

/**
 * API layer for the better-auth session model (ADR 0001).
 *
 * - Session = one httpOnly DB-backed session cookie (`tt.*`), sent
 *   automatically on same-origin requests. No CSRF token, no silent refresh:
 *   a dead session simply 401s and the route guard redirects to sign-in.
 * - Auth flows go through the typed better-auth client; only the expense
 *   routes remain on Hono RPC.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const client = hc<ApiRoutes>('/')

export const api = client.api

// Accepts both real Responses and hono's ClientResponse
type JsonResponseLike = {
  status: number
  clone: () => { json: () => Promise<unknown> }
}

async function throwApiError(
  res: JsonResponseLike,
  fallback: string
): Promise<never> {
  let message = fallback
  let code: string | undefined
  try {
    const body = (await res.clone().json()) as { error?: string; code?: string }
    if (typeof body.error === 'string') message = body.error
    code = body.code
  } catch {
    // non-JSON body — keep the fallback message
  }
  throw new ApiError(message, res.status, code)
}

// ---------- Auth ----------

type AuthUser = (typeof authClient.$Infer.Session)['user']

type AuthClientError = {
  message?: string
  status: number
  code?: string
}

function throwAuthError(error: AuthClientError, fallback: string): never {
  throw new ApiError(error.message || fallback, error.status, error.code)
}

async function getCurrentUser(): Promise<AuthUser> {
  const { data, error } = await authClient.getSession()
  if (error) throwAuthError(error, 'Not authenticated')
  if (!data) throw new ApiError('Not authenticated', 401, 'UNAUTHENTICATED')
  return data.user
}

export const userQueryOptions = queryOptions({
  queryKey: ['auth', 'me'],
  queryFn: getCurrentUser,
  staleTime: Infinity,
  retry: false,
})

export async function login(value: { email: string; password: string }) {
  const { error } = await authClient.signIn.email(value)
  if (error) throwAuthError(error, 'Sign-in failed')
  return getCurrentUser()
}

export async function register(value: {
  name: string
  email: string
  password: string
}) {
  const { error } = await authClient.signUp.email(value)
  if (error) throwAuthError(error, 'Sign-up failed')
  return getCurrentUser()
}

export async function logout(): Promise<void> {
  await authClient.signOut().catch(() => undefined)
}

// ---------- Expenses ----------

async function getAllExpenses() {
  const res = await api.expenses.$get()
  if (!res.ok) {
    await throwApiError(res, 'Failed to fetch expenses')
  }
  return await res.json()
}

export const expensesQueryOptions = queryOptions({
  queryKey: ['expenses', 'list'],
  queryFn: getAllExpenses,
  staleTime: 1000 * 60 * 5,
})

async function getTotalSpent() {
  const res = await api.expenses['total-spent'].$get()
  if (!res.ok) {
    await throwApiError(res, 'Failed to fetch total spent')
  }
  return await res.json()
}

export const totalSpentQueryOptions = queryOptions({
  queryKey: ['expenses', 'total-spent'],
  queryFn: getTotalSpent,
})

export async function createExpense(value: CreateExpense) {
  const res = await api.expenses.$post({ json: value })
  if (!res.ok) {
    await throwApiError(res, 'Failed to create expense')
  }
  return await res.json()
}

export async function deleteExpense(id: number) {
  const res = await api.expenses[':id{[0-9]+}'].$delete({
    param: { id: id.toString() },
  })
  if (!res.ok) {
    await throwApiError(res, 'Failed to delete expense')
  }
  return await res.json()
}
