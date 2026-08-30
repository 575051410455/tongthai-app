import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render as baseRender } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { removeUser } from '../api'
import { type User } from '../data/schema'
import { UsersDeleteDialog } from './users-delete-dialog'

vi.mock('../api', () => ({ removeUser: vi.fn() }))

function render(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return baseRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

const MOCK_USER: User = {
  id: 'user-delete-test',
  name: 'John Doe',
  email: 'johndoe@shadcn-admin.com',
  emailVerified: false,
  role: 'user',
  banned: false,
  status: 'active',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-02-02'),
}

describe('UsersDeleteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(removeUser).mockResolvedValue(undefined)
  })

  it('renders the dialog with the correct title, description, input and buttons', async () => {
    const { getByText, getByRole } = await render(
      <UsersDeleteDialog open onOpenChange={vi.fn()} currentRow={MOCK_USER} />
    )

    const title = getByRole('heading', {
      level: 2,
      name: /Delete User/i,
    })
    const desc = getByText(
      new RegExp(`Are you sure you want to delete ${MOCK_USER.email}?`, 'i')
    )
    const emailInput = getByRole('textbox', { name: /Email/i })
    const cancelButton = getByRole('button', { name: /Cancel/i })
    const deleteButton = getByRole('button', { name: /Delete/i })

    await expect.element(title).toBeInTheDocument()
    await expect.element(desc).toBeInTheDocument()
    await expect.element(emailInput).toBeInTheDocument()
    await expect.element(cancelButton).toBeInTheDocument()
    await expect.element(deleteButton).toBeInTheDocument()
    await expect.element(deleteButton).toBeDisabled()
  })

  it('keeps the delete button disabled until the email input is filled correctly', async () => {
    const { getByRole } = await render(
      <UsersDeleteDialog open onOpenChange={vi.fn()} currentRow={MOCK_USER} />
    )

    const emailInput = getByRole('textbox', { name: /Email/i })
    const deleteButton = getByRole('button', { name: /Delete/i })

    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(emailInput, 'wrong-email@example.com')
    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(emailInput, MOCK_USER.email)
    await expect.element(deleteButton).toBeEnabled()
  })

  it('closes the dialog when the cancel button is clicked', async () => {
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <UsersDeleteDialog
        open
        onOpenChange={onOpenChange}
        currentRow={MOCK_USER}
      />
    )

    const cancelButton = getByRole('button', { name: /Cancel/i })
    await userEvent.click(cancelButton)

    expect(onOpenChange).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('resets the email input when the dialog is closed and reopened', async () => {
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type='button' onClick={() => setOpen(true)}>
            Reopen
          </button>
          {open ? (
            <UsersDeleteDialog
              open={open}
              onOpenChange={setOpen}
              currentRow={MOCK_USER}
            />
          ) : null}
        </>
      )
    }

    const { getByRole } = await render(<Harness />)

    const emailInput = getByRole('textbox', { name: /Email/i })
    await userEvent.fill(emailInput, MOCK_USER.email)
    await expect.element(emailInput).toHaveValue(MOCK_USER.email)

    const closeButton = getByRole('button', { name: /Cancel/i })
    await userEvent.click(closeButton)

    const reopenButton = getByRole('button', { name: /Reopen/i })
    await userEvent.click(reopenButton)
    await expect.element(emailInput).toHaveValue('')
  })

  it('deletes the user when confirmed with the exact email', async () => {
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <UsersDeleteDialog
        open
        onOpenChange={onOpenChange}
        currentRow={MOCK_USER}
      />
    )

    const emailInput = getByRole('textbox', { name: /Email/i })
    const deleteButton = getByRole('button', { name: /Delete/i })

    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(emailInput, MOCK_USER.email)

    await expect.element(deleteButton).toBeEnabled()

    await userEvent.click(deleteButton)

    await vi.waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(removeUser).toHaveBeenCalledOnce()
    expect(removeUser).toHaveBeenCalledWith(MOCK_USER.id)
  })

  it('deletes successfully when press Enter key on the email input', async () => {
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <UsersDeleteDialog
        open
        onOpenChange={onOpenChange}
        currentRow={MOCK_USER}
      />
    )

    const emailInput = getByRole('textbox', { name: /Email/i })
    const deleteButton = getByRole('button', { name: /Delete/i })

    await expect.element(deleteButton).toBeDisabled()

    await userEvent.fill(emailInput, MOCK_USER.email)
    await expect.element(deleteButton).toBeEnabled()

    await userEvent.keyboard('{Enter}')

    await vi.waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(removeUser).toHaveBeenCalledOnce()
    expect(removeUser).toHaveBeenCalledWith(MOCK_USER.id)
  })
})
