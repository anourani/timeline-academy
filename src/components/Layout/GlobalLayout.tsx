import type { ReactNode } from 'react'
import { GlobalSidePanel } from '@/components/SidePanel/GlobalSidePanel'
import { PanelResizeHandle } from '@/components/ui/PanelResizeHandle'
import { useSidePanel } from '@/hooks/useSidePanel'

interface GlobalLayoutProps {
  children: ReactNode
}

/**
 * Push-layout with a viewport-pinned floating side panel:
 * - Panel is position: fixed with a 6px gap on left/top/bottom so it floats.
 * - Its footprint (`width`, gap included) is user-resizable and persisted; the
 *   main content's padding-left tracks the same value so the two never drift.
 *   `FloatingToolbar` is the third reader — see `SidePanelContext`.
 *
 * `-translate-x-full` is a percentage of the panel's own width, so the
 * collapse animation follows a variable width for free. The width itself needs
 * an explicit transition leg, dropped mid-drag so the edge tracks the cursor
 * instead of easing 300ms behind it.
 */
export function GlobalLayout({ children }: GlobalLayoutProps) {
  const { isOpen, width, setWidth, resetWidth, isResizing, setIsResizing } = useSidePanel()

  return (
    <div className="min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 pl-[6px] py-[6px] ${
          isResizing ? '' : 'transition-[transform,width] duration-300 ease-out'
        } ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ width: `${width}px` }}
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
        className={`min-h-screen ${
          isResizing ? '' : 'transition-[padding-left] duration-300 ease-out'
        }`}
        style={{ paddingLeft: isOpen ? `${width}px` : '0px' }}
      >
        {children}
      </div>
    </div>
  )
}
