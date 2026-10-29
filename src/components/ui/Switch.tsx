import { cn } from '@/lib/utils'

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** The switch has no visible label of its own — the row's text is it. */
  'aria-label': string
  disabled?: boolean
  className?: string
}

/**
 * The on/off switch the Design menu uses: green track, light knob.
 *
 * `disabled` keeps the switch focusable-free and dims it; the row beside it
 * says why (see DockDesign's World Events subtitle).
 */
export function Switch({ checked, onCheckedChange, disabled = false, className, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria['aria-label']}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 w-11 h-6 rounded-[50px] transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        checked ? 'bg-[#259E23]' : 'bg-[rgba(37,158,35,0.3)]',
        className,
      )}
    >
      <span
        className="absolute top-1/2 left-0 w-5 h-5 -translate-y-1/2 rounded-full bg-[#F5F5F5] transition-transform"
        style={{ transform: `translate(${checked ? 22 : 2}px, -50%)` }}
      />
    </button>
  )
}
