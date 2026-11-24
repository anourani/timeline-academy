import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Plus, CalendarFold, Bolt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModeTabs } from '@/components/FloatingToolbar/ModeTabs'
import { DockLegend, type DockLegendProps } from '@/components/FloatingToolbar/DockLegend'
import { DockDesign, type DockDesignProps } from '@/components/FloatingToolbar/DockDesign'
import { DockApiKeys } from '@/components/FloatingToolbar/DockApiKeys'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSidePanel } from '@/hooks/useSidePanel'
import { useWindowResizing } from '@/hooks/useWindowResizing'

interface FloatingToolbarProps {
  onAddEventClick: () => void
  onEventsClick: () => void
  onSettingsClick: () => void
  activePanel: 'events' | 'settings' | 'legend' | 'design' | 'apiKeys' | null
  mode?: 'edit' | 'view'
  onModeChange?: (mode: 'edit' | 'view') => void
  /**
   * Slides the dock up as part of the AI-generation intro, and holds its
   * controls disabled until the stream finishes — there is no timeline to
   * add an event to or open settings for until then.
   */
  intro?: boolean
  streaming?: boolean
  /**
   * AI timelines are built from a prompt, so the dock drops Add Event and
   * carries the category legend instead (after Design, in both modes).
   */
  aiGenerated?: boolean
  legend?: Omit<DockLegendProps, 'open' | 'onOpenChange' | 'mode' | 'disabled' | 'iconOnly' | 'triggerClassName'>
  onLegendOpenChange?: (open: boolean) => void
  /** The Design menu's settings. Shown on every timeline, in both modes. */
  design?: Omit<DockDesignProps, 'open' | 'onOpenChange' | 'disabled' | 'iconOnly' | 'triggerClassName'>
  onDesignOpenChange?: (open: boolean) => void
  /** The API Keys menu. Shown on every timeline; on phones, edit mode only. */
  onApiKeysOpenChange?: (open: boolean) => void
}

const INTRO_RISE_MS = 550
const INTRO_RISE_DELAY_MS = 600
const INTRO_RISE_PX = 96

/**
 * The Edit/Present switch is hidden for now — not removed. `ModeTabs`, the
 * `mode`/`onModeChange` props and everything present mode does are all still
 * here; flip this back to `true` to bring the switch back. The dock is the
 * only place that changes modes and `mode` starts as 'edit' and is never
 * persisted, so with the switch hidden nobody can land in present mode and be
 * stranded there.
 */
const SHOW_MODE_TABS = false

