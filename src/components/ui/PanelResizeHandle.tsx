import { useCallback, useEffect, useRef } from 'react'
import { PANEL_MAX_WIDTH, PANEL_MIN_WIDTH } from '@/constants/panels'

const KEYBOARD_STEP = 16

interface PanelResizeHandleProps {
  /** Viewport edge the panel is docked to. Drag direction inverts with it. */
  side: 'left' | 'right'
  width: number
  onWidthChange: (width: number) => void
  /** Lets the panel drop its width transition mid-drag so it tracks the cursor. */
  onResizeStateChange?: (isResizing: boolean) => void
  /** Double-click, and Home while focused, restore the panel's default width. */
  onReset?: () => void
  label: string
}

/**
 * Drag strip on a panel's inner edge.
 *
 * Rendered as a direct child of the panel's `<aside>`, which is `position:
 * fixed` and so is its own containing block — `right-0` lands on the card's
 * inner edge for a left-docked panel because the aside's 6px gap sits on the
 * far side, and vice versa. It deliberately sits outside the panel card, which
 * is `overflow-hidden` and would clip it.
 *
 * Pointer handling follows `hooks/useEventDrag.ts`: listeners go on `window`
 * for the duration of the drag so it survives the cursor leaving the 6px strip.
 *
 * Desktop only (`hidden md:block`) — on touch the strip would compete with
 * scrolling, and the event details panel is full-screen there anyway.
 */
export function PanelResizeHandle({
  side,
  width,
  onWidthChange,
  onResizeStateChange,
  onReset,
  label,
}: PanelResizeHandleProps) {
  const dragRef = useRef({ startX: 0, startWidth: 0 })

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const { startX, startWidth } = dragRef.current
      const delta = e.clientX - startX
      // A left-docked panel grows as the cursor moves right; a right-docked one
      // grows as it moves left.
      onWidthChange(side === 'left' ? startWidth + delta : startWidth - delta)
    },
    [onWidthChange, side]
  )

  const handlePointerUp = useCallback(() => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', handlePointerUp)
    window.removeEventListener('blur', handlePointerUp)

    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    onResizeStateChange?.(false)
  }, [handlePointerMove, onResizeStateChange])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()

      dragRef.current = { startX: e.clientX, startWidth: width }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerUp)
      window.addEventListener('blur', handlePointerUp)

      // Without these the drag selects the panel's text, and the cursor snaps
      // back to the default the moment it leaves the 6px strip.
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
      onResizeStateChange?.(true)
    },
    [handlePointerMove, handlePointerUp, onResizeStateChange, width]
  )

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      window.removeEventListener('blur', handlePointerUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [handlePointerMove, handlePointerUp])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Arrows grow and shrink in the same visual direction a drag would.
    const growKey = side === 'left' ? 'ArrowRight' : 'ArrowLeft'
    const shrinkKey = side === 'left' ? 'ArrowLeft' : 'ArrowRight'

    if (e.key === growKey) {
      e.preventDefault()
      onWidthChange(width + KEYBOARD_STEP)
    } else if (e.key === shrinkKey) {
      e.preventDefault()
      onWidthChange(width - KEYBOARD_STEP)
    } else if (e.key === 'Home' && onReset) {
      e.preventDefault()
      onReset()
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={PANEL_MIN_WIDTH}
      aria-valuemax={PANEL_MAX_WIDTH}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onDoubleClick={onReset}
      className={`group hidden md:block absolute inset-y-0 z-10 w-[6px] cursor-col-resize outline-none ${
        side === 'left' ? 'right-0' : 'left-0'
      }`}
    >
      {/* Hairline that only appears on hover or keyboard focus, so the panel
          edge stays clean at rest. */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-transparent transition-colors group-hover:bg-[#525252] group-focus:bg-[#c9ced4]" />
    </div>
  )
}
