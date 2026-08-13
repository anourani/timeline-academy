import { useState } from 'react'
import { useAccountTier } from '@/hooks/useAccountTier'
import { useEventUsage } from '@/hooks/useEventUsage'
import { useSidePanel } from '@/hooks/useSidePanel'
import { AuthModal } from '@/components/Auth/AuthModal'
import { ApiKeyModal } from '@/components/Modal/ApiKeyModal'
import { UsageMeter } from '@/components/ui/UsageMeter'
import { PLAN_LIMITS } from '@/constants/plans'
import type { AccountTier } from '@/hooks/useAccountTier'

const TRIAL_LABEL_CLASS =
  "font-['Avenir',sans-serif] text-[12px] leading-[140%] font-medium text-[#9B9EA3]"
const CTA_TEXT_CLASS =
  "m-0 px-2 font-['Avenir',sans-serif] text-[12px] leading-[16px] text-[#6b6e73]"
// One class for every inline call to action in this card — the trial copy and
// the upgrade line both used their own copy of this string before.
const LINK_CLASS =
  "font-['Avenir',sans-serif] text-[12px] leading-[18px] font-normal underline text-text-secondary hover:text-text-primary transition-colors"

export function UsageLimits() {
  const tier = useAccountTier()
  const { eventCount, timelineCount, isLoading } = useEventUsage()
  const { onOpenSettings, hasSettingsHandler } = useSidePanel()

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

  // Caps for the meters — pulled from PLAN_LIMITS so this stays in sync with
  // the data layer without depending on the resolver's current value.
  const byokAnonCaps = PLAN_LIMITS['byok-anon']
  const freeCaps = PLAN_LIMITS.free
  const byokCaps = PLAN_LIMITS.byok

  // The trial has no plan and no numbers to show. Until it holds something
  // there is nothing worth saying at all, so the card renders as a single line
  // rather than meters against caps someone hasn't opted into yet.
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

  const cta = renderUpgradeCta({
    tier,
    hasSettingsHandler,
    onLogIn: handleLogIn,
    onAddKey: handleAddApiKey,
    onManageKey: handleManageApiKey,
  })

  return (
    <>
      <div className="px-3 pb-2.5">
        <div className="bg-[#0A0A0A] rounded-[8px] pt-4 pb-3 px-2 flex flex-col gap-3">
          {/* Header row */}
          <div className="flex flex-row items-center px-2">
            <h3 className="m-0 font-['Aleo',serif] text-[14px] leading-[140%] font-normal text-[#9B9EA3]">
              Usage Limits
            </h3>
          </div>

          {/* Meters. The sub-card steps *up* to #171717 — #0A0A0A is already the
              darkest surface in the system, so a nested tile can only lighten. */}
          <div className="bg-[#171717] rounded-md px-2.5 py-2 flex flex-col gap-2">
            <UsageMeter
              label="Timelines"
              count={timelineCount}
              limit={timelineCap}
              pending={isLoading}
            />
            <UsageMeter
              label="Events"
              count={eventCount}
              limit={eventCap}
              pending={isLoading}
            />
          </div>

          {cta}
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

/** "25 timelines", "1,200 events" — or "unlimited events" if a cap ever goes null. */
function capPhrase(limit: number | null, noun: string): string {
  return limit == null ? `unlimited ${noun}` : `${limit.toLocaleString()} ${noun}`
}

/**
 * The card's entire upgrade path, in one sentence.
 *
 * This replaced a three-column tier comparison table. The numbers are
 * interpolated from PLAN_LIMITS rather than written out, because the copy this
 * replaced said "Unlimited" events while PLAN_LIMITS.byok.eventLimit was 1200
 * and isOverEventLimit enforced it — a BYOK user was told there was no cap and
 * then stopped at one.
 */
function renderUpgradeCta({
  tier,
  hasSettingsHandler,
  onLogIn,
  onAddKey,
  onManageKey,
}: {
  tier: AccountTier
  hasSettingsHandler: boolean
  onLogIn: () => void
  onAddKey: () => void
  onManageKey: () => void
}) {
  const byokCaps = PLAN_LIMITS.byok
  const byokPhrase = `${capPhrase(byokCaps.timelineLimit, 'timelines')} and ${capPhrase(
    byokCaps.eventLimit,
    'events'
  )}`

  // Signing in from here lands on byok, not free — the key is already in hand,
  // so projecting the free caps would understate what logging in actually gets.
  if (tier === 'byok-anon') {
    return (
      <p className={CTA_TEXT_CLASS}>
        <button type="button" onClick={onLogIn} className={LINK_CLASS}>
          Log in
        </button>{' '}
        to save your timelines to your account and raise your limits to {byokPhrase}.
      </p>
    )
  }

  if (tier === 'free') {
    return (
      <p className={CTA_TEXT_CLASS}>
        <button type="button" onClick={onAddKey} className={LINK_CLASS}>
          Add API Key
        </button>{' '}
        to unlock {byokPhrase}.
      </p>
    )
  }

  // byok is the top tier: nothing left to sell, and the meters above already
  // state the caps. The only thing left is a way to manage the key — and
  // onOpenSettings is a no-op off the editor route, where nothing registers a
  // handler. With nowhere to send anyone, say nothing rather than render a
  // link that silently does nothing.
  if (!hasSettingsHandler) return null
  return (
    <p className={CTA_TEXT_CLASS}>
      Your API key is connected.{' '}
      <button type="button" onClick={onManageKey} className={LINK_CLASS}>
        Manage it in Settings.
      </button>
    </p>
  )
}

/**
 * The trial's entire presence in this panel.
 *
 * Not a meter and not a stat tile: this visitor has no plan, no caps and no
 * saved timeline list, and drawing a bar against a limit would imply all three.
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
  const hasWork = eventCount > 0

  return (
    <div className="px-3 pb-2.5">
      <div className="bg-[#0A0A0A] rounded-[8px] py-3 px-4 flex flex-col gap-1.5">
        <span className={TRIAL_LABEL_CLASS}>
          {hasWork
            ? `${eventCount} event${eventCount === 1 ? '' : 's'} · not saved`
            : 'Nothing saved yet'}
        </span>
        <span className="font-['Avenir',sans-serif] text-[12px] leading-[16px] text-[#6b6e73]">
          {hasWork
            ? 'This timeline lives in this tab only. '
            : 'Timelines you build stay in this tab. '}
          <button type="button" onClick={onLogIn} className={LINK_CLASS}>
            Log in
          </button>{' '}
          or{' '}
          <button type="button" onClick={onAddKey} className={LINK_CLASS}>
            add an API key
          </button>{' '}
          {hasWork ? 'to keep it.' : 'to keep them.'}
        </span>
      </div>
    </div>
  )
}
