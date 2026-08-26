import z from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { Expenses } from '@/features/expenses'

const expenseSearchSchema = z.object({
  page: z.number().optional().catch(1),
  pageSize: z.number().optional().catch(10),
  filter: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/expenses/')({
  validateSearch: expenseSearchSchema,
  component: Expenses,
})
