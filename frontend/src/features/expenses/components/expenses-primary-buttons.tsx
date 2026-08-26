import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useExpenses } from './expenses-provider'

export function ExpensesPrimaryButtons() {
  const { setOpen } = useExpenses()
  return (
    <div className='flex gap-2'>
      <Button className='space-x-1' onClick={() => setOpen('create')}>
        <span>Add Expense</span> <Plus size={18} />
      </Button>
    </div>
  )
}
