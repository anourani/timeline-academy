import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Plus, CalendarFold, Bolt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModeTabs } from '@/components/FloatingToolbar/ModeTabs'
import { useSidePanel } from '@/hooks/useSidePanel'

interface FloatingToolbarProps {
  onAddEventClick: () => void
  onEventsClick: () => void
  onSettingsClick: () => void
  activePanel: 'events' | 'settings' | null
  mode?: 'edit' | 'view'
  onModeChange?: (mode: 'edit' | 'view') => void
}

export function FloatingToolbar({
  onAddEventClick,
  onEventsClick,
  onSettingsClick,
  activePanel,
  mode = 'edit',
  onModeChange,
}: FloatingToolbarProps) {
  // The pill is centered on the viewport, then shifted by half the side
  // panel's width to recenter over the visible timeline area. The width is
  // user-resizable, so it has to be read live — a local copy of the constant
  // would drift silently on the first drag.
  const { isOpen: isSidePanelOpen, width: sidePanelWidth, isResizing } = useSidePanel()
  const desktopTranslateX = isSidePanelOpen
    ? `calc(-50% + ${sidePanelWidth / 2}px)`
    : '-50%'

  const isEditing = mode === 'edit'

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
          with no width transition of its own. */}
      <div
        className={`
          hidden md:flex
          fixed bottom-6 left-1/2 z-30
          flex-row items-start gap-2 p-2
          h-[58px]
          bg-[rgba(23,23,23,0.8)] border border-[#262626] backdrop-blur-[2px]
          rounded-[20px]
          will-change-transform
          ${isResizing ? '' : 'transition-transform duration-300 ease-out'}
        `}
        style={{ transform: `translateX(${desktopTranslateX})` }}
      >
        <Collapsible open={isEditing}>
          <Button variant="glass" size="none" onClick={onAddEventClick} tabIndex={isEditing ? 0 : -1}>
            <Plus size={20} />
            Add Event
          </Button>
        </Collapsible>
        <Button
          variant="glass" size="none"
          data-active={activePanel === 'events'}
          onClick={onEventsClick}
        >
          <CalendarFold size={20} />
          Events
        </Button>
        <Collapsible open={isEditing}>
          <Button
            variant="glass" size="none"
            data-active={activePanel === 'settings'}
            onClick={onSettingsClick}
            tabIndex={isEditing ? 0 : -1}
          >
            <Bolt size={20} />
            Settings
          </Button>
        </Collapsible>
        {onModeChange && <ModeTabs mode={mode} onChange={onModeChange} />}
      </div>

      {/* Mobile: full-width sticky footer. The tabs are deliberately absent in
          edit mode — Present is a desktop affordance (see GlobalNav's right
          cluster) and four controls do not fit a phone. They do appear in view
          mode, so a desktop window narrowed while presenting always has a way
          back rather than stranding the reader in a mode it cannot leave. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 w-full flex md:hidden justify-center items-center gap-2 px-4 pt-2 pb-6 bg-black border-t border-[#3d3e40]">
        <Collapsible open={isEditing}>
          <Button variant="glass" size="none" onClick={onAddEventClick} tabIndex={isEditing ? 0 : -1}>
            <Plus size={20} />
            Add Event
          </Button>
        </Collapsible>
        <Button
          variant="glass" size="none"
          data-active={activePanel === 'events'}
          onClick={onEventsClick}
        >
          <CalendarFold size={20} />
          Events
        </Button>
        <Collapsible open={isEditing}>
          <Button
            variant="glass" size="none"
            data-active={activePanel === 'settings'}
            onClick={onSettingsClick}
            tabIndex={isEditing ? 0 : -1}
          >
            <Bolt size={20} />
            Settings
          </Button>
        </Collapsible>
        {!isEditing && onModeChange && <ModeTabs mode={mode} onChange={onModeChange} />}
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
