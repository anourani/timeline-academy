import type { ReactNode } from 'react'
import { GlobalSidePanel } from '@/components/SidePanel/GlobalSidePanel'
import { useSidePanel } from '@/contexts/SidePanelContext'

interface GlobalLayoutProps {
  children: ReactNode
}

/**
 * Push-layout wrapper: when the side panel is open, the 320px panel column
 * expands and the main content shrinks. Animates via grid-template-columns.
 */
export function GlobalLayout({ children }: GlobalLayoutProps) {
  const { isOpen } = useSidePanel()

  return (
    <div
      className="min-h-screen grid transition-[grid-template-columns] duration-300 ease-out"
      style={{
        gridTemplateColumns: isOpen ? '320px 1fr' : '0px 1fr',
      }}
    >
      <div className="relative overflow-hidden">
        <div className="w-[320px] h-screen sticky top-0">
          <GlobalSidePanel />
        </div>
      </div>
      <div className="min-w-0 overflow-x-hidden">
        {children}
      </div>
    </div>
  )
}
