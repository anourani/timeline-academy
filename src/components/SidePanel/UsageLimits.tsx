import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useEventUsage } from '@/hooks/useEventUsage'
import { useSidePanel } from '@/hooks/useSidePanel'
import { useAnthropicKey } from '@/services/userApiKey'
import { AuthModal } from '@/components/Auth/AuthModal'
import { ApiKeyModal } from '@/components/Modal/ApiKeyModal'
import { getAccountDisplayName } from '@/utils/displayName'
import { PLAN_LIMITS } from '@/constants/plans'

type TierState = 'guest' | 'free' | 'byok'

const STAT_TILE_LABEL_CLASS =
  "font-['Avenir',sans-serif] text-[12px] leading-[140%] font-medium text-[#9B9EA3]"
const STAT_TILE_VALUE_CLASS =
  "font-['JetBrains_Mono',monospace] text-[14px] leading-[140%] font-normal text-right text-[#9B9EA3] flex-1"
const TIER_ROW_LABEL_CLASS =
  "font-['Avenir',sans-serif] text-[12px] leading-[18px] font-normal text-[#C9CED4]"
const TIER_ROW_NUM_CLASS =
  "font-['JetBrains_Mono',monospace] text-[10px] leading-[140%] font-normal text-[#C9CED4] text-center"
const COL_HEADER_CLASS =
  "font-['Avenir',sans-serif] text-[10px] leading-[140%] font-medium text-[#9B9EA3]"

