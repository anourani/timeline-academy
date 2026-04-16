import type { ReactNode } from 'react'
import { GlobalSidePanel } from '@/components/SidePanel/GlobalSidePanel'
import { useSidePanel } from '@/hooks/useSidePanel'

interface GlobalLayoutProps {
  children: ReactNode
}

/**
 * Push-layout with a viewport-pinned floating side panel:
 * - Panel is position: fixed with a 6px gap on left/top/bottom so it floats.
 * - Total horizontal footprint is 320px (314px panel + 6px gap), so main
 *   content padding-left stays at 320px when the panel is open.
 */
export function GlobalLayout({ children }: GlobalLayoutProps) {
  const { isOpen } = useSidePanel()

  return (
    <div className="min-h-screen">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[320px] pl-[6px] py-[6px] transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        <GlobalSidePanel />
      </aside>
      <div
        className="min-h-screen transition-[padding-left] duration-300 ease-out"
        style={{ paddingLeft: isOpen ? '320px' : '0px' }}
      >
        {children}
      </div>
    </div>
  )
}
