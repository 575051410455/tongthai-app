export const userStatuses = ['active', 'banned'] as const
export type UserStatus = (typeof userStatuses)[number]

export const userRoles = ['user', 'admin'] as const
export type UserRole = (typeof userRoles)[number]

/**
 * One row of the users table, mapped from the admin list-users response.
 * `status` is derived, not stored: a User is banned or active (CONTEXT.md).
 */
export type User = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: UserRole
  banned: boolean
  status: UserStatus
  createdAt: Date
  updatedAt: Date
}
