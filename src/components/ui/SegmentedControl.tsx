import { useRef } from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  /** What the segment shows. A glyph or two — the name lives in `name`. */
  label: string
  /** The word the glyph stands for: accessible name, and the hover tooltip. */
  name: string
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Names the group for assistive tech — usually the visible row label. */
  label: string
}

/**
 * A row of mutually exclusive choices in a bordered track, with the current one
 * filled.
 *
 * **A radio group, not a tab list.** It looks like tabs and gets called tabs,
 * but it selects a value rather than revealing a panel, and `role="tab"`
 * promises an `aria-controls` target that does not exist here. The radio
 * pattern brings the behaviour the look implies: one stop in the tab order for
 * the whole group, arrow keys to move *and* choose within it.
 *
 * That pattern stops being a nicety once the labels are single glyphs. "S" is
 * not a word, so the segment carries `name` as its accessible name and its
 * tooltip, and the group carries the row's label — otherwise a screen reader
 * reads out three letters with nothing to attach them to.
 *
 * **Geometry.** The track's radius minus its padding is the segment's radius
 * (10 − 4 = 6), which is what makes the filled segment sit concentrically
 * inside the border instead of cutting a flatter corner across it. Segments are
 * `min-w`, not fixed-width, so a longer label grows its own segment, and the
 * track sizes to its contents rather than to a hard-coded width that has to be
 * re-derived every time an option is added.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  // Arrows move selection with focus, which is the radio-group contract: the
  // group has one tab stop, so if arrowing only moved focus there would be no
  // key left that chooses.
  const handleKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    if (next === null) return
    e.preventDefault()
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex flex-row items-center p-1 bg-surface-secondary border border-[#262626] rounded-[10px]"
    >
      {options.map((option, i) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => { refs.current[i] = el }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.name}
            title={option.name}
            // Roving tabindex: the group is one stop, and Tab lands on whatever
            // is currently chosen rather than always on the first segment.
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={handleKeyDown(i)}
            className={cn(
              // 50x40 of hit area per segment, so a thumb has something to land
              // on even though the glyph inside is one character wide.
              'flex items-center justify-center min-w-[50px] h-10 px-3 rounded-[6px]',
              // `body-lg` rather than the row's `body-m`: a lone capital has
              // no word-shape to carry it, so at 14px it sat small inside a
              // 40px segment. 16px is the next token up, not a one-off size.
              'body-lg leading-none transition-colors select-none',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40',
              checked
                ? 'bg-[#262626] text-text-secondary'
                : 'bg-transparent text-text-tertiary hover:text-text-secondary',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
