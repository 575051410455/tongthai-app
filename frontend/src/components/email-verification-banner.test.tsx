import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { EmailVerificationBanner } from './email-verification-banner'

const sendVerificationEmail = vi.fn((_args: unknown) =>
  Promise.resolve({ error: null })
)
let mockUser: { email: string; emailVerified: boolean } | null = {
  email: 'somchai@example.com',
  emailVerified: false,
}

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    sendVerificationEmail: (args: unknown) => sendVerificationEmail(args),
  },
}))

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

describe('EmailVerificationBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser = { email: 'somchai@example.com', emailVerified: false }
  })

  it('shows for an unverified user and resends through the auth client', async () => {
    const { getByRole, getByText } = await render(<EmailVerificationBanner />)

    await expect
      .element(getByText(/verification link to somchai@example\.com/i))
      .toBeVisible()

    await userEvent.click(getByRole('button', { name: /resend email/i }))

    expect(sendVerificationEmail).toHaveBeenCalledWith({
      email: 'somchai@example.com',
      callbackURL: '/',
    })
  })

  it('renders nothing for a verified user', async () => {
    mockUser = { email: 'somchai@example.com', emailVerified: true }
    const { container } = await render(<EmailVerificationBanner />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when signed out', async () => {
    mockUser = null
    const { container } = await render(<EmailVerificationBanner />)
    expect(container.innerHTML).toBe('')
  })
})
