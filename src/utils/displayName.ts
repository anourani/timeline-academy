export function getAccountDisplayName(user: { email?: string | null } | null): string {
  if (!user?.email) return 'My Account'
  const prefix = user.email.split('@')[0]
  if (!prefix) return 'My Account'
  const firstChar = prefix.charAt(0)
  if (!/[a-zA-Z]/.test(firstChar)) return 'My Account'
  return `${firstChar.toUpperCase()}${prefix.slice(1)}'s Account`
}
