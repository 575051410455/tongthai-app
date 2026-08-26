import { useState } from 'react'
import { MailWarning } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { authClient } from '@/lib/auth-client'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/**
 * Shown to signed-in users whose email is not verified yet. Resend goes
 * through the better-auth client; the emailed link completes verification.
 */
export function EmailVerificationBanner() {
  const { user } = useAuth()
  const [isSending, setIsSending] = useState(false)

  if (!user || user.emailVerified) return null

  const resend = async () => {
    setIsSending(true)
    try {
      const { error } = await authClient.sendVerificationEmail({
        email: user.email,
        callbackURL: '/',
      })
      if (error) {
        toast.error(error.message || 'Could not send the verification email.')
      } else {
        toast.success(`Verification email sent to ${user.email}.`)
      }
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Alert className='rounded-none border-x-0 border-t-0'>
      <MailWarning />
      <AlertTitle>Verify your email</AlertTitle>
      <AlertDescription className='flex flex-wrap items-center gap-2'>
        <span>
          We sent a verification link to {user.email}. Please check your inbox.
        </span>
        <Button
          variant='outline'
          size='sm'
          onClick={resend}
          disabled={isSending}
        >
          Resend email
        </Button>
      </AlertDescription>
    </Alert>
  )
}
