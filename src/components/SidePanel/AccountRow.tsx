import { ChevronsUpDown, User as UserIcon } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAccountTier } from '@/hooks/useAccountTier'
import {
  ANONYMOUS_IDENTITY,
  TIER_LABELS,
  avatarInitial,
  emailLocalPart,
} from '@/constants/tierLabels'
import { AccountMenu } from './AccountMenu'

interface AccountRowProps {
  onOpenSettings: () => void
  onSignIn: () => void
  onSignOut: () => void
  onDeleteAccount: () => void
}

/**
 * The bottom of the side panel: who you are, what you're on, and the way in to
 * everything account-shaped.
 *
 * Replaces a footer that rendered the email beside an unlabelled logout glyph
 * and then Privacy / Terms / Delete account as three equal-weight 12px links —
 * an arrangement that gave an irreversible action the same visual weight as a
 * link to the privacy policy.
 */
export function AccountRow({
  onOpenSettings,
  onSignIn,
  onSignOut,
  onDeleteAccount,
}: AccountRowProps) {
  const { user } = useAuth()
  const tier = useAccountTier()

  // `user` is null both before the session lookup answers and when genuinely
  // signed out, so anything rendered during this window is a guess. Guessing
  // wrong here tells a signed-in user they have no account, which reads as a
  // logout bug rather than a loading state.
  if (tier === 'loading') {
    return (
      <div className="border-t border-[#404040] px-3 py-3 shrink-0">
        <div className="flex items-center gap-2 px-2 py-1.5" aria-hidden="true">
          <div className="w-6 h-6 rounded-full bg-[#262626] animate-pulse shrink-0" />
          <div className="h-4 flex-1 max-w-[140px] rounded bg-[#262626] animate-pulse" />
        </div>
      </div>
    )
  }

  const identity = user ? emailLocalPart(user.email ?? '') : ANONYMOUS_IDENTITY
  const tierLabel = TIER_LABELS[tier]

  return (
    <div className="border-t border-[#404040] px-3 py-3 shrink-0">
      <AccountMenu
        onOpenSettings={onOpenSettings}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        onDeleteAccount={onDeleteAccount}
        trigger={
          <button
            type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[10px] text-left transition-colors hover:bg-[#262626] data-[state=open]:bg-[#262626] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#6b6e73]"
            aria-label={`Account menu for ${identity}, ${tierLabel}`}
          >
            <span className="shrink-0 w-6 h-6 rounded-full bg-[#262626] text-[#c9ced4] flex items-center justify-center text-[11px] font-medium">
              {user ? avatarInitial(user.email ?? '') : <UserIcon size={13} />}
            </span>
            <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
              <span className="min-w-0 truncate text-[14px] leading-[20px] text-[#dadee5]">
                {identity}
              </span>
              <span className="shrink-0 text-[12px] leading-[18px] text-[#6b6e73]">
                · {tierLabel}
              </span>
            </span>
            {/* Decoration, not a second target — the whole row is the button. */}
            <ChevronsUpDown size={14} className="shrink-0 text-[#6b6e73]" />
          </button>
        }
      />
    </div>
  )
}
