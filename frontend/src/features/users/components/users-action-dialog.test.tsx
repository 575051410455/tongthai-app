import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { type UserEvent, userEvent } from 'vitest/browser'
import { showSubmittedData } from '@/lib/show-submitted-data'
import { type User } from '../data/schema'
import { UsersActionDialog } from './users-action-dialog'

const VALIDATION_MESSAGES = {
  name: 'Name is required.',
  email: 'Email is required.',
  role: 'Role is required.',
  password: 'Password is required.',
  passwordMismatch: "Passwords don't match.",
  passwordLength: 'Password must be at least 8 characters long.',
  passwordNumber: 'Password must contain at least one number.',
  passwordLowercase: 'Password must contain at least one lowercase letter.',
} as const

const MOCK_USER: User = {
  id: 'alex_uuid',
  name: 'Alex Smith',
  email: 'alex@smith.com',
  emailVerified: true,
  role: 'admin',
  banned: false,
  status: 'active',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-02-02'),
}

vi.mock('@/lib/show-submitted-data', () => ({ showSubmittedData: vi.fn() }))

describe('UsersActionDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('add user', () => {
    it('renders title and description', async () => {
      const { getByRole, getByText } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} />
      )

      const title = getByRole('heading', {
        level: 2,
        name: /Add New User/i,
      })
      const description = getByText(
        /Create new user here. Click save when you're done./i
      )

      await expect.element(title).toBeInTheDocument()
      await expect.element(description).toBeInTheDocument()
    })

    it('shows validation messages when the form is submitted with empty fields', async () => {
      const { getByRole, getByText } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} />
      )

      const submitButton = getByRole('button', { name: /Save Changes/i })
      await userEvent.click(submitButton)

      await expect
        .element(getByText(VALIDATION_MESSAGES.name))
        .toBeInTheDocument()
      await expect
        .element(getByText(VALIDATION_MESSAGES.email))
        .toBeInTheDocument()
      await expect
        .element(getByText(VALIDATION_MESSAGES.role))
        .toBeInTheDocument()
      await expect
        .element(getByText(VALIDATION_MESSAGES.password))
        .toBeInTheDocument()
    })

    it('keeps confirm password disabled until password field is touched', async () => {
      const { getByRole } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} />
      )

      const password = getByRole('textbox', { name: /^Password$/i })
      const confirmPassword = getByRole('textbox', {
        name: /Confirm Password/i,
      })
      await expect.element(confirmPassword).toBeDisabled()

      await userEvent.type(password, 'a')
      await expect.element(confirmPassword).toBeEnabled()
    })

    it('shows password validation messages when password is invalid', async () => {
      const { getByRole, getByText } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} />
      )

      const password = getByRole('textbox', { name: /^Password$/i })
      const confirmPassword = getByRole('textbox', {
        name: /Confirm Password/i,
      })
      await userEvent.type(password, 'a')
      await userEvent.type(confirmPassword, 'b')
      const submitButton = getByRole('button', { name: /Save Changes/i })

      await userEvent.click(submitButton)

      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordMismatch))
        .toBeInTheDocument()

      await userEvent.fill(password, 'short')

      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordLength))
        .toBeInTheDocument()

      await userEvent.fill(password, 'ONLYUPPERCASE')

      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordLowercase))
        .toBeInTheDocument()

      await userEvent.fill(password, 'onlylowercase')

      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordNumber))
        .toBeInTheDocument()

      await userEvent.fill(password, 'S3cur3P@ssw0rd')
      await userEvent.fill(confirmPassword, 'S3cur3P@ssw0rd')

      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordMismatch))
        .not.toBeInTheDocument()
      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordLength))
        .not.toBeInTheDocument()
      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordNumber))
        .not.toBeInTheDocument()
    })

    it('shows the submitted data when the form is submitted successfully', async () => {
      const onOpenChange = vi.fn()

      const screen = await render(
        <UsersActionDialog open onOpenChange={onOpenChange} />
      )

      await fillRequiredProfileFields(userEvent, screen, {
        name: MOCK_USER.name,
        email: MOCK_USER.email,
        roleOption: 'Admin',
      })

      await fillPasswords(userEvent, screen, 'S3cur3P@ssw0rd', 'S3cur3P@ssw0rd')

      const submitButton = screen.getByRole('button', { name: /Save Changes/i })
      await userEvent.click(submitButton)

      expect(onOpenChange).toHaveBeenCalledOnce()
      expect(onOpenChange).toHaveBeenCalledWith(false)

      expect(showSubmittedData).toHaveBeenCalledOnce()
      expect(showSubmittedData).toHaveBeenCalledWith({
        name: MOCK_USER.name,
        email: MOCK_USER.email,
        role: MOCK_USER.role,
        password: 'S3cur3P@ssw0rd',
        confirmPassword: 'S3cur3P@ssw0rd',
        isEdit: false,
      })
    })
  })

  describe('edit user', () => {
    it('renders title and description', async () => {
      const { getByRole, getByText } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} currentRow={MOCK_USER} />
      )

      const title = getByRole('heading', {
        level: 2,
        name: /Edit User/i,
      })
      const description = getByText(
        /Update the name and role here\. Click save when you're done\./i
      )

      await expect.element(title).toBeInTheDocument()
      await expect.element(description).toBeInTheDocument()
    })

    it('offers no password fields and keeps email read-only', async () => {
      const { getByRole } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} currentRow={MOCK_USER} />
      )

      await expect
        .element(getByRole('textbox', { name: /Email/i }))
        .toBeDisabled()
      expect(
        getByRole('textbox', { name: /^Password$/i }).query()
      ).toBeNull()
    })

    it('submits the changed name and role', async () => {
      const onOpenChange = vi.fn()
      const screen = await render(
        <UsersActionDialog
          open
          onOpenChange={onOpenChange}
          currentRow={MOCK_USER}
        />
      )

      const EDITED_NAME = 'John Doe'
      await userEvent.fill(screen.getByLabelText(/name/i), EDITED_NAME)

      const submitButton = screen.getByRole('button', { name: /Save Changes/i })
      await userEvent.click(submitButton)

      expect(onOpenChange).toHaveBeenCalledOnce()
      expect(onOpenChange).toHaveBeenCalledWith(false)

      expect(showSubmittedData).toHaveBeenCalledOnce()
      expect(showSubmittedData).toHaveBeenCalledWith({
        name: EDITED_NAME,
        email: MOCK_USER.email,
        role: MOCK_USER.role,
        password: '',
        confirmPassword: '',
        isEdit: true,
      })
    })
  })
})

async function fillRequiredProfileFields(
  user: UserEvent,
  screen: RenderResult,
  overrides?: {
    name?: string
    email?: string
    roleOption?: string | RegExp
  }
) {
  const entries = [
    [/^name$/i, overrides?.name ?? 'John Doe'],
    [/^email$/i, overrides?.email ?? 'a@b.co'],
  ] as const

  for (const [label, value] of entries) {
    const el = screen.getByLabelText(label)
    await expect.element(el).toBeInTheDocument()
    await user.fill(el, value)
  }

  const roleSelect = screen.getByRole('combobox', { name: /Role/i })
  await user.click(roleSelect)
  await user.click(
    screen.getByRole('option', { name: overrides?.roleOption ?? 'User' })
  )
}

async function fillPasswords(
  user: UserEvent,
  screen: RenderResult,
  a: string,
  b: string
) {
  const password = screen.getByLabelText(/^Password$/i)
  const confirmPassword = screen.getByLabelText(/^Confirm Password$/i)
  await user.fill(password, a)
  await user.fill(confirmPassword, b)
}
