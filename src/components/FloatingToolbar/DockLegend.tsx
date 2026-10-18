import { Pencil } from 'lucide-react'
import { CategoryLegend } from '@/components/Navigation/CategoryLegend'
import { glassButtonClass } from '@/components/ui/glassButton'
import type { CategoryConfig, TimelineEvent } from '@/types/event'

export interface DockLegendProps {
  categories: CategoryConfig[]
  events: TimelineEvent[]
  onCategoriesChange: (categories: CategoryConfig[]) => void
  groupByCategory: boolean
  onGroupByCategoryChange: (value: boolean) => void
  /** Opens the events modal on its Categories tab. Edit mode only. */
  onEditCategories: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'edit' | 'view'
  disabled?: boolean
}

/**
 * The category legend as it sits in the dock on AI timelines: the nav
 * legend's rows, plus the grouping switch and a way into the categories
 * editor.
 *
 * The switch drives the same `groupByCategory` state as the one in Settings,
 * so the two can't disagree. Category visibility is `CategoryConfig.visible`
 * as everywhere else — both persist with the timeline, in present mode too.
 */
export function DockLegend({
  categories,
  events,
  onCategoriesChange,
  groupByCategory,
  onGroupByCategoryChange,
  onEditCategories,
  open,
  onOpenChange,
  mode,
  disabled = false,
}: DockLegendProps) {
  return (
    <CategoryLegend
      categories={categories}
      events={events}
      onCategoriesChange={onCategoriesChange}
      dock={{ open, onOpenChange, disabled }}
    >
      <div className="my-[6px] h-px bg-[#262626]" />

      <div className="flex items-center justify-between gap-2 px-[10px] py-[6px]">
        <span className="body-m text-[#9B9EA3]">Group events by category</span>
        {/* Same markup as the Settings panel's switch. */}
        <button
          type="button"
          role="switch"
          aria-checked={groupByCategory}
          aria-label="Group events by category"
          onClick={() => onGroupByCategoryChange(!groupByCategory)}
          className={`relative inline-flex shrink-0 w-11 h-6 rounded-[50px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
            groupByCategory ? 'bg-[#259E23]' : 'bg-[rgba(37,158,35,0.3)]'
          }`}
        >
          <span
            className="absolute top-1/2 left-0 w-5 h-5 -translate-y-1/2 rounded-full bg-[#F5F5F5] transition-transform"
            style={{ transform: `translate(${groupByCategory ? 22 : 2}px, -50%)` }}
          />
        </button>
      </div>

      {/* Presenting is reading, not editing — the categories editor stays out of reach. */}
      {mode === 'edit' && (
        <>
          <div className="my-[6px] h-px bg-[#262626]" />
          <button
            type="button"
            onClick={onEditCategories}
            className={`${glassButtonClass} flex w-full items-center justify-center gap-1.5`}
          >
            <Pencil size={16} strokeWidth={1.5} />
            Edit categories
          </button>
        </>
      )}
    </CategoryLegend>
  )
}
