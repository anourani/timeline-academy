import { useState } from 'react'
import { useAccountTier } from '@/hooks/useAccountTier'
import { useEventUsage } from '@/hooks/useEventUsage'
import { useSidePanel } from '@/hooks/useSidePanel'
import { AuthModal } from '@/components/Auth/AuthModal'
import { ApiKeyModal } from '@/components/Modal/ApiKeyModal'
import { PLAN_LIMITS } from '@/constants/plans'
import type { AccountTier } from '@/hooks/useAccountTier'

const STAT_TILE_LABEL_CLASS =
  "font-['Avenir',sans-serif] text-[12px] leading-[140%] font-medium text-[#9B9EA3]"
const STAT_TILE_VALUE_CLASS =
  "font-['Avenir',sans-serif] text-[14px] leading-[140%] font-normal text-right text-[#9B9EA3] flex-1"
const TIER_ROW_LABEL_CLASS =
  "font-['Avenir',sans-serif] text-[12px] leading-[18px] font-normal text-[#C9CED4]"
const TIER_ROW_NUM_CLASS =
  "font-['Avenir',sans-serif] text-[12px] leading-[140%] font-normal text-[#C9CED4] text-center"
const COL_HEADER_CLASS =
  "font-['Avenir',sans-serif] text-[12px] leading-[140%] font-medium text-[#9B9EA3]"

