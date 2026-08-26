import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { userQueryOptions } from '@/lib/api'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

const accountFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Please enter your name.')
    .min(2, 'Name must be at least 2 characters.')
    .max(30, 'Name must not be longer than 30 characters.'),
})

type AccountFormValues = z.infer<typeof accountFormSchema>

export function AccountForm() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    values: { name: user?.name ?? '' },
  })

  const updateMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await authClient.updateUser({ name })
      if (error) throw new Error(error.message || 'Could not update profile.')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: userQueryOptions.queryKey,
      })
      toast.success('Profile updated.')
    },
    onError: (error) => {
      toast.error(error.message)
    },
  })

  function onSubmit(data: AccountFormValues) {
    updateMutation.mutate(data.name)
  }

  const isLoading = updateMutation.isPending

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
        <FormField
          control={form.control}
          name='name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder='Your name' {...field} />
              </FormControl>
              <FormDescription>
                This is the name displayed in the app
                {user ? ` for ${user.email}` : ''}.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type='submit' disabled={isLoading}>
          {isLoading && <Loader2 className='animate-spin' />}
          Update account
        </Button>
      </form>
    </Form>
  )
}
