import { queryOptions } from '@tanstack/react-query'
import { hc, type InferResponseType } from 'hono/client'
import { type ApiRoutes } from '@server/app'
import { type CreateExpense } from '@server/sharedTypes'

/**
 * API layer for the self-hosted auth system.
 *
 * - Session = httpOnly cookies (`tt_access` JWT + `tt_refresh` opaque token),
 *   sent automatically on same-origin requests.
 * - Every unsafe request mirrors the readable `tt_csrf` cookie into the
 *   `x-csrf-token` header (double-submit CSRF).
 * - On 401 INVALID_TOKEN the client silently POSTs /api/auth/refresh once and
 *   retries; TOKEN_REVOKED is never retried (all sessions were killed).
 * - On 403 CSRF_MISSING it re-mints the CSRF cookie via GET /api/auth/me and
 *   retries once.
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

const CSRF_COOKIE_NAMES = ['__Host-tt_csrf', 'tt_csrf']
const CSRF_HEADER = 'x-csrf-token'
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function readCsrfToken(): string | undefined {
  for (const name of CSRF_COOKIE_NAMES) {
    const row = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${name}=`))
    if (row) return decodeURIComponent(row.slice(name.length + 1))
  }
  return undefined
}

const baseFetch: typeof fetch = async (input, init) => {
  const method = (init?.method ?? 'GET').toUpperCase()
  const headers = new Headers(init?.headers)
  if (UNSAFE_METHODS.has(method)) {
    const token = readCsrfToken()
    if (token) headers.set(CSRF_HEADER, token)
  }
  return fetch(input, { ...init, headers, credentials: 'same-origin' })
}

async function responseCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.clone().json()) as { code?: string }
    return body.code
  } catch {
    return undefined
  }
}

// Deduplicate concurrent refreshes into a single request
let refreshInFlight: Promise<boolean> | null = null
function tryRefresh(): Promise<boolean> {
  refreshInFlight ??= baseFetch('/api/auth/refresh', { method: 'POST' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

function isAuthEndpoint(input: RequestInfo | URL): boolean {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  return (
    url.includes('/api/auth/refresh') ||
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/register') ||
    url.includes('/api/auth/logout')
  )
}

const authFetch: typeof fetch = async (input, init) => {
  let res = await baseFetch(input, init)

  if (res.status === 403 && (await responseCode(res)) === 'CSRF_MISSING') {
    // Re-mint the CSRF cookie (any authenticated GET does), then retry once
    await baseFetch('/api/auth/me')
    res = await baseFetch(input, init)
    return res
  }

  if (
    res.status === 401 &&
    !isAuthEndpoint(input) &&
    (await responseCode(res)) === 'INVALID_TOKEN'
  ) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      res = await baseFetch(input, init)
    }
  }

  return res
}

const client = hc<ApiRoutes>('/', { fetch: authFetch })

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

// Hono 3's RPC types are a union of every c.json() a handler can return
// (success and error shapes alike) — extract the success variant.
type UserBody<T> = Extract<T, { user: unknown }>

export async function getCurrentUser() {
  const res = await api.auth.me.$get()
  if (!res.ok) {
    await throwApiError(res, 'Not authenticated')
  }
  const data = (await res.json()) as UserBody<
    InferResponseType<typeof api.auth.me.$get>
  >
  return data.user
}

export type AuthUser = UserBody<
  InferResponseType<typeof api.auth.me.$get>
>['user']

export const userQueryOptions = queryOptions({
  queryKey: ['auth', 'me'],
  queryFn: getCurrentUser,
  staleTime: Infinity,
  retry: false,
})

export async function login(value: { email: string; password: string }) {
  const res = await api.auth.login.$post({ json: value })
  if (!res.ok) {
    await throwApiError(res, 'Sign-in failed')
  }
  const data = (await res.json()) as UserBody<
    InferResponseType<typeof api.auth.login.$post>
  >
  return data.user
}

export async function register(value: {
  name: string
  email: string
  password: string
}) {
  const res = await api.auth.register.$post({ json: value })
  if (!res.ok) {
    await throwApiError(res, 'Sign-up failed')
  }
  const data = (await res.json()) as UserBody<
    InferResponseType<typeof api.auth.register.$post>
  >
  return data.user
}

export async function logout(): Promise<void> {
  await api.auth.logout.$post().catch(() => undefined)
}

export async function logoutAll(): Promise<void> {
  const res = await api.auth['logout-all'].$post()
  if (!res.ok) {
    await throwApiError(res, 'Sign-out failed')
  }
}

export async function changePassword(value: {
  currentPassword: string
  newPassword: string
}): Promise<void> {
  const res = await api.auth.me['change-password'].$post({ json: value })
  if (!res.ok) {
    await throwApiError(res, 'Password change failed')
  }
}

// ---------- Expenses ----------

export async function getAllExpenses() {
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

export async function getTotalSpent() {
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
