import { useCallback, useMemo, useRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { countEventsByCategory } from '@/utils/categoryCounts'
import { cn } from '@/lib/utils'
import type { CategoryConfig, TimelineEvent } from '@/types/event'

interface CategoryLegendProps {
  categories: CategoryConfig[]
  events: TimelineEvent[]
  onCategoriesChange: (categories: CategoryConfig[]) => void
}

/**
 * Nav control that says which colour means which category, and lets the reader
 * hide a category's events.
 *
 * Visibility is the existing `CategoryConfig.visible` flag — the same one the
 * events modal's Categories tab writes, and the one `Timeline.tsx` already
 * filters on. So this is a second, *live* entry point into `updateCategories`
 * rather than new state: a toggle here persists exactly like a toggle there,
 * which means it arms the debounced autosave and re-sorts the side panel.
 *
 * Open/closed is left uncontrolled — Radix supplies `aria-haspopup="dialog"`,
 * `aria-expanded` and `data-state` on the trigger, so the open-state fill is
 * pure CSS and there is no React state to keep in sync (or to persist).
 */
export function CategoryLegend({ categories, events, onCategoriesChange }: CategoryLegendProps) {
  const counts = useMemo(() => countEventsByCategory(events), [events])
  const visibleCount = useMemo(() => categories.filter(c => c.visible).length, [categories])
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])

  const totalLabel = `${events.length} ${events.length === 1 ? 'event' : 'events'}`

  const toggle = useCallback(
    (id: CategoryConfig['id']) => {
      onCategoriesChange(
        categories.map(c => (c.id === id ? { ...c, visible: !c.visible } : c)),
      )
    },
    [categories, onCategoriesChange],
  )

  // Radix Popover does no roving focus of its own, so arrow keys are ours.
  const handleRowKeyDown = useCallback(
    (index: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const last = categories.length - 1
      let next: number | null = null
      if (e.key === 'ArrowDown') next = index === last ? 0 : index + 1
      else if (e.key === 'ArrowUp') next = index === 0 ? last : index - 1
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = last
      if (next === null) return
      e.preventDefault()
      rowRefs.current[next]?.focus()
    },
    [categories.length],
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Category legend"
          className={cn(
            // Below `md` the nav's right cluster is gone, so the trigger floats
            // out of flow against the bar's right edge — the mirror of the
            // panel toggle's `absolute left-4 top-4 md:static` treatment.
            'absolute right-4 top-5 z-10 md:static md:z-auto',
            'flex shrink-0 items-center justify-center gap-[6px]',
            'h-[36px] w-[36px] md:h-[32px] md:w-auto md:px-[11px] md:py-[6px]',
            'rounded-[10px] border border-white/[0.15] bg-white/10 backdrop-blur-[12px]',
            'shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]',
            'text-[#c9ced4] transition-colors',
            'hover:bg-white/20 hover:text-[#dadee5]',
            // Hold the hover fill while the panel is open so the button reads as active.
            'data-[state=open]:bg-white/20 data-[state=open]:text-[#dadee5]',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40',
          )}
        >
          <CategoryDots categories={categories} />
          <span className="label-m-type2 hidden md:inline">Legend</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        unstyled
        align="end"
        sideOffset={8}
        collisionPadding={16}
        aria-label="Category legend"
        // Land focus on the first row rather than the panel itself.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          rowRefs.current[0]?.focus()
        }}
        // Inline, because an arbitrary duration utility is ambiguous to
        // Tailwind here — the core transition scale and tailwindcss-animate's
        // animation scale share the `duration-` namespace and both take a
        // <time>, so no type hint can separate them. The
        // `motion-reduce:animate-none` class still wins: it zeroes
        // `animation-name`, which this does not touch.
        style={{ animationDuration: '120ms' }}
        className={cn(
          'z-50 outline-none',
          // Mobile is a full-bleed sheet inset 16px each side. That falls out of
          // Radix's own positioning: the trigger sits at `right-4`, `align="end"`
          // pins the panel's right edge to it, and this width puts the left edge
          // at 16px. Fighting the popper wrapper's transform would not work —
          // it lives on the wrapper element, not on this one.
          'w-[calc(100vw-32px)] md:w-[264px]',
          'rounded-[16px] border border-[#262626] p-2 backdrop-blur-[12px]',
          'bg-[rgba(23,23,23,0.96)] md:bg-[rgba(23,23,23,0.92)]',
          'shadow-[0px_8px_32px_rgba(0,0,0,0.6)] md:shadow-[0px_8px_32px_rgba(0,0,0,0.4)]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
          'motion-reduce:animate-none',
        )}
      >
        <div className="flex items-center justify-between px-[10px] pb-[8px] pt-[6px]">
          <span className="label-s-type2 uppercase tracking-[0.04em] text-[#9B9EA3]">
            Categories
          </span>
          <span className="font-['JetBrains_Mono',monospace] text-[11px] leading-none text-[#9B9EA3]">
            {totalLabel}
          </span>
        </div>

        <div className="flex flex-col gap-[2px]">
          {categories.map((cat, i) => {
            // Never let the reader hide everything — an empty timeline has no
            // range to draw, and there would be no way back from an empty panel.
            const isLastVisible = cat.visible && visibleCount === 1
            return (
              <button
                key={cat.id}
                ref={(el) => { rowRefs.current[i] = el }}
                type="button"
                aria-pressed={cat.visible}
                aria-disabled={isLastVisible || undefined}
                // `aria-disabled` rather than `disabled`: a disabled button
                // cannot take focus, which would punch a hole in arrow-key nav.
                aria-label={cat.visible ? `Hide ${cat.label}` : `Show ${cat.label}`}
                onClick={() => { if (!isLastVisible) toggle(cat.id) }}
                onKeyDown={handleRowKeyDown(i)}
                className={cn(
                  'group flex w-full items-center gap-[10px] rounded-[10px] px-[10px] text-left transition-colors',
                  'min-h-[44px] py-[12px] md:min-h-0 md:py-[8px]',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40',
                  isLastVisible ? 'cursor-default' : 'hover:bg-white/[0.06]',
                )}
              >
                <span
                  className="size-[10px] shrink-0 rounded-[3px]"
                  style={{ backgroundColor: cat.color, opacity: cat.visible ? 1 : 0.4 }}
                />
                <span
                  className="body-m text-[#C9CED4]"
                  style={{ opacity: cat.visible ? 1 : 0.4 }}
                >
                  {cat.label}
                </span>
                <span className="label-s-type1 ml-auto text-[#9B9EA3]">
                  {counts.get(cat.id) ?? 0}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-[#6D7073] transition-colors',
                    !isLastVisible && 'group-hover:text-[#C9CED4]',
                  )}
                  aria-hidden
                >
                  {cat.visible ? <Eye size={16} strokeWidth={1.25} /> : <EyeOff size={16} strokeWidth={1.25} />}
                </span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The palette preview on the trigger: overlapping discs, each ringed in the
 * page background so they read as separate. Always shows every category
 * regardless of visibility — it is an affordance, not a status readout.
 */
function CategoryDots({ categories }: { categories: CategoryConfig[] }) {
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      {categories.map((cat, i) => (
        <span
          key={cat.id}
          className="size-[7px] shrink-0 rounded-full md:size-[8px]"
          style={{
            backgroundColor: cat.color,
            boxShadow: '0 0 0 1px #0A0A0A',
            marginLeft: i === 0 ? 0 : -2,
          }}
        />
      ))}
    </span>
  )
}
