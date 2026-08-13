import type { ReactNode } from 'react'
import { Modal } from './Modal'
import { useAuth } from '@/hooks/useAuth'
import { useAccountTier } from '@/hooks/useAccountTier'
import { useEventUsage } from '@/hooks/useEventUsage'
import { useSidePanel } from '@/hooks/useSidePanel'
import { useByokCredential } from '@/services/userApiKey'
import { maskKey } from '@/services/userApiKey'
import { PLAN_LIMITS } from '@/constants/plans'
import { PROVIDER_META } from '@/constants/byokProviders'
import { TIER_DESCRIPTIONS, TIER_LABELS } from '@/constants/tierLabels'

interface AccountDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  onDeleteAccount: () => void
}

/**
 * What the account is, in one place.
 *
 * Every value here already existed somewhere — this adds no query, no table and
 * no hook. It exists because the facts were scattered across a footer, a usage
 * card and a settings panel, and none of them answered "what am I actually on".
 *
 * Key *management* deliberately stays in the Settings panel. This shows status
 * and points at it, rather than becoming a second place to edit the same value.
 */
export function AccountDetailsModal({
  isOpen,
  onClose,
  onDeleteAccount,
}: AccountDetailsModalProps) {
  const { user } = useAuth()
  const tier = useAccountTier()
  // Counts from the hook, caps from the tier — the split `UsageLimits` already
  // makes. `useEventUsage` sources its limits from `getCurrentLimits()`, which
  // reads a module-level cache refreshed by an async `auth.getUser()`; it lags
  // an auth or key transition by a frame and holds its 'byok-anon' initial
  // value if that call never lands. Reading PLAN_LIMITS off the tier we already
  // have cannot disagree with the row above it.
  const { eventCount, timelineCount } = useEventUsage()
  const credential = useByokCredential()
  const { onOpenSettings, hasSettingsHandler } = useSidePanel()

  if (tier === 'loading') return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Account Details" size="compact">
      <div className="flex flex-col gap-5 py-1">
        <Section label="Signed in as">
          <p className="text-[14px] leading-[20px] text-[#dadee5] break-all">
            {user?.email ?? 'Not signed in'}
          </p>
          <p className="text-[12px] leading-[18px] text-[#6b6e73] mt-1">
            {user
              ? 'Sign-in is passwordless — we email a 6-digit code. There is no password to change.'
              : 'Sign in to save timelines to an account and reach them from any browser.'}
          </p>
        </Section>

        <Section label="Plan">
          <p className="text-[14px] leading-[20px] text-[#dadee5]">{TIER_LABELS[tier]}</p>
          <p className="text-[12px] leading-[18px] text-[#6b6e73] mt-1">
            {TIER_DESCRIPTIONS[tier]}
          </p>
        </Section>

        {/* Trial has no caps to report against — it is a state, not a tier, and
            a usage table implies limits it does not have. */}
        {tier !== 'trial' && (
          <Section label="Usage">
            <div className="flex flex-col gap-1.5">
              <UsageRow
                label="Timelines"
                count={timelineCount}
                limit={PLAN_LIMITS[tier].timelineLimit}
              />
              <UsageRow
                label="Events"
                count={eventCount}
                limit={PLAN_LIMITS[tier].eventLimit}
              />
            </div>
          </Section>
        )}

        <Section label="API key">
          {credential ? (
            <p className="text-[14px] leading-[20px] text-[#dadee5]">
              {PROVIDER_META[credential.provider].label}
              <span className="text-[#6b6e73] font-['JetBrains_Mono',monospace] text-[12px] ml-2">
                {maskKey(credential.key)}
              </span>
            </p>
          ) : (
            <p className="text-[14px] leading-[20px] text-[#9b9ea3]">No key connected</p>
          )}
          <p className="text-[12px] leading-[18px] text-[#6b6e73] mt-1">
            {hasSettingsHandler ? (
              <>
                Keys are added and removed in{' '}
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onOpenSettings()
                  }}
                  className="underline hover:text-[#9b9ea3] transition-colors"
                >
                  Settings
                </button>
                .
              </>
            ) : (
              'Keys are added and removed in a timeline’s Settings panel.'
            )}
          </p>
        </Section>

        {user && (
          <div className="border-t border-[#404040] pt-4">
            <button
              type="button"
              onClick={() => {
                onClose()
                onDeleteAccount()
              }}
              className="text-[14px] leading-[20px] text-destructive hover:underline"
            >
              Delete account
            </button>
            <p className="text-[12px] leading-[18px] text-[#6b6e73] mt-1">
              Permanently deletes your account and every timeline on it. Export anything you
              want to keep first.
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="m-0 mb-1.5 font-['Aleo',serif] text-[12px] leading-[140%] font-normal text-[#9b9ea3]">
        {label}
      </h3>
      {children}
    </div>
  )
}

function UsageRow({
  label,
  count,
  limit,
}: {
  label: string
  count: number
  limit: number | null
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] leading-[18px] text-[#c9ced4]">{label}</span>
      <span className="font-['Avenir',sans-serif] text-[13px] leading-[18px] text-[#9b9ea3]">
        {count}
        {limit == null ? '' : ` / ${limit}`}
      </span>
    </div>
  )
}