export function UsageLimits() {
  const tier = useAccountTier()
  const { eventCount, timelineCount } = useEventUsage()
  const { onOpenSettings } = useSidePanel()

  const [showAuthModal, setShowAuthModal] = useState(false)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)

  function handleLogIn() {
    setShowAuthModal(true)
  }

  // Opens the key modal directly, for signed-in and signed-out alike. This used
  // to route a signed-out visitor through AuthModal first and only then show
  // the key field, which made byok-anon — an account-free tier — unreachable
  // from the one panel that advertises it.
  function handleAddApiKey() {
    setShowApiKeyModal(true)
  }

  function handleManageApiKey() {
    onOpenSettings()
  }

  // Caps for the table — pulled from PLAN_LIMITS so this stays in sync with
  // the data layer without depending on the resolver's current value.
  const byokAnonCaps = PLAN_LIMITS['byok-anon']
  const freeCaps = PLAN_LIMITS.free
  const byokCaps = PLAN_LIMITS.byok

  // The trial has no plan and no numbers to show. Until it holds something
  // there is nothing worth saying at all, so the card renders as a single line
  // rather than a tier table someone hasn't opted into yet.
  if (tier === 'loading') return null

  if (tier === 'trial') {
    return (
      <>
        <TrialStatus
          eventCount={eventCount}
          onLogIn={handleLogIn}
          onAddKey={handleAddApiKey}
        />
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
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

  const currentCaps =
    tier === 'byok-anon' ? byokAnonCaps : tier === 'free' ? freeCaps : byokCaps
  const timelineCap = currentCaps.timelineLimit
  const eventCap = currentCaps.eventLimit

  const headerCta = renderHeaderCta({
    tier,
    onLogIn: handleLogIn,
    onAddKey: handleAddApiKey,
    onManageKey: handleManageApiKey,
  })

  return (
    <>
      <div className="px-3 pb-2.5">
        <div className="bg-[#0A0A0A] rounded-[8px] pt-4 pb-3 px-2 flex flex-col gap-4">
          {/* Header row */}
          <div className="flex flex-row items-center justify-between px-2">
            <h3 className="m-0 font-['Aleo',serif] text-[14px] leading-[140%] font-normal text-[#9B9EA3]">
              Usage Limits
            </h3>
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
                tier === 'byok'
                  ? '♾️'
                  : `${eventCount}/${eventCap ?? ''}`
              }
              ariaLabel={tier === 'byok' ? 'unlimited' : undefined}
            />
          </div>

          {/* Tier table — hidden in BYOK state */}
          {tier !== 'byok' && (
            <div className="flex flex-col items-start w-full">
              {/* Column header */}
              <div className="flex flex-row justify-between items-center px-2 py-1 gap-1 w-full">
                <span className={COL_HEADER_CLASS}>Tier</span>
                <div className="flex flex-row items-center gap-2.5 w-[140px]">
                  <span className={`${COL_HEADER_CLASS} w-[65px] text-center`}>
                    Timelines
                  </span>
                  <span className={`${COL_HEADER_CLASS} w-[65px] text-center`}>
                    Events
                  </span>
                </div>
              </div>

              {tier === 'byok-anon' ? (
                <>
                  <TierRow
                    label="Your API key"
                    timelineCap={byokAnonCaps.timelineLimit}
                    eventCap={byokAnonCaps.eventLimit}
                    variant="highlighted"
                  />
                  {/* Signing in from here lands on byok, not free — the key is
                      already in hand, so projecting the free caps would
                      understate what logging in actually gets you. */}
                  <TierRow
                    label="Log In"
                    timelineCap={byokCaps.timelineLimit}
                    eventCap="Unlimited"
                    variant="subtle"
                    onClick={handleLogIn}
                  />
                </>
              ) : (
                <>
                  <TierRow
                    label="Your Account"
                    timelineCap={freeCaps.timelineLimit}
                    eventCap={freeCaps.eventLimit}
                    variant="highlighted"
                  />
                  <TierRow
                    label="Add API Key"
                    timelineCap={byokCaps.timelineLimit}
                    eventCap="Unlimited"
                    variant="link"
                    onClick={handleAddApiKey}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
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
  tier,
  onLogIn,
  onAddKey,
  onManageKey,
}: {
  tier: AccountTier
  onLogIn: () => void
  onAddKey: () => void
  onManageKey: () => void
}) {
  const baseClass =
    "font-['Avenir',sans-serif] text-[12px] leading-[18px] font-normal underline text-text-secondary hover:text-text-primary transition-colors"
  if (tier === 'byok-anon') {
    return (
      <button type="button" onClick={onLogIn} className={baseClass}>
        Log In
      </button>
    )
  }
  if (tier === 'free') {
    return (
      <button type="button" onClick={onAddKey} className={baseClass}>
        Add API Key
      </button>
    )
  }
  return (
    <button type="button" onClick={onManageKey} className={baseClass}>
      API Key Connected
    </button>
  )
}

/**
 * The trial's entire presence in this panel.
 *
 * Not a TierRow and not a stat tile: this visitor has no plan, no caps and no
 * saved timeline list, and dressing the state up as a row in the tier table
 * would imply all three.
 *
 * It does still always render, though — this is the only way in to sign-in or
 * BYOK from the side panel, and the whole tier table it replaced carried those
 * two calls to action. Hiding it until the visitor had made something left a
 * first-time visitor with no way to log in at all.
 */
function TrialStatus({
  eventCount,
  onLogIn,
  onAddKey,
}: {
  eventCount: number
  onLogIn: () => void
  onAddKey: () => void
}) {
  const linkClass =
    "font-['Avenir',sans-serif] text-[12px] leading-[18px] font-normal underline text-text-secondary hover:text-text-primary transition-colors"
  const hasWork = eventCount > 0

  return (
    <div className="px-3 pb-2.5">
      <div className="bg-[#0A0A0A] rounded-[8px] py-3 px-4 flex flex-col gap-1.5">
        <span className={STAT_TILE_LABEL_CLASS}>
          {hasWork
            ? `${eventCount} event${eventCount === 1 ? '' : 's'} · not saved`
            : 'Nothing saved yet'}
        </span>
        <span className="font-['Avenir',sans-serif] text-[12px] leading-[16px] text-[#6b6e73]">
          {hasWork
            ? 'This timeline lives in this tab only. '
            : 'Timelines you build stay in this tab. '}
          <button type="button" onClick={onLogIn} className={linkClass}>
            Log in
          </button>{' '}
          or{' '}
          <button type="button" onClick={onAddKey} className={linkClass}>
            add an API key
          </button>{' '}
          {hasWork ? 'to keep it.' : 'to keep them.'}
        </span>
      </div>
    </div>
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
  timelineCap: number | string | null
  eventCap: number | string | null
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
      <div className="flex flex-row items-center gap-2.5 w-[140px]">
        <span className={`${TIER_ROW_NUM_CLASS} w-[65px]`}>
          {timelineCap ?? 'Unlimited'}
        </span>
        <span className={`${TIER_ROW_NUM_CLASS} w-[65px]`}>
          {eventCap ?? 'Unlimited'}
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
