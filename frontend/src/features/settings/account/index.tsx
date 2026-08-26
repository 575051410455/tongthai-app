import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import useDialogState from '@/hooks/use-dialog-state'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { ContentSection } from '../components/content-section'
import { AccountForm } from './account-form'
import { ChangePasswordForm } from './change-password-form'

export function SettingsAccount() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [signOutAllOpen, setSignOutAllOpen] = useDialogState()

  const handleSignOutEverywhere = () => {
    // Revoke every session server-side; navigate regardless so a network
    // hiccup can't trap the user signed in (same posture as SignOutDialog).
    void authClient
      .revokeSessions()
      .catch(() => undefined)
      .finally(() => {
        queryClient.clear()
        navigate({ to: '/sign-in', replace: true })
      })
  }

  return (
    <ContentSection
      title='Account'
      desc='Update your profile, change your password, and manage your sessions.'
    >
      <div className='space-y-8'>
        <AccountForm />

        <Separator />

        <div className='space-y-4'>
          <div>
            <h3 className='text-base font-medium'>Change password</h3>
            <p className='text-sm text-muted-foreground'>
              Confirm your current password to set a new one.
            </p>
          </div>
          <ChangePasswordForm />
        </div>

        <Separator />

        <div className='space-y-4'>
          <div>
            <h3 className='text-base font-medium'>Sessions</h3>
            <p className='text-sm text-muted-foreground'>
              Signed in somewhere you don't recognize? Sign out on every
              device at once.
            </p>
          </div>
          <Button
            variant='destructive'
            onClick={() => setSignOutAllOpen(true)}
          >
            <LogOut />
            Sign out everywhere
          </Button>
        </div>

        <ConfirmDialog
          open={!!signOutAllOpen}
          onOpenChange={setSignOutAllOpen}
          title='Sign out everywhere'
          desc='This revokes every session on every device, including this one. You will need to sign in again.'
          confirmText='Sign out everywhere'
          destructive
          handleConfirm={handleSignOutEverywhere}
          className='sm:max-w-sm'
        />
      </div>
    </ContentSection>
  )
}
