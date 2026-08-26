import { type Table } from '@tanstack/react-table'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { deleteExpense } from '@/lib/api'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { type Expense } from '../data/schema'

type ExpensesMultiDeleteDialogProps<TData> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: Table<TData>
}

export function ExpensesMultiDeleteDialog<TData>({
  open,
  onOpenChange,
  table,
}: ExpensesMultiDeleteDialogProps<TData>) {
  const queryClient = useQueryClient()
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedCount = selectedRows.length

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      // allSettled: some deletes may succeed server-side even if others fail,
      // so the cache must be refreshed either way (see onSettled).
      const results = await Promise.allSettled(
        ids.map((id) => deleteExpense(id))
      )
      const failedCount = results.filter(
        (result) => result.status === 'rejected'
      ).length
      if (failedCount > 0) {
        throw new Error(
          `Failed to delete ${failedCount} of ${ids.length} expenses`
        )
      }
      return ids
    },
    onSuccess: (ids) => {
      toast.success(
        `${ids.length} expense${ids.length > 1 ? 's' : ''} deleted`
      )
    },
    onError: (error) => {
      toast.error(error.message)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] })
      table.resetRowSelection()
      onOpenChange(false)
    },
  })

  const handleDelete = () => {
    const ids = selectedRows.map((row) => (row.original as Expense).id)
    deleteMutation.mutate(ids)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      destructive
      isLoading={deleteMutation.isPending}
      handleConfirm={handleDelete}
      className='max-w-md'
      title={`Delete ${selectedCount} ${selectedCount > 1 ? 'expenses' : 'expense'}?`}
      desc={
        <>
          You are about to delete{' '}
          <strong>
            {selectedCount} selected{' '}
            {selectedCount > 1 ? 'expenses' : 'expense'}
          </strong>
          . <br />
          This action cannot be undone.
        </>
      }
      confirmText='Delete'
    />
  )
}
