import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { expensesQueryOptions } from '@/lib/api'
import { formatCurrency, getDisplayNameInitials } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'

export function RecentExpenses() {
  const { data, isPending, isError } = useQuery(expensesQueryOptions)

  if (isPending) {
    return (
      <div className='space-y-8'>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className='flex items-center gap-4'>
            <Skeleton className='h-9 w-9 rounded-full' />
            <div className='flex-1 space-y-1'>
              <Skeleton className='h-4 w-40' />
              <Skeleton className='h-4 w-24' />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return <p className='text-sm text-destructive'>Failed to load expenses.</p>
  }

  const recent = data.expenses.slice(0, 5)

  if (recent.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        No expenses yet. Create your first one from the Expenses page.
      </p>
    )
  }

  return (
    <div className='space-y-8'>
      {recent.map((expense) => (
        <div key={expense.id} className='flex items-center gap-4'>
          <Avatar className='h-9 w-9'>
            <AvatarFallback>
              {getDisplayNameInitials(expense.title)}
            </AvatarFallback>
          </Avatar>
          <div className='flex flex-1 flex-wrap items-center justify-between'>
            <div className='space-y-1'>
              <p className='text-sm leading-none font-medium'>
                {expense.title}
              </p>
              <p className='text-sm text-muted-foreground'>
                {format(parseISO(expense.date), 'MMM d, yyyy')}
              </p>
            </div>
            <div className='font-medium'>
              {formatCurrency(expense.amount)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
