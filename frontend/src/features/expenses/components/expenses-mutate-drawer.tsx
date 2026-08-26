import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { createExpense, expensesQueryOptions } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { DatePicker } from '@/components/date-picker'

type ExpensesMutateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const formSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters.'),
  amount: z
    .string()
    .min(1, 'Amount is required.')
    // Mirrors the server rule: numeric(12,2) = at most 10 integer digits
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Amount must be a valid monetary value.'),
  date: z.date(),
})
type ExpenseForm = z.infer<typeof formSchema>

export function ExpensesMutateDrawer({
  open,
  onOpenChange,
}: ExpensesMutateDrawerProps) {
  const queryClient = useQueryClient()

  const form = useForm<ExpenseForm>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: {
      title: '',
      amount: '',
      date: new Date(),
    },
  })

  const createMutation = useMutation({
    mutationFn: createExpense,
    onSuccess: (newExpense) => {
      queryClient.setQueryData(expensesQueryOptions.queryKey, (old) =>
        old ? { ...old, expenses: [newExpense, ...old.expenses] } : old
      )
      void queryClient.invalidateQueries({ queryKey: ['expenses'] })
      toast.success('Expense created')
      onOpenChange(false)
      form.reset()
    },
  })

  const onSubmit = (data: ExpenseForm) => {
    createMutation.mutate({
      title: data.title,
      amount: data.amount,
      // Normalize to a plain calendar date at the boundary
      date: format(data.date, 'yyyy-MM-dd'),
    })
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        form.reset()
      }}
    >
      <SheetContent className='flex flex-col'>
        <SheetHeader className='text-start'>
          <SheetTitle>Create Expense</SheetTitle>
          <SheetDescription>
            Add a new expense by providing necessary info. Click save when
            you&apos;re done.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id='expenses-form'
            onSubmit={form.handleSubmit(onSubmit)}
            className='flex-1 space-y-6 overflow-y-auto px-4'
          >
            <FormField
              control={form.control}
              name='title'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder='Enter a title' />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='amount'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      inputMode='decimal'
                      placeholder='0.00'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='date'
              render={({ field }) => (
                <FormItem className='flex flex-col'>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <DatePicker
                      selected={field.value}
                      onSelect={(date) => field.onChange(date)}
                      placeholder='Pick a date'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <SheetFooter className='gap-2'>
          <SheetClose asChild>
            <Button variant='outline'>Close</Button>
          </SheetClose>
          <Button
            form='expenses-form'
            type='submit'
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Saving...' : 'Save changes'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
