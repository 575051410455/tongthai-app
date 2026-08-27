import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render as baseRender } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { setBanned } from '../api'
import { type User } from '../data/schema'
import { UsersBanDialog } from './users-ban-dialog'

vi.mock('../api', () => ({ setBanned: vi.fn() }))

const MOCK_USER: User = {
  id: 'user-ban-test',
  name: 'John Doe',
  email: 'johndoe@shadcn-admin.com',
  emailVerified: false,
  role: 'user',
  banned: false,
  status: 'active',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-02-02'),
}

function render(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return baseRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('UsersBanDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(setBanned).mockResolvedValue(undefined)
  })

  it('renders the dialog with the user email and a Ban button', async () => {
    const { getByRole, getByText } = await render(
      <UsersBanDialog open onOpenChange={vi.fn()} currentRow={MOCK_USER} />
    )

    await expect
      .element(getByRole('heading', { level: 2, name: /Ban User/i }))
      .toBeInTheDocument()
    await expect
      .element(getByText(MOCK_USER.email))
      .toBeInTheDocument()
    await expect
      .element(getByRole('button', { name: /^Ban$/i }))
      .toBeInTheDocument()
  })

  it('bans the user on confirm and closes', async () => {
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <UsersBanDialog
        open
        onOpenChange={onOpenChange}
        currentRow={MOCK_USER}
      />
    )

    await userEvent.click(getByRole('button', { name: /^Ban$/i }))

    await vi.waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
    expect(setBanned).toHaveBeenCalledOnce()
    expect(setBanned).toHaveBeenCalledWith({
      userId: MOCK_USER.id,
      banned: true,
    })
  })

  it('closes without banning when cancelled', async () => {
    const onOpenChange = vi.fn()
    const { getByRole } = await render(
      <UsersBanDialog
        open
        onOpenChange={onOpenChange}
        currentRow={MOCK_USER}
      />
    )

    await userEvent.click(getByRole('button', { name: /Cancel/i }))

    expect(setBanned).not.toHaveBeenCalled()
  })
})