export function FloatingToolbar({
  onAddEventClick,
  onEventsClick,
  onSettingsClick,
  activePanel,
  mode = 'edit',
  intro = false,
  streaming = false,
  onModeChange,
  aiGenerated = false,
  legend,
  onLegendOpenChange,
  design,
  onDesignOpenChange,
  onApiKeysOpenChange,
}: FloatingToolbarProps) {
  // The pill is centered on the viewport, then shifted by half the side
  // panel's width to recenter over the visible timeline area. The width is
  // user-resizable, so it has to be read live — a local copy of the constant
  // would drift silently on the first drag.
  const { isOpen: isSidePanelOpen, width: sidePanelWidth, isResizing } = useSidePanel()
  // Dropped for a window drag as well as a handle drag: the same width feeds
  // this transform, so an ease left on would trail the viewport edge.
  const isWindowResizing = useWindowResizing()
  const skipTransition = isResizing || isWindowResizing
  const desktopTranslateX = isSidePanelOpen
    ? `calc(-50% + ${sidePanelWidth / 2}px)`
    : '-50%'

  const isEditing = mode === 'edit'

  // Both trees below are always mounted and split by CSS, so the legend and
  // the Design menu may only render into the visible one — two controlled
  // popovers sharing one open flag would open twice. `useIsMobile` is the
  // exact complement of `md`, which is also where the footer drops its
  // button labels: four labelled buttons don't fit a 390px screen.
  const isMobile = useIsMobile()
  // The phone footer holds up to five icon buttons in edit mode (Add or
  // Legend, Events, Design, Settings, API Keys), or three plus the
  // Edit/Present switch in present mode — wider than a 360px screen at the
  // dock's usual 80px minimum. 56px is an icon button's natural width, still
  // well clear of a 44px touch target.
  const compactClass = isMobile ? 'min-w-[56px]' : ''
  const legendControl = aiGenerated && legend && onLegendOpenChange ? (
    <DockLegend
      {...legend}
      open={activePanel === 'legend'}
      onOpenChange={onLegendOpenChange}
      mode={mode}
      disabled={streaming}
      iconOnly={isMobile}
      triggerClassName={compactClass}
    />
  ) : null
  const designControl = design && onDesignOpenChange ? (
    <DockDesign
      {...design}
      open={activePanel === 'design'}
      onOpenChange={onDesignOpenChange}
      disabled={streaming}
      iconOnly={isMobile}
      triggerClassName={compactClass}
    />
  ) : null
  const apiKeysControl = onApiKeysOpenChange ? (
    <DockApiKeys
      open={activePanel === 'apiKeys'}
      onOpenChange={onApiKeysOpenChange}
      // Collapsed in the phone's present-mode footer: disabled there too, so
      // the invisible button drops out of the tab order.
      disabled={streaming || (isMobile && !isEditing)}
      iconOnly={isMobile}
      triggerClassName={compactClass}
    />
  ) : null

  /**
   * The intro's rise, composed into the existing transform.
   *
   * It has to go in the same inline `transform` as the side-panel push: an
   * inline style beats a utility class, so a Tailwind `translate-y` here
   * would be silently discarded — the trap GlobalLayout.tsx documents. The
   * Y leg is dropped once the intro is over, leaving the original value
   * exactly as it was.
   */
  const desktopTranslateY = intro ? `${INTRO_RISE_PX}px` : '0px'
  // Nothing here has anywhere to go while a generation is running: there is
  // no timeline row yet, and the events on screen belong to the stream.
  // Dimmed rather than hidden, so the dock does not reflow when it unlocks.
  const lockedClass = streaming ? 'opacity-50 pointer-events-none' : ''
  const introTransition = intro
    ? `transform ${INTRO_RISE_MS}ms var(--ease-pop) ${INTRO_RISE_DELAY_MS}ms`
    : undefined

  /** The dock's buttons, in order, for one of the two trees. */
  const renderButtons = (surface: 'desktop' | 'mobile') => {
    const iconOnly = surface === 'mobile'
    return (
      <>
        {!aiGenerated && (
          <Collapsible open={isEditing}>
            <Button
              variant="glass" size="none"
              className={`${lockedClass} ${iconOnly ? compactClass : ''}`}
              onClick={onAddEventClick}
              disabled={streaming}
              tabIndex={isEditing && !streaming ? 0 : -1}
              aria-label="Add Event"
              title={iconOnly ? 'Add Event' : undefined}
            >
              <Plus size={20} />
              {!iconOnly && 'Add Event'}
            </Button>
          </Collapsible>
        )}
        <Button
          variant="glass" size="none"
          className={`${lockedClass} ${iconOnly ? compactClass : ''}`}
          data-active={activePanel === 'events'}
          onClick={onEventsClick}
          disabled={streaming}
          aria-label="Events"
          title={iconOnly ? 'Events' : undefined}
        >
          <CalendarFold size={20} />
          {!iconOnly && 'Events'}
        </Button>
        {(surface === 'mobile') === isMobile && designControl}
        {(surface === 'mobile') === isMobile && legendControl}
        <Collapsible open={isEditing}>
          <Button
            variant="glass" size="none"
            className={`${lockedClass} ${iconOnly ? compactClass : ''}`}
            data-active={activePanel === 'settings'}
            onClick={onSettingsClick}
            disabled={streaming}
            tabIndex={isEditing && !streaming ? 0 : -1}
            aria-label="Settings"
            title={iconOnly ? 'Settings' : undefined}
          >
            <Bolt size={20} />
            {!iconOnly && 'Settings'}
          </Button>
        </Collapsible>
        {/* Keys belong to the account, not the timeline, so on desktop they
            stay reachable in present mode (World Events still spends them).
            The phone footer has no room for them beside the Edit/Present
            switch, so there they follow Settings and collapse. */}
        {(surface === 'mobile') === isMobile && (
          iconOnly
            ? <Collapsible open={isEditing}>{apiKeysControl}</Collapsible>
            : apiKeysControl
        )}
      </>
    )
  }

  return (
    <>
      {/* Desktop: floating pill, centered over the visible timeline area.
          Animates with the side panel's push transition (300ms ease-out), but
          tracks the drag directly while the panel is being resized.

          The pill is deliberately content-width. It used to carry a hand-measured
          `w-[373px]` matched to exactly three labels, which no conditional button
          could survive. With width auto it re-lays out from its content every
          frame, and `translateX(-50%)` resolves against its own border box — so
          collapsing a child animates the pill's width *and* keeps it centred,
          with no width transition of its own.

          Order: Events, Design, Legend, Settings, then API Keys last before
          the Edit/Present switch — the menus that change what you see sit
          together, then the one that manages the timeline itself, then the
          one that belongs to the account rather than the timeline. */}
      <div
        className={`
          hidden md:flex
          fixed bottom-6 left-1/2 z-30
          flex-row items-start gap-2 p-2
          h-[58px]
          bg-[rgba(23,23,23,0.8)] border border-[#262626] backdrop-blur-[2px]
          rounded-[20px]
          will-change-transform
          ${skipTransition || intro ? '' : 'transition-transform duration-300 ease-out'}
        `}
        style={{
          transform: `translateX(${desktopTranslateX}) translateY(${desktopTranslateY})`,
          transition: introTransition,
        }}
      >
        {renderButtons('desktop')}
        {SHOW_MODE_TABS && onModeChange && <ModeTabs mode={mode} onChange={onModeChange} />}
      </div>

      {/* Mobile: full-width sticky footer, icons only — the buttons carry
          their names in `aria-label` and `title` instead. The tabs are
          deliberately absent in edit mode — Present is a desktop affordance
          (see GlobalNav's right cluster). They do appear in view mode, so a
          desktop window narrowed while presenting always has a way back rather
          than stranding the reader in a mode it cannot leave. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 w-full flex md:hidden justify-center items-center gap-2 px-4 pt-2 pb-6 bg-black border-t border-[#3d3e40]">
        {renderButtons('mobile')}
        {SHOW_MODE_TABS && !isEditing && onModeChange && <ModeTabs mode={mode} onChange={onModeChange} />}
      </div>
    </>
  )
}

interface CollapsibleProps {
  open: boolean
  children: ReactNode
}

/**
 * Collapses a dock button to nothing, following the same recipe as the nav's
 * panel toggle: the element stays mounted so the width change can animate, and
 * a negative margin eats the parent's flex gap, which `max-width` alone cannot.
 *
 * The collapse classes have to live on this wrapper rather than the button —
 * `min-width` beats `max-width` in CSS, and every dock button carries
 * `min-w-[80px]` from the `glass` variant. `overflow-hidden` clips it instead.
 */
function Collapsible({ open, children }: CollapsibleProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null)

  // Animating `max-width` needs a concrete open value, and the honest one is
  // whatever the button actually measures. A literal would have to be either
  // too tight (clipping the label — these are set in whatever sans the OS
  // supplies, since Avenir never loads) or too loose, in which case the start
  // of the collapse is spent shrinking empty space. `scrollWidth` reports the
  // full content width even once the wrapper is clipping, and this runs before
  // paint, so the unmeasured first frame is never shown.
  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const width = ref.current.scrollWidth + 1
    setNaturalWidth(prev => (prev === width ? prev : width))
  }, [open])

  return (
    <div
      ref={ref}
      className={`shrink-0 overflow-hidden transition-[max-width,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${
        open ? 'opacity-100' : 'opacity-0 -ml-2 pointer-events-none'
      }`}
      style={{ maxWidth: open ? naturalWidth ?? undefined : 0 }}
      aria-hidden={!open}
    >
      {children}
    </div>
  )
}