export function UsageLimits() {
  const { user } = useAuth()
  const apiKey = useAnthropicKey()
  const { eventCount, timelineCount } = useEventUsage()
  const { onOpenSettings } = useSidePanel()

  const tierState: TierState = !user ? 'guest' : apiKey ? 'byok' : 'free'

  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const pendingApiKeyModalRef = useRef(false)

  // Guest "Add API Key" gated flow: open AuthModal first, then ApiKeyModal
  // automatically once the user is signed in.
  useEffect(() => {
    if (user && pendingApiKeyModalRef.current) {
      pendingApiKeyModalRef.current = false
      setShowApiKeyModal(true)
    }
  }, [user])

  function handleLogIn() {
    pendingApiKeyModalRef.current = false
    setShowAuthModal(true)
  }

  function handleAddApiKeyAsGuest() {
    pendingApiKeyModalRef.current = true
    setShowAuthModal(true)
  }

  function handleAddApiKeyAsUser() {
    setShowApiKeyModal(true)
  }

  function handleManageApiKey() {
    onOpenSettings()
  }

  function handleAuthModalClose() {
    if (!user) pendingApiKeyModalRef.current = false
    setShowAuthModal(false)
  }

  // Caps for the table — pulled from PLAN_LIMITS so this stays in sync with
  // the data layer without depending on the resolver's current value.
  const guestCaps = PLAN_LIMITS.guest
  const freeCaps = PLAN_LIMITS.free
  const byokCaps = PLAN_LIMITS.byok

  const timelineCap =
    tierState === 'guest'
      ? guestCaps.timelineLimit
      : tierState === 'free'
        ? freeCaps.timelineLimit
        : byokCaps.timelineLimit
  const eventCap =
    tierState === 'guest'
      ? guestCaps.eventLimit
      : tierState === 'free'
        ? freeCaps.eventLimit
        : byokCaps.eventLimit

  const headerCta = renderHeaderCta({
    tierState,
    onLogIn: handleLogIn,
    onAddKey: handleAddApiKeyAsUser,
    onManageKey: handleManageApiKey,
  })

  return (
    <>
      <div className="px-3 pb-2.5">
        <div className="bg-[#0A0A0A] rounded-md pt-4 pb-3 px-2 flex flex-col gap-4">
          {/* Header row */}
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row items-start gap-1 px-2">
              <h3 className="m-0 font-['Aleo',serif] text-[14px] leading-[140%] font-normal text-[#9B9EA3]">
                Usage Limits
              </h3>
            </div>
            {headerCta}
          </div>

          {/* Stat tiles */}
          <div className="flex flex-row items-start gap-2">
            <StatTile
              label="Timelines"
              value={`${timelineCount}/${timelineCap ?? ''}`}
            />
            <StatTile
              label="Events"
              value={
                tierState === 'byok'
                  ? '♾️'
                  : `${eventCount}/${eventCap ?? ''}`
              }
              ariaLabel={tierState === 'byok' ? 'unlimited' : undefined}
            />
          </div>

          {/* Tier table — hidden in BYOK state */}
          {tierState !== 'byok' && (
            <div className="flex flex-col items-start w-full">
              {/* Column header */}
              <div className="flex flex-row justify-between items-center px-2 py-1 gap-1 w-full">
                <span className={COL_HEADER_CLASS}>Tier</span>
                <div className="flex flex-row items-center gap-2.5 w-[120px]">
                  <span className={`${COL_HEADER_CLASS} w-[50px] text-center`}>
                    Timelines
                  </span>
                  <span className={`${COL_HEADER_CLASS} w-[60px] text-center`}>
                    Events
                  </span>
                </div>
              </div>

              {tierState === 'guest' ? (
                <>
                  <TierRow
                    label="Guest"
                    timelineCap={guestCaps.timelineLimit}
                    eventCap={guestCaps.eventLimit}
                    variant="highlighted"
                  />
                  <TierRow
                    label="Log In"
                    timelineCap={freeCaps.timelineLimit}
                    eventCap={freeCaps.eventLimit}
                    variant="subtle"
                    onClick={handleLogIn}
                  />
                  <TierRow
                    label="Add API Key"
                    timelineCap={byokCaps.timelineLimit}
                    eventCap={byokCaps.eventLimit}
                    variant="link"
                    onClick={handleAddApiKeyAsGuest}
                  />
                </>
              ) : (
                <>
                  <TierRow
                    label={getAccountDisplayName(user)}
                    timelineCap={freeCaps.timelineLimit}
                    eventCap={freeCaps.eventLimit}
                    variant="highlighted"
                  />
                  <TierRow
                    label="Add API Key"
                    timelineCap={byokCaps.timelineLimit}
                    eventCap={byokCaps.eventLimit}
                    variant="link"
                    onClick={handleAddApiKeyAsUser}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <AuthModal isOpen={showAuthModal} onClose={handleAuthModalClose} />
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={() => setShowApiKeyModal(false)}
        onKeySaved={() => setShowApiKeyModal(false)}
        onRequestSignIn={() => {
          setShowApiKeyModal(false)
          setShowAuthModal(true)
        }}
      />
    </>
  )
}

function renderHeaderCta({
  tierState,
  onLogIn,
  onAddKey,
  onManageKey,
}: {
  tierState: TierState
  onLogIn: () => void
  onAddKey: () => void
  onManageKey: () => void
}) {
  const baseClass =
    "font-['Avenir',sans-serif] text-[12px] leading-[18px] font-normal underline transition-colors"
  if (tierState === 'guest') {
    return (
      <button
        type="button"
        onClick={onLogIn}
        className={`${baseClass} text-[#2563EB] hover:text-[#3B82F6]`}
      >
        Log In for more usage
      </button>
    )
  }
  if (tierState === 'free') {
    return (
      <button
        type="button"
        onClick={onAddKey}
        className={`${baseClass} text-[#2563EB] hover:text-[#3B82F6]`}
      >
        Add API Key
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onManageKey}
      className={`${baseClass} text-[#C9CED4] hover:text-[#dadee5]`}
    >
      API Key Connected
    </button>
  )
}

function StatTile({
  label,
  value,
  ariaLabel,
}: {
  label: string
  value: string
  ariaLabel?: string
}) {
  return (
    <div className="flex-1 flex flex-col justify-center items-start bg-[#171717] rounded-md px-2 py-1 h-9">
      <div className="flex flex-row items-center px-0 py-1 gap-2 w-full">
        <span className={STAT_TILE_LABEL_CLASS}>{label}</span>
        <span className={STAT_TILE_VALUE_CLASS} aria-label={ariaLabel}>
          {value}
        </span>
      </div>
    </div>
  )
}

function TierRow({
  label,
  timelineCap,
  eventCap,
  variant,
  onClick,
}: {
  label: string
  timelineCap: number | null
  eventCap: number | null
  variant: 'highlighted' | 'subtle' | 'link'
  onClick?: () => void
}) {
  const bg =
    variant === 'highlighted'
      ? 'bg-[rgba(37,99,235,0.25)]'
      : variant === 'subtle'
        ? 'bg-[rgba(23,23,23,0.25)]'
        : ''
  const labelClass =
    variant === 'highlighted'
      ? TIER_ROW_LABEL_CLASS
      : `${TIER_ROW_LABEL_CLASS} underline`
  const interactive = variant !== 'highlighted' && !!onClick

  const content = (
    <div className="flex flex-row justify-between items-center w-full">
      <span className={labelClass}>{label}</span>
      <div className="flex flex-row items-center gap-2.5 w-[120px]">
        <span className={`${TIER_ROW_NUM_CLASS} w-[50px]`}>
          {timelineCap ?? '♾️'}
        </span>
        <span className={`${TIER_ROW_NUM_CLASS} w-[60px]`}>
          {eventCap ?? '♾️'}
        </span>
      </div>
    </div>
  )

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex flex-row justify-between items-center px-2 py-1 gap-1 w-full h-7 rounded-md ${bg} hover:bg-white/5`}
      >
        {content}
      </button>
    )
  }
  return (
    <div
      className={`flex flex-row justify-between items-center px-2 py-1 gap-1 w-full h-7 rounded-md ${bg}`}
    >
      {content}
    </div>
  )
}
