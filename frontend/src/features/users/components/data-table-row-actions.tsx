import { DotsHorizontalIcon } from '@radix-ui/react-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type Row } from '@tanstack/react-table'
import { ShieldBan, ShieldCheck, Trash2, UserPen } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setBanned } from '../api'
import { type User } from '../data/schema'
import { useUsers } from './users-provider'

type DataTableRowActionsProps = {
  row: Row<User>
}

export function DataTableRowActions({ row }: DataTableRowActionsProps) {
  const { setOpen, setCurrentRow } = useUsers()
  const { user: me } = useAuth()
  const queryClient = useQueryClient()
  // Acting on yourself is refused server-side; don't offer it either
  const isSelf = row.original.id === me?.id

  const unban = useMutation({
    mutationFn: () => setBanned({ userId: row.original.id, banned: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'list'] })
      toast.success(`${row.original.email} has been unbanned`)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Something went wrong'
      )
    },
  })

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='flex h-8 w-8 p-0 data-[state=open]:bg-muted'
          >
            <DotsHorizontalIcon className='h-4 w-4' />
            <span className='sr-only'>Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='w-40'>
          <DropdownMenuItem
            onClick={() => {
              setCurrentRow(row.original)
              setOpen('edit')
            }}
          >
            Edit
            <DropdownMenuShortcut>
              <UserPen size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          {row.original.banned ? (
            <DropdownMenuItem
              disabled={unban.isPending}
              onClick={() => unban.mutate()}
            >
              Unban
              <DropdownMenuShortcut>
                <ShieldCheck size={16} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={isSelf}
              onClick={() => {
                setCurrentRow(row.original)
                setOpen('ban')
              }}
            >
              Ban
              <DropdownMenuShortcut>
                <ShieldBan size={16} />
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={isSelf}
            onClick={() => {
              setCurrentRow(row.original)
              setOpen('delete')
            }}
            className='text-red-500!'
          >
            Delete
            <DropdownMenuShortcut>
              <Trash2 size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
