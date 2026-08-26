import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { ForgotPasswordForm } from './forgot-password-form'

function renderForm() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ForgotPasswordForm />
    </QueryClientProvider>
  )
}

const requestPasswordReset = vi.fn((_args: unknown) =>
  Promise.resolve({ error: null })
)

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    requestPasswordReset: (args: unknown) => requestPasswordReset(args),
  },
}))

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests a reset link for the entered email', async () => {
    const { getByLabelText, getByRole } = await renderForm()

    await userEvent.fill(getByLabelText(/email/i), 'somchai@example.com')
    await userEvent.click(getByRole('button', { name: /continue/i }))

    await vi.waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith({
        email: 'somchai@example.com',
        redirectTo: '/reset-password',
      })
    })
  })

  it('does not send a request for an invalid email', async () => {
    const { getByLabelText, getByRole } = await renderForm()

    await userEvent.fill(getByLabelText(/email/i), 'not-an-email')
    await userEvent.click(getByRole('button', { name: /continue/i }))

    expect(requestPasswordReset).not.toHaveBeenCalled()
  })
})
