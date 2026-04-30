import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TimelineEvent } from '@/types/event'

interface EventActionsMenuProps {
  event: TimelineEvent
  position: { x: number; y: number }
  onClose: () => void
  onEdit: () => void
  onOpenDetails: () => void
  onDelete: () => void
}

const MENU_WIDTH = 144
const MENU_HEIGHT = 116 // 3 items × ~36px + 4px padding

export function EventActionsMenu({
  position,
  onClose,
  onEdit,
  onOpenDetails,
  onDelete,
}: EventActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [adjusted, setAdjusted] = useState<{ left: number; top: number }>({
    left: position.x,
    top: position.y,
  })

  // Flip horizontally / vertically if the menu would overflow the viewport.
  useLayoutEffect(() => {
    const node = menuRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = position.x
    let top = position.y
    if (left + rect.width > vw - 8) {
      left = Math.max(8, position.x - rect.width)
    }
    if (top + rect.height > vh - 8) {
      top = Math.max(8, position.y - rect.height)
    }
    setAdjusted({ left, top })
  }, [position.x, position.y])

  // Close on Escape. (Outside-click closes via the invisible overlay below
  // — that way the click is also absorbed and doesn't fall through to the
  // timeline grid, which would otherwise fire its month-click handler and
  // create a new event at the click position.)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      {/* Invisible click-catcher. Sits above the timeline, below the menu.
          mousedown closes (and stops propagation), so the underlying grid
          never sees the click. Same trick for click + contextmenu so a
          right-click anywhere outside also dismisses cleanly. */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation()
          onClose()
        }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
        className="fixed inset-0"
        style={{ zIndex: 999 }}
        aria-hidden="true"
      />
      <div
        ref={menuRef}
        role="menu"
        style={{
          position: 'fixed',
          left: adjusted.left,
          top: adjusted.top,
          width: MENU_WIDTH,
          minHeight: MENU_HEIGHT,
          zIndex: 1000,
        }}
        className="bg-[#171717] border border-[#404040] rounded-[6px] shadow-[0_4px_12px_rgba(0,0,0,0.4)] py-1"
      >
        <MenuItem
          onClick={() => {
            onEdit()
            onClose()
          }}
        >
          Edit event
        </MenuItem>
        <MenuItem
          onClick={() => {
            onOpenDetails()
            onClose()
          }}
        >
          Open details
        </MenuItem>
        <MenuItem
          destructive
          onClick={() => {
            onDelete()
            onClose()
          }}
        >
          Delete
        </MenuItem>
      </div>
    </>,
    document.body,
  )
}

function MenuItem({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`w-full text-left px-3 py-2 font-['Avenir',sans-serif] text-[14px] leading-[20px] transition-colors hover:bg-white/5 ${
        destructive
          ? 'text-destructive hover:text-destructive'
          : 'text-[#c9ced4] hover:text-[#dadee5]'
      }`}
    >
      {children}
    </button>
  )
}
