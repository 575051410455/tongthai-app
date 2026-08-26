import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { ResetPasswordForm } from './reset-password-form'

function renderForm() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ResetPasswordForm token='tok-123' />
    </QueryClientProvider>
  )
}

const resetPassword = vi.fn((_args: unknown) =>
  Promise.resolve({ error: null })
)
const navigate = vi.fn()

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    resetPassword: (args: unknown) => resetPassword(args),
  },
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resets with the emailed token and sends the user to sign-in', async () => {
    const { getByLabelText, getByRole } = await renderForm()

    await userEvent.fill(getByLabelText(/^new password$/i), 'new-password-456')
    await userEvent.fill(
      getByLabelText(/confirm new password/i),
      'new-password-456'
    )
    await userEvent.click(getByRole('button', { name: /reset password/i }))

    await vi.waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith({
        newPassword: 'new-password-456',
        token: 'tok-123',
      })
      expect(navigate).toHaveBeenCalledWith({ to: '/sign-in', replace: true })
    })
  })

  it('blocks submission when the passwords do not match', async () => {
    const { getByLabelText, getByRole, getByText } = await renderForm()

    await userEvent.fill(getByLabelText(/^new password$/i), 'new-password-456')
    await userEvent.fill(getByLabelText(/confirm new password/i), 'different')
    await userEvent.click(getByRole('button', { name: /reset password/i }))

    await expect.element(getByText(/don't match/i)).toBeVisible()
    expect(resetPassword).not.toHaveBeenCalled()
  })
})
