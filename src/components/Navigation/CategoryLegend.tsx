import { useCallback, useMemo, useRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Eye, EyeOff, X } from 'lucide-react'
import { Dialog, DialogOverlay, DialogPortal, DialogTrigger } from '@/components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useIsMobile } from '@/hooks/useIsMobile'
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
 * Two surfaces, split at `md`: an anchored popover on desktop, a full-screen
 * drawer rising from the bottom edge on a phone. That split has to happen in
 * JavaScript because a Popover cannot become the drawer — its position lives
 * as inline styles on Radix's own popper wrapper, which no `className` here
 * can reach, and a popover is a non-modal layer besides. See `useIsMobile`.
 *
 * Open/closed is left uncontrolled in both — Radix's `Popover.Trigger` and
 * `Dialog.Trigger` each supply `aria-haspopup="dialog"`, `aria-expanded` and
 * `data-state` on the trigger, so the open-state fill is pure CSS and there is
 * no React state to keep in sync (or to persist).
 */
export function CategoryLegend({ categories, events, onCategoriesChange }: CategoryLegendProps) {
  const counts = useMemo(() => countEventsByCategory(events), [events])
  const visibleCount = useMemo(() => categories.filter(c => c.visible).length, [categories])
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])
  const isMobile = useIsMobile()

  const totalLabel = `${events.length} ${events.length === 1 ? 'event' : 'events'}`

  const toggle = useCallback(
    (id: CategoryConfig['id']) => {
      onCategoriesChange(
        categories.map(c => (c.id === id ? { ...c, visible: !c.visible } : c)),
      )
    },
    [categories, onCategoriesChange],
  )

  // Neither Radix primitive does roving focus of its own, so arrow keys are ours.
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

  // Land focus on the first row rather than the panel itself. One handler for
  // both surfaces — `onOpenAutoFocus` takes the same signature either side.
  const focusFirstRow = (e: Event) => {
    e.preventDefault()
    rowRefs.current[0]?.focus()
  }

  // Hoisted so either root can take it through `asChild`. Only one tree is
  // mounted at a time, so there is no duplicate-ref question.
  const trigger = (
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
  )

  // A local rather than a component: `rowRefs` stays in closure, and nothing
  // new gets exported from a file that exports a component.
  const rows = (
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
              // Only the first pair applies inside the drawer, only the `md:`
              // pair inside the popover — each tree lives on one side of `md`.
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
  )

  // Crossing the breakpoint while open unmounts one root and mounts the other
  // closed, so the legend simply closes. Radix releases the Dialog's scroll
  // lock on unmount, so nothing is stranded.
  if (isMobile) {
    return (
      <Dialog>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogPortal>
          {/* Covered by the content once open, but it carries the fade and is
              the click target while the drawer is still on its way up. */}
          <DialogOverlay className="bg-black/50" />
          <DialogPrimitive.Content
            // Silences Radix's missing-description warning: the Title names
            // the dialog and there is nothing to add below it.
            aria-describedby={undefined}
            onOpenAutoFocus={focusFirstRow}
            // Inline for the same reason as the popover's — see below.
            style={{ animationDuration: '300ms' }}
            className={cn(
              'fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#171717] outline-none',
              // `slide-*-bottom` is translateY(100%) ↔ 0, and on an `inset-0`
              // box that is a full viewport height: the drawer rises from the
              // bottom edge and leaves the same way.
              'data-[state=open]:animate-in data-[state=closed]:animate-out ease-out',
              'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
              // The `data-[state=…]` variants compile to a class *plus* an
              // attribute selector, so a bare `motion-reduce:animate-none` —
              // one class — loses to them on specificity and the slide plays
              // regardless. A media query adds no specificity of its own, so
              // the reduce guard has to carry the same attribute to win.
              'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none',
            )}
          >
            <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2 border-b border-[#404040] shrink-0">
              <DialogPrimitive.Title className="header-xsmall text-[#c9ced4] m-0">
                Categories
              </DialogPrimitive.Title>
              <div className="flex items-center gap-3">
                <span className="font-['JetBrains_Mono',monospace] text-[11px] leading-none text-[#9B9EA3]">
                  {totalLabel}
                </span>
                {/* A `fixed inset-0` drawer has no outside to tap and a phone
                    has no Escape key, so the X is the only way back out. */}
                <DialogPrimitive.Close
                  aria-label="Close category legend"
                  className="relative flex items-center justify-center p-1.5 rounded-lg border border-white/15 bg-white/10 backdrop-blur-[12px] text-[#c9ced4] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] hover:bg-white/20 hover:text-[#dadee5] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                >
                  <X size={16} strokeWidth={1.25} />
                </DialogPrimitive.Close>
              </div>
            </div>
            {/* Escape, focus trap, return-focus-to-trigger and the body scroll
                lock all come from Dialog. Nothing here re-implements them. */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2">{rows}</div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>

      <PopoverContent
        unstyled
        align="end"
        sideOffset={8}
        collisionPadding={16}
        aria-label="Category legend"
        onOpenAutoFocus={focusFirstRow}
        // Inline, because an arbitrary duration utility is ambiguous to
        // Tailwind here — the core transition scale and tailwindcss-animate's
        // animation scale share the `duration-` namespace and both take a
        // <time>, so no type hint can separate them. The
        // `motion-reduce:animate-none` class still wins: it zeroes
        // `animation-name`, which this does not touch.
        style={{ animationDuration: '120ms' }}
        className={cn(
          'z-50 outline-none',
          // Desktop only now — below `md` the drawer above replaces this
          // entirely, so there is no narrow width to carry here.
          'w-[264px]',
          'rounded-[16px] border border-[#262626] p-2 backdrop-blur-[12px]',
          'bg-[rgba(23,23,23,0.92)]',
          'shadow-[0px_8px_32px_rgba(0,0,0,0.4)]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          'data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1',
          // Same specificity story as the drawer's guard above.
          'motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none',
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

        {rows}
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
