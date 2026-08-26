import { useQuery, useQueryClient } from '@tanstack/react-query'
import { logout, userQueryOptions } from '@/lib/api'

/**
 * The one way components read auth state (Clerk-like DX). Wraps the
 * canonical TanStack Query session store — never query the session
 * directly from components.
 */
export function useAuth() {
  const queryClient = useQueryClient()
  const { data: user, isPending } = useQuery(userQueryOptions)

  return {
    user: user ?? null,
    isSignedIn: !!user,
    isLoaded: !isPending,
    signOut: async () => {
      await logout()
      queryClient.clear()
    },
  }
}
