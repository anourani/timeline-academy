import type { CSSProperties, ReactNode } from 'react'
import { GlobalSidePanel } from '@/components/SidePanel/GlobalSidePanel'
import { PanelResizeHandle } from '@/components/ui/PanelResizeHandle'
import { useSidePanel } from '@/hooks/useSidePanel'

interface GlobalLayoutProps {
  children: ReactNode
}

/**
 * Two layouts for one panel, split at `md`.
 *
 * **At `md` and above — push layout.** The panel is position: fixed with a 6px
 * gap on left/top/bottom so it floats. Its footprint (`width`, gap included) is
 * user-resizable and persisted; the main content's padding-left tracks the same
 * value so the two never drift. `FloatingToolbar` is the third reader — see
 * `SidePanelContext`.
 *
 * **Below `md` — full-bleed drawer.** The panel covers the viewport off
 * `inset-0` and the content is not pushed at all: there is no room beside a
 * panel on a phone, and the push left the page in a 64px gutter.
 * `EventDetailPanel` does the same thing mirrored to the right edge.
 *
 * Both values travel as **CSS custom properties rather than inline styles**,
 * which is the only thing that makes the split expressible: an inline `width`
 * or `padding-left` wins over every class, so no `md:` prefix could undo it
 * below the breakpoint. `md:right-auto` is load-bearing for the same reason in
 * reverse — `inset-0` sets `right: 0`, and the docked rail has to give it back.
 *
 * `-translate-x-full` is a percentage of the panel's own width, so the collapse
 * animation follows both a variable width and a full-viewport one for free. The
 * width itself needs an explicit transition leg, dropped mid-drag so the edge
 * tracks the cursor instead of easing 300ms behind it.
 */
export function GlobalLayout({ children }: GlobalLayoutProps) {
  const { isOpen, width, setWidth, resetWidth, isResizing, setIsResizing } = useSidePanel()

  return (
    <div className="min-h-screen">
      <aside
        className={`fixed inset-0 z-40 md:inset-y-0 md:left-0 md:right-auto md:w-[var(--side-panel-width)] md:pl-[6px] md:py-[6px] ${
          isResizing ? '' : 'transition-[transform,width] duration-300 ease-out'
        } ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ '--side-panel-width': `${width}px` } as CSSProperties}
        aria-hidden={!isOpen}
      >
        <GlobalSidePanel />
        {isOpen && (
          <PanelResizeHandle
            side="left"
            width={width}
            onWidthChange={setWidth}
            onResizeStateChange={setIsResizing}
            onReset={resetWidth}
            label="Resize timelines panel"
          />
        )}
      </aside>
      <div
        className={`min-h-screen md:pl-[var(--side-panel-push)] ${
          isResizing ? '' : 'transition-[padding-left] duration-300 ease-out'
        }`}
        style={{ '--side-panel-push': isOpen ? `${width}px` : '0px' } as CSSProperties}
      >
        {children}
      </div>
    </div>
  )
}
