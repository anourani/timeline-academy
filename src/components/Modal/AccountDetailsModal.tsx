import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog'
import {
  destructiveGlassButtonClass,
  modalRailClass,
  modalRailGroupClass,
  modalSidebarTabClass,
} from '@/components/ui/glassButton'
import { useAuth } from '@/hooks/useAuth'
import { useAccountTier } from '@/hooks/useAccountTier'
import { useEventUsage } from '@/hooks/useEventUsage'
import { useSidePanel } from '@/hooks/useSidePanel'
import { UsageMeter } from '@/components/ui/UsageMeter'
import { maskKey, useByokCredential } from '@/services/userApiKey'
import { PLAN_LIMITS } from '@/constants/plans'
import { PROVIDER_META } from '@/constants/byokProviders'
import { TIER_DESCRIPTIONS, TIER_LABELS } from '@/constants/tierLabels'

interface AccountDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  onDeleteAccount: () => void
}

const SECTIONS = [
  { id: 'details', label: 'Account details' },
  { id: 'usage', label: 'Account usage' },
  { id: 'management', label: 'Account management' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/**
 * What the account is, in one place.
 *
 * Radix Dialog rather than the `Modal` wrapper, 20px radius on the same surface
 * as `EventTableEditor`, but laid out the way a settings dialog is: a rail that
 * runs the full height of the modal, flush to its edges and divided from the
 * content by a rule rather than a gap, with the heading and close control in
 * the content column. The tab styles live in `ui/glassButton.ts` so the two
 * modals' rails cannot drift apart.
 *
 * Every value here already existed somewhere. This adds no query, no table and
 * no hook; it exists because the facts were scattered across a footer, a usage
 * card and a settings panel, and none of them answered "what am I actually on".
 */
export function AccountDetailsModal({
  isOpen,
  onClose,
  onDeleteAccount,
}: AccountDetailsModalProps) {
  const { user } = useAuth()
  const tier = useAccountTier()
  const [section, setSection] = useState<SectionId>('details')
  const railRef = useRef<HTMLElement | null>(null)

  // Keep the active tab visible in the horizontal strip. The scrollbar is
  // hidden there, so a tab scrolled off the edge has no affordance saying where
  // it went — and selection can move without a click (reopening resets to the
  // first section, and arrow keys move focus). Inert on the vertical rail,
  // where nothing overflows.
  useEffect(() => {
    const active = railRef.current?.querySelector(`[data-section="${section}"]`)
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [section, isOpen])

  // Reopening lands on the first section rather than wherever the last visit
  // ended. The section name doubles as the dialog's heading, so a stale
  // selection would open this on "Account management" — the delete screen —
  // with no indication that it is not where Settings normally starts.
  useEffect(() => {
    if (isOpen) setSection('details')
  }, [isOpen])

  if (tier === 'loading') return null

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose() }}>
      <DialogPortal>
        <DialogOverlay />
        {/*
          A grid rather than a flex row, because the two layouts are an L-shape
          reflow of each other:

            below sm   header / strip / body stacked in one column
            sm and up  rail down the left spanning both rows, header and body
                       stacked to its right

          Flex cannot express that from one DOM order, and duplicating the
          header behind `sm:hidden` would mean two `DialogPrimitive.Title`
          elements — two copies of the id Radix points `aria-labelledby` at.

          `p-0` and `overflow-hidden` let the rail run edge to edge, and the
          height lives here rather than on an inner wrapper: a full-height rail
          needs the dialog itself to have a height to fill.

          Centred with `inset-0 m-auto`, deliberately NOT `left-1/2 top-1/2`
          plus a −50% translate. `tailwindcss-animate` builds one keyframe whose
          `from` sets the entire transform — translate, scale and rotate
          together — so with `zoom-in-95` and no `slide-in-from-*` to re-supply
          the offsets, frame 0 is `translate3d(0,0,0) scale(.95)`. Animations
          outrank normal declarations, so that *replaces* the centring translate
          and the modal starts with its top-left corner at the viewport centre,
          then travels up and left into place — a diagonal drift in from the
          bottom right, and back out the same way.

          Auto margins centre it without a transform (both axes, because the
          width and height here are definite), leaving the keyframe nothing to
          clobber. `zoom-in-95` then scales about the element's own centre,
          which is the whole intent. Restoring the slide utilities would also
          work, but they would exist solely to cancel a slide — one tidy-up away
          from bringing this back.
        */}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed z-50 inset-0 w-screen h-[100dvh] max-w-none rounded-none border-0 grid grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden bg-[#171717] shadow-lg duration-200 sm:w-full sm:max-w-[720px] sm:h-[min(560px,calc(100vh-120px))] sm:m-auto sm:grid-cols-[200px_minmax(0,1fr)] sm:grid-rows-[auto_minmax(0,1fr)] sm:rounded-[20px] sm:border sm:border-[rgba(210,210,210,0.2)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95"
        >
          <div className="sm:col-start-2 sm:row-start-1 flex items-start justify-between gap-4 px-6 pt-5 pb-4">
            {/*
              The section name *is* the dialog's title, so the accessible name
              always matches the heading on screen. It changes as you move
              through the rail, which is what the reference does too.
            */}
            <DialogPrimitive.Title className="m-0 font-['Aleo',serif] font-normal text-[20px] leading-[1.4] text-[#dadee5]">
              {SECTIONS.find(s => s.id === section)?.label}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close"
              className="shrink-0 -mr-1 -mt-0.5 p-1 rounded text-[#9b9ea3] hover:text-[#dadee5] outline-none focus-visible:ring-1 focus-visible:ring-white/40 transition-colors"
            >
              <X size={20} />
            </DialogPrimitive.Close>
          </div>

          {/* Full-height rail at sm and up; a horizontally scrolling strip below
              it. Both orientations come from `modalRailClass`. */}
          <nav
            ref={railRef}
            aria-label="Account sections"
            className={`sm:col-start-1 sm:row-start-1 sm:row-span-2 ${modalRailClass}`}
          >
            <div className={modalRailGroupClass}>
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  data-section={s.id}
                  onClick={() => setSection(s.id)}
                  aria-current={section === s.id ? 'page' : undefined}
                  className={modalSidebarTabClass(section === s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="sm:col-start-2 sm:row-start-2 min-w-0 min-h-0 overflow-y-auto px-6 pb-6">
            {section === 'details' && <DetailsPane />}
            {section === 'usage' && <UsagePane />}
            {section === 'management' && (
              <ManagementPane
                onDelete={() => {
                  onClose()
                  onDeleteAccount()
                }}
                signedIn={Boolean(user)}
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

function DetailsPane() {
  const { user } = useAuth()

  // There is no name field to show. Identity here is email-only by design —
  // sign-up collects an address and nothing else — so a "Name" row would either
  // sit permanently empty or invent a value the account does not have.
  return (
    <Pane>
      <Field label="Email" value={user?.email ?? 'Not signed in'} />
      <Field
        label="Sign-in method"
        value="Email code"
        hint="Passwordless — we email a 6-digit code each time. There is no password to change."
      />
      <Field label="Member since" value={formatJoined(user?.created_at)} />
    </Pane>
  )
}

function UsagePane() {
  const tier = useAccountTier()
  // Counts from the hook, caps from the tier — the split `UsageLimits` already
  // makes. `useEventUsage` sources its limits from `getCurrentLimits()`, which
  // reads a module-level cache refreshed by an async `auth.getUser()`; it lags
  // an auth or key transition by a frame and holds its 'byok-anon' initial
  // value if that call never lands.
  const { eventCount, timelineCount, isLoading } = useEventUsage()
  const credential = useByokCredential()
  const { onOpenSettings, hasSettingsHandler } = useSidePanel()

  if (tier === 'loading') return null
  const caps = tier === 'trial' ? null : PLAN_LIMITS[tier]

  return (
    <Pane>
      <Field label="Tier" value={TIER_LABELS[tier]} hint={TIER_DESCRIPTIONS[tier]} />

      {/* Trial has no caps to report against — it is a state, not a tier, and a
          usage table implies limits it does not have. */}
      {caps && (
        <div>
          <FieldLabel>Usage</FieldLabel>
          <div className="flex flex-col gap-1.5 mt-1.5">
            {/* Same meter the side panel's Usage Limits card uses. The track
                tone differs because the surfaces nest in opposite directions:
                these rows are recessed to #0A0A0A inside a #171717 modal, so
                the panel's near-black track would vanish here. */}
            <UsageMeter
              label="Timelines"
              count={timelineCount}
              limit={caps.timelineLimit}
              size="md"
              pending={isLoading}
              trackClass="bg-[#262626]"
              className="bg-[#0A0A0A] rounded-md px-3 py-1.5"
            />
            <UsageMeter
              label="Events"
              count={eventCount}
              limit={caps.eventLimit}
              size="md"
              pending={isLoading}
              trackClass="bg-[#262626]"
              className="bg-[#0A0A0A] rounded-md px-3 py-1.5"
            />
          </div>
        </div>
      )}

      <div>
        <FieldLabel>API key</FieldLabel>
        <p className="mt-1 text-[14px] leading-[20px] text-[#dadee5]">
          {credential ? (
            <>
              {PROVIDER_META[credential.provider].label}
              <span className="text-[#6b6e73] font-['JetBrains_Mono',monospace] text-[12px] ml-2">
                {maskKey(credential.key)}
              </span>
            </>
          ) : (
            <span className="text-[#9b9ea3]">No key connected</span>
          )}
        </p>
        <p className="text-[12px] leading-[18px] text-[#6b6e73] mt-1">
          {hasSettingsHandler ? (
            <>
              Keys are added and removed in{' '}
              <button
                type="button"
                onClick={onOpenSettings}
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
      </div>
    </Pane>
  )
}

function ManagementPane({
  onDelete,
  signedIn,
}: {
  onDelete: () => void
  signedIn: boolean
}) {
  return (
    <Pane>
      <div>
        <FieldLabel>Delete account</FieldLabel>
        <p className="mt-1 text-[14px] leading-[20px] text-[#c9ced4]">
          This permanently deletes your account, your email address, and every timeline
          you have saved. It cannot be undone, and we cannot recover the data afterwards.
        </p>
        <p className="text-[12px] leading-[18px] text-[#6b6e73] mt-2">
          Export anything you want to keep first — each timeline’s menu in the side panel
          has an Export data option.
        </p>
        {signedIn && (
          <button type="button" onClick={onDelete} className={`${destructiveGlassButtonClass} mt-4`}>
            Delete account
          </button>
        )}
      </div>
    </Pane>
  )
}

// The section name is rendered once, as the dialog's title in the header. A
// heading here as well — even a visually hidden one — would announce it twice.
function Pane({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5">{children}</div>
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-['Avenir',sans-serif] text-[12px] leading-[140%] font-medium text-[#9b9ea3]">
      {children}
    </span>
  )
}

function Field({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p className="mt-1 text-[14px] leading-[20px] text-[#dadee5] break-all">{value}</p>
      {hint && <p className="text-[12px] leading-[18px] text-[#6b6e73] mt-1">{hint}</p>}
    </div>
  )
}

function formatJoined(createdAt: string | undefined): string {
  if (!createdAt) return 'Unknown'
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
