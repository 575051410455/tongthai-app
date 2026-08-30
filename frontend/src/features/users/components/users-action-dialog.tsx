'use client'

import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import { SelectDropdown } from '@/components/select-dropdown'
import { createUser, updateUser } from '../api'
import { roles } from '../data/data'
import { type User, type UserRole } from '../data/schema'

const formSchema = z
  .object({
    name: z.string().min(1, 'Name is required.'),
    email: z.email({
      error: (iss) => (iss.input === '' ? 'Email is required.' : undefined),
    }),
    // A plain string check (not z.enum): an empty select must fail as a
    // check, not a type error — a type error would stop Zod 4 running the
    // password refinements below.
    role: z.string().min(1, 'Role is required.'),
    password: z.string().transform((pwd) => pwd.trim()),
    confirmPassword: z.string().transform((pwd) => pwd.trim()),
    isEdit: z.boolean(),
  })
  .refine((data) => data.isEdit || data.password.length > 0, {
    message: 'Password is required.',
    path: ['password'],
  })
  .refine(({ isEdit, password }) => isEdit || password.length >= 8, {
    message: 'Password must be at least 8 characters long.',
    path: ['password'],
  })
  .refine(({ isEdit, password }) => isEdit || /[a-z]/.test(password), {
    message: 'Password must contain at least one lowercase letter.',
    path: ['password'],
  })
  .refine(({ isEdit, password }) => isEdit || /\d/.test(password), {
    message: 'Password must contain at least one number.',
    path: ['password'],
  })
  .refine(
    ({ isEdit, password, confirmPassword }) =>
      isEdit || password === confirmPassword,
    {
      message: "Passwords don't match.",
      path: ['confirmPassword'],
    }
  )
type UserForm = z.infer<typeof formSchema>

type UserActionDialogProps = {
  currentRow?: User
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UsersActionDialog({
  currentRow,
  open,
  onOpenChange,
}: UserActionDialogProps) {
  const isEdit = !!currentRow
  const { user: me } = useAuth()
  // You cannot change your own Role (the server refuses it too)
  const isSelf = isEdit && currentRow.id === me?.id
  const queryClient = useQueryClient()
  const form = useForm<UserForm>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
          name: currentRow.name,
          email: currentRow.email,
          role: currentRow.role,
          password: '',
          confirmPassword: '',
          isEdit,
        }
      : {
          name: '',
          email: '',
          role: '',
          password: '',
          confirmPassword: '',
          isEdit,
        },
  })

  const mutation = useMutation({
    mutationFn: async (values: UserForm) => {
      if (isEdit) {
        await updateUser({
          userId: currentRow.id,
          name: values.name !== currentRow.name ? values.name : undefined,
          role:
            !isSelf && values.role !== currentRow.role
              ? (values.role as UserRole)
              : undefined,
        })
      } else {
        await createUser({
          name: values.name,
          email: values.email,
          password: values.password,
          role: values.role as UserRole,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users', 'list'] })
      toast.success(isEdit ? 'User updated' : 'User created')
      form.reset()
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Something went wrong'
      )
    },
  })

  const onSubmit = (values: UserForm) => mutation.mutate(values)

  const isPasswordTouched = !!form.formState.dirtyFields.password

  return (
    <Dialog
      open={open}
      onOpenChange={(state) => {
        form.reset()
        onOpenChange(state)
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader className='text-start'>
          <DialogTitle>{isEdit ? 'Edit User' : 'Add New User'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the name and role here. '
              : 'Create new user here. '}
            Click save when you&apos;re done.
          </DialogDescription>
        </DialogHeader>
        <div className='w-[calc(100%+0.75rem)] overflow-y-auto py-1 pe-3'>
          <Form {...form}>
            <form
              id='user-form'
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-4 px-0.5'
            >
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-end'>Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='John Doe'
                        className='col-span-4'
                        autoComplete='off'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-end'>Email</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='john.doe@example.com'
                        className='col-span-4'
                        disabled={isEdit}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='role'
                render={({ field }) => (
                  <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                    <FormLabel className='col-span-2 text-end'>Role</FormLabel>
                    <SelectDropdown
                      defaultValue={field.value}
                      onValueChange={field.onChange}
                      placeholder='Select a role'
                      className='col-span-4'
                      disabled={isSelf}
                      items={roles.map(({ label, value }) => ({
                        label,
                        value,
                      }))}
                    />
                    <FormMessage className='col-span-4 col-start-3' />
                  </FormItem>
                )}
              />
              {!isEdit && (
                <>
                  <FormField
                    control={form.control}
                    name='password'
                    render={({ field }) => (
                      <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                        <FormLabel className='col-span-2 text-end'>
                          Password
                        </FormLabel>
                        <FormControl>
                          <PasswordInput
                            placeholder='e.g., S3cur3P@ssw0rd'
                            className='col-span-4'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className='col-span-4 col-start-3' />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='confirmPassword'
                    render={({ field }) => (
                      <FormItem className='grid grid-cols-6 items-center space-y-0 gap-x-4 gap-y-1'>
                        <FormLabel className='col-span-2 text-end'>
                          Confirm Password
                        </FormLabel>
                        <FormControl>
                          <PasswordInput
                            disabled={!isPasswordTouched}
                            placeholder='e.g., S3cur3P@ssw0rd'
                            className='col-span-4'
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className='col-span-4 col-start-3' />
                      </FormItem>
                    )}
                  />
                </>
              )}
            </form>
          </Form>
        </div>
        <DialogFooter>
          <Button type='submit' form='user-form' disabled={mutation.isPending}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
