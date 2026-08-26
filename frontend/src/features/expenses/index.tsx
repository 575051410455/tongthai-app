import { useQuery } from '@tanstack/react-query'
import { expensesQueryOptions } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ExpensesDialogs } from './components/expenses-dialogs'
import { ExpensesPrimaryButtons } from './components/expenses-primary-buttons'
import { ExpensesProvider } from './components/expenses-provider'
import { ExpensesTable } from './components/expenses-table'

export function Expenses() {
  const { data, isPending, isError } = useQuery(expensesQueryOptions)

  return (
    <ExpensesProvider>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>Expenses</h2>
            <p className='text-muted-foreground'>
              Here&apos;s a list of your expenses!
            </p>
          </div>
          <ExpensesPrimaryButtons />
        </div>
        {isPending ? (
          <ExpensesTableSkeleton />
        ) : isError ? (
          <p className='text-destructive'>Failed to load expenses.</p>
        ) : (
          <ExpensesTable data={data.expenses} />
        )}
      </Main>

      <ExpensesDialogs />
    </ExpensesProvider>
  )
}

function ExpensesTableSkeleton() {
  return (
    <div className='space-y-2'>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className='h-12 w-full' />
      ))}
    </div>
  )
}
