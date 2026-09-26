import { Shuffle } from 'lucide-react'
import { MOMENT_KIND_COLOR, type Moment } from '@/constants/aiSubjectSuggestions'

interface QuickSearchMomentsProps {
  moments: Moment[]
  onSelect: (title: string) => void
  onShuffle: () => void
  /** Mirrors the old chip row: true while the suggestions dropdown is rendered. */
  receded: boolean
}

/**
 * Opaque on purpose. The hover `brightness()` filter makes the button a
 * backdrop root, which disables `backdrop-blur` — so a translucent pill let the
 * page's background grid line show straight through it. `#232323` is `white/10`
 * composited over `surface-primary`, so at rest it looks the same as the glass
 * it replaced.
 */
const PILL_CLASS =
  "rounded-[10px] bg-[#232323] border border-white/[0.15] shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)] font-['Avenir',sans-serif] font-medium text-[14px] leading-[20px] text-[#c9ced4] px-[11px] py-[6px] max-w-full box-border"

const YEAR_CLASS =
  "font-['JetBrains_Mono',monospace] font-normal text-[11px] leading-[14px] text-text-tertiary"

const FOCUS_CLASS = 'outline-none rounded-[10px] focus-visible:ring-1 focus-visible:ring-white/40'

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-[7px] rounded-full"
      style={{ background: color, boxShadow: `0 0 10px ${color}` }}
    />
  )
}

/**
 * The quick searches under the Create field, drawn as a small timeline: one
 * person, one era and one event on an axis, in date order. Horizontal from
 * `md` up, vertical below it, where Shuffle becomes the last stop on the line.
 *
 * Every button is `type="button"`, and that is required rather than tidy: this
 * renders inside the Create `<form>`, where a default `submit` would fire
 * `handleSubmit` with whatever is typed in the field on top of `onSelect`.
 */
export function QuickSearchMoments({ moments, onSelect, onShuffle, receded }: QuickSearchMomentsProps) {
  // `pointer-events-none` on the container stops the mouse; this stops the
  // keyboard. React 18 has no `inert` prop, which would do both in one word.
  const tabIndex = receded ? -1 : undefined

  return (
    <div
      role="group"
      aria-label="Quick searches"
      className={`w-full flex flex-col gap-[6px] mt-[8px] transition-opacity duration-150 ${
        receded ? 'opacity-40 pointer-events-none' : ''
      }`}
    >
      <span className="label-small-allcaps tracking-[0.04em] text-text-tertiary text-center pb-[4px]">
        Or drop into a moment
      </span>

      {/* Desktop: horizontal. The axis sits at 25px, which is where the dots'
          centres land: 14px year + 8px spacer + half of a 7px dot. */}
      <div className="hidden md:block relative w-full mt-[4px]">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-[25px] h-px bg-[linear-gradient(to_right,transparent,rgba(210,210,210,0.2)_12%,rgba(210,210,210,0.2)_88%,transparent)]"
        />
        <div className="grid grid-cols-3 gap-[8px] relative">
          {moments.map((m) => (
            <button
              key={m.title}
              type="button"
              tabIndex={tabIndex}
              aria-label={`${m.title}, ${m.year}`}
              onClick={() => onSelect(m.title)}
              className={`flex flex-col items-center min-w-0 transition-[filter] duration-150 hover:brightness-[1.3] ${FOCUS_CLASS}`}
            >
              <span className={`${YEAR_CLASS} h-[14px]`}>{m.year}</span>
              <span aria-hidden="true" className="h-[8px]" />
              <Dot color={MOMENT_KIND_COLOR[m.kind]} />
              <span aria-hidden="true" className="w-px h-[10px] bg-[rgba(210,210,210,0.3)]" />
              <span className={`${PILL_CLASS} text-center [text-wrap:balance]`}>{m.short}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-center mt-[12px]">
          <button
            type="button"
            tabIndex={tabIndex}
            onClick={onShuffle}
            className={`h-[36px] px-[12px] rounded-[10px] text-text-tertiary hover:text-text-primary hover:bg-white/10 transition-all ${FOCUS_CLASS}`}
          >
            <span className="flex items-center gap-[6px] font-['Avenir',sans-serif] font-medium text-[12px] leading-[18px]">
              <Shuffle size={14} strokeWidth={1.5} aria-hidden="true" />
              Shuffle moments
            </span>
          </button>
        </div>
      </div>

      {/* Mobile: vertical. Columns are 56px year / 24px dot / pill, so the
          axis at 67px runs through the dot column's centre. It turns dotted
          for its last 16px, into the Shuffle row. Rows are `relative` so they
          paint over the absolutely positioned axis rather than under it. */}
      <div className="md:hidden relative w-full">
        <div
          aria-hidden="true"
          className="absolute left-[67px] top-[10px] bottom-[26px] w-px bg-[rgba(210,210,210,0.2)]"
        />
        <div
          aria-hidden="true"
          className="absolute left-[67px] bottom-[10px] h-[16px] w-px bg-[repeating-linear-gradient(to_bottom,rgba(210,210,210,0.25)_0_2px,transparent_2px_5px)]"
        />
        {moments.map((m) => (
          <button
            key={m.title}
            type="button"
            tabIndex={tabIndex}
            aria-label={`${m.title}, ${m.year}`}
            onClick={() => onSelect(m.title)}
            className={`relative w-full h-[52px] grid grid-cols-[56px_24px_minmax(0,1fr)] items-center text-left transition-[filter] duration-150 active:brightness-[1.3] ${FOCUS_CLASS}`}
          >
            <span className={`${YEAR_CLASS} text-right pr-[4px]`}>{m.year}</span>
            <span className="flex justify-center">
              <Dot color={MOMENT_KIND_COLOR[m.kind]} />
            </span>
            <span className={`${PILL_CLASS} justify-self-start whitespace-nowrap overflow-hidden text-ellipsis`}>
              {m.title}
            </span>
          </button>
        ))}
        <button
          type="button"
          tabIndex={tabIndex}
          onClick={onShuffle}
          className={`relative w-full h-[48px] grid grid-cols-[56px_24px_minmax(0,1fr)] items-center text-left text-text-tertiary active:text-text-primary transition-colors ${FOCUS_CLASS}`}
        >
          <span aria-hidden="true" className={`${YEAR_CLASS} text-right pr-[4px]`}>···</span>
          <span className="flex justify-center">
            <span aria-hidden="true" className="size-[7px] rounded-full border border-current bg-surface-primary" />
          </span>
          <span className="pl-[11px] flex items-center gap-[6px] font-['Avenir',sans-serif] font-medium text-[12px] leading-[18px]">
            <Shuffle size={14} strokeWidth={1.5} aria-hidden="true" />
            Shuffle moments
          </span>
        </button>
      </div>
    </div>
  )
}
