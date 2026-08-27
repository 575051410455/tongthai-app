'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldBan } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { setBanned } from '../api'
import { type User } from '../data/schema'

type UserBanDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: User
}

export function UsersBanDialog({
  open,
  onOpenChange,
  currentRow,
}: UserBanDialogProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => setBanned({ userId: currentRow.id, banned: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'list'] })
      toast.success(`${currentRow.email} has been banned`)
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Something went wrong'
      )
    },
  })

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={() => mutation.mutate()}
      isLoading={mutation.isPending}
      title={
        <span className='text-destructive'>
          <ShieldBan
            className='me-1 inline-block stroke-destructive'
            size={18}
          />{' '}
          Ban User
        </span>
      }
      desc={
        <p>
          Are you sure you want to ban{' '}
          <span className='font-bold'>{currentRow.email}</span>?
          <br />
          They will be signed out everywhere and unable to sign in until
          unbanned. Their data is kept.
        </p>
      }
      confirmText='Ban'
      destructive
    />
  )
}
