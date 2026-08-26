import { type InferResponseType } from 'hono/client'
import type { api } from '@/lib/api'

// The row shape comes straight from the Hono RPC response type, so the UI can
// never drift from what the API actually returns.
export type Expense = InferResponseType<
  typeof api.expenses.$get
>['expenses'][number]
