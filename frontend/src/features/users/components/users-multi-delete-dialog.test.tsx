import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTableMock } from '@/test-utils/tanstack-table'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render as baseRender } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { removeUser } from '../api'
import { type User } from '../data/schema'
import { UsersMultiDeleteDialog } from './users-multi-delete-dialog'

vi.mock('../api', () => ({ removeUser: vi.fn() }))
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'me_uuid', role: 'admin' },
    isSignedIn: true,
    isLoaded: true,
    signOut: vi.fn(),
  }),
}))

function mockUser(id: string): User {
  return {
    id,
    name: `User ${id}`,
    email: `${id}@example.com`,
    emailVerified: false,
    role: 'user',
    banned: false,
    status: 'active',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-02-02'),
  }
}

const SELECTED = [mockUser('user-1'), mockUser('user-2')]

function render(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return baseRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('UsersMultiDeleteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(removeUser).mockResolvedValue(undefined)
  })

  it('renders the dialog with the correct title, description, input and buttons', async () => {
    const { table } = createTableMock(2, SELECTED)

    const { getByRole, getByText } = await render(
      <UsersMultiDeleteDialog open onOpenChange={vi.fn()} table={table} />
    )

    const title = getByRole('heading', {
      level: 2,
      name: /Delete 2 users/i,
    })
    const desc = getByText(
      new RegExp(`Are you sure you want to delete the selected users`, 'i')
    )
    const confirmDeleteInput = getByRole('textbox', {
      name: /Confirm by typing "DELETE"/i,
    })
    const deleteButton = getByRole('button', { name: /Delete/i })

    await expect.element(title).toBeInTheDocument()
    await expect.element(desc).toBeInTheDocument()
    await expect.element(confirmDeleteInput).toBeInTheDocument()
    await expect.element(deleteButton).toBeInTheDocument()
    await expect.element(deleteButton).toBeDisabled()
  })

  it('keeps the delete button disabled until the confirm delete input is filled correctly', async () => {
    const { table } = createTableMock(2, SELECTED)
    const { getByRole } = await render(
      <UsersMultiDeleteDialog open onOpenChange={vi.fn()} table={table} />
    )

    const confirmDeleteInput = getByRole('textbox', {
      name: /Confirm by typing "DELETE"/i,
    })
    const deleteButton = getByRole('button', { name: /Delete/i })

    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(confirmDeleteInput, 'wrong-input')
    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(confirmDeleteInput, 'DELETE')
    await expect.element(deleteButton).toBeEnabled()
  })

  it('closes the dialog when the cancel button is clicked', async () => {
    const { table } = createTableMock(2, SELECTED)
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <UsersMultiDeleteDialog open onOpenChange={onOpenChange} table={table} />
    )

    const cancelButton = getByRole('button', { name: /Cancel/i })
    await userEvent.click(cancelButton)

    expect(onOpenChange).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(removeUser).not.toHaveBeenCalled()
  })

  it('resets the confirm delete input when the dialog is closed and reopened', async () => {
    const { table } = createTableMock(2, SELECTED)

    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type='button' onClick={() => setOpen(true)}>
            Reopen
          </button>
          {open ? (
            <UsersMultiDeleteDialog
              open={open}
              onOpenChange={setOpen}
              table={table}
            />
          ) : null}
        </>
      )
    }

    const { getByRole } = await render(<Harness />)

    const confirmDeleteInput = getByRole('textbox', {
      name: /Confirm by typing "DELETE"/i,
    })
    await userEvent.fill(confirmDeleteInput, 'DELETE')
    await expect.element(confirmDeleteInput).toHaveValue('DELETE')

    const cancelButton = getByRole('button', { name: /Cancel/i })
    await userEvent.click(cancelButton)

    const reopenButton = getByRole('button', { name: /Reopen/i })
    await userEvent.click(reopenButton)
    await expect.element(confirmDeleteInput).toHaveValue('')
  })

  it('deletes every selected user on confirm', async () => {
    const { table, resetRowSelection } = createTableMock(2, SELECTED)
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <UsersMultiDeleteDialog open onOpenChange={onOpenChange} table={table} />
    )

    const confirmDeleteInput = getByRole('textbox', {
      name: /Confirm by typing "DELETE"/i,
    })
    const deleteButton = getByRole('button', { name: /Delete/i })

    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(confirmDeleteInput, 'DELETE')
    await expect.element(deleteButton).toBeEnabled()

    await userEvent.click(deleteButton)

    await vi.waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(removeUser).toHaveBeenCalledTimes(2)
    expect(removeUser).toHaveBeenCalledWith('user-1')
    expect(removeUser).toHaveBeenCalledWith('user-2')
    await vi.waitFor(() => expect(resetRowSelection).toHaveBeenCalledOnce())
  })

  it('deletes successfully when press Enter key on the confirm delete input', async () => {
    const { table, resetRowSelection } = createTableMock(2, SELECTED)
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <UsersMultiDeleteDialog open onOpenChange={onOpenChange} table={table} />
    )

    const confirmDeleteInput = getByRole('textbox', {
      name: /Confirm by typing "DELETE"/i,
    })
    const deleteButton = getByRole('button', { name: /Delete/i })

    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(confirmDeleteInput, 'DELETE')
    await expect.element(deleteButton).toBeEnabled()

    await userEvent.keyboard('{Enter}')

    await vi.waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(removeUser).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(resetRowSelection).toHaveBeenCalledOnce())
  })

  it('refuses the whole batch when your own account is selected', async () => {
    const { table } = createTableMock(2, [mockUser('me_uuid'), ...SELECTED])
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <UsersMultiDeleteDialog open onOpenChange={onOpenChange} table={table} />
    )

    const confirmDeleteInput = getByRole('textbox', {
      name: /Confirm by typing "DELETE"/i,
    })
    await userEvent.fill(confirmDeleteInput, 'DELETE')
    await userEvent.click(getByRole('button', { name: /Delete/i }))

    expect(removeUser).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
