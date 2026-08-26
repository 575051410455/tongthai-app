import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { UserAuthForm } from './user-auth-form'

const login = vi.fn((_v: unknown): Promise<{ name: string }> => Promise.resolve({ name: 'Somchai' }))
const toastError = vi.fn()
const toastSuccess = vi.fn()
const navigate = vi.fn()

vi.mock('@/lib/api', () => ({
  login: (v: unknown) => login(v),
  userQueryOptions: { queryKey: ['auth', 'me'] },
}))

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigate,
    Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
  }
})

function renderForm() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <UserAuthForm />
    </QueryClientProvider>
  )
}

async function submit(
  form: Awaited<ReturnType<typeof renderForm>>,
  email: string,
  password: string
) {
  await userEvent.fill(form.getByLabelText(/^email$/i), email)
  await userEvent.fill(form.getByLabelText(/^password$/i), password)
  await userEvent.click(form.getByRole('button', { name: /^sign in$/i }))
}

describe('UserAuthForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('surfaces a sign-in failure as an error toast and stays put', async () => {
    login.mockRejectedValueOnce(new Error('Invalid email or password'))
    const form = await renderForm()

    await submit(form, 'somchai@example.com', 'wrong-password-1')

    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Invalid email or password')
    })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('welcomes the user and navigates on success', async () => {
    const form = await renderForm()

    await submit(form, 'somchai@example.com', 'correct-horse-battery')

    await vi.waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('Welcome back, Somchai!')
      expect(navigate).toHaveBeenCalledWith({ to: '/', replace: true })
    })
    expect(toastError).not.toHaveBeenCalled()
  })
})
