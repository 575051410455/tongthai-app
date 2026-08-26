import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { deleteExpense } from '@/lib/api'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ExpensesMutateDrawer } from './expenses-mutate-drawer'
import { useExpenses } from './expenses-provider'

export function ExpensesDialogs() {
  const { open, setOpen, currentRow, setCurrentRow } = useExpenses()
  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: deleteExpense,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('Expense deleted')
    },
  })

  return (
    <>
      <ExpensesMutateDrawer
        key='expense-create'
        open={open === 'create'}
        // Respect the boolean — setOpen is a toggle, and the create mutation
        // fires onOpenChange(false) asynchronously after success.
        onOpenChange={(v) => setOpen(v ? 'create' : null)}
      />

      {currentRow && (
        <ConfirmDialog
          key='expense-delete'
          destructive
          open={open === 'delete'}
          onOpenChange={() => {
            setOpen('delete')
            setTimeout(() => {
              setCurrentRow(null)
            }, 500)
          }}
          isLoading={deleteMutation.isPending}
          handleConfirm={() => {
            deleteMutation.mutate(currentRow.id, {
              onSuccess: () => {
                setOpen(null)
                setTimeout(() => {
                  setCurrentRow(null)
                }, 500)
              },
            })
          }}
          className='max-w-md'
          title={`Delete this expense: ${currentRow.title} ?`}
          desc={
            <>
              You are about to delete the expense{' '}
              <strong>{currentRow.title}</strong>. <br />
              This action cannot be undone.
            </>
          }
          confirmText='Delete'
        />
      )}
    </>
  )
}
