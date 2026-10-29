import { Pencil } from 'lucide-react'
import { CategoryLegend } from '@/components/Navigation/CategoryLegend'
import { glassButtonClass } from '@/components/ui/glassButton'
import type { CategoryConfig, TimelineEvent } from '@/types/event'

export interface DockLegendProps {
  categories: CategoryConfig[]
  events: TimelineEvent[]
  onCategoriesChange: (categories: CategoryConfig[]) => void
  /** Opens the events drawer on its Categories tab. Edit mode only. */
  onEditCategories: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'edit' | 'view'
  disabled?: boolean
  /** Below `md` the footer shows icons only — here, the category dots. */
  iconOnly?: boolean
  triggerClassName?: string
}

/**
 * The category legend as it sits in the dock on AI timelines: the nav
 * legend's rows, plus a way into the categories editor.
 *
 * Category visibility is `CategoryConfig.visible` as everywhere else, and
 * persists with the timeline, in present mode too. The grouping switch that
 * used to sit here moved to the Design menu, its one home.
 */
export function DockLegend({
  categories,
  events,
  onCategoriesChange,
  onEditCategories,
  open,
  onOpenChange,
  mode,
  disabled = false,
  iconOnly = false,
  triggerClassName,
}: DockLegendProps) {
  return (
    <CategoryLegend
      categories={categories}
      events={events}
      onCategoriesChange={onCategoriesChange}
      dock={{ open, onOpenChange, disabled, iconOnly, className: triggerClassName }}
    >
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
