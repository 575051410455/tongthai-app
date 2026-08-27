import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { type SortingState } from '@tanstack/react-table'
import { getRouteApi } from '@tanstack/react-router'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { usersQueryOptions } from './api'
import { UsersDialogs } from './components/users-dialogs'
import { UsersPrimaryButtons } from './components/users-primary-buttons'
import { UsersProvider } from './components/users-provider'
import { UsersTable } from './components/users-table'

const route = getRouteApi('/_authenticated/users/')

export function Users() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [sorting, setSorting] = useState<SortingState>([])

  const sort = sorting[0]
  const { data, isLoading } = useQuery(
    usersQueryOptions({
      page: search.page ?? 1,
      pageSize: search.pageSize ?? 10,
      email: search.email || undefined,
      role: search.role,
      status: search.status,
      sortBy: sort ? (sort.id as 'name' | 'email' | 'createdAt') : undefined,
      sortDirection: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
    })
  )

  return (
    <UsersProvider>
      <Header fixed>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight'>User List</h2>
            <p className='text-muted-foreground'>
              Manage your users and their roles here.
            </p>
          </div>
          <UsersPrimaryButtons />
        </div>
        <UsersTable
          data={data?.users ?? []}
          total={data?.total ?? 0}
          isLoading={isLoading}
          sorting={sorting}
          onSortingChange={setSorting}
          search={search}
          navigate={navigate}
        />
      </Main>

      <UsersDialogs />
    </UsersProvider>
  )
}
