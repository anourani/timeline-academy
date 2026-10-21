import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { TimelineEvent, CategoryConfig } from '../../types/event'
import { Trash2, GripVertical, ArrowUp } from 'lucide-react'
import { parseDate, formatDateToString, formatDateDisplay, darkCalendarClassNames } from '@/utils/dateUtils'
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
} from '@/components/ui/dialog'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { glassButtonClass, primaryGlassButtonClass } from '@/components/ui/glassButton'
import { ConfirmationModal } from '@/components/Modal/ConfirmationModal'
import { useIsNarrow } from '@/hooks/useIsNarrow'
import { Calendar } from '@/components/ui/calendar'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type {
  DragEndEvent,
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'

interface EventTableEditorProps {
  isOpen: boolean
  onClose: () => void
  events: TimelineEvent[]
  onEventsChange: (events: TimelineEvent[]) => void
  categories: CategoryConfig[]
  onCategoriesChange: (categories: CategoryConfig[]) => void
  /**
   * Edit/View mode. In view mode this is a reader: the Categories tab is gone,
   * every cell is static, and the only action is Close. Reachable because the
   * dock keeps its Events button while presenting.
   */
  mode?: 'edit' | 'view'
  /** Which tab to open on. The dock legend's "Edit categories" asks for Categories. */
  initialView?: 'events' | 'categories'
  /**
   * AI timelines come from a prompt and are read-only here: events can be
   * viewed but not added, edited or deleted, and categories can be reordered,
   * recoloured and hidden but not renamed, added or deleted.
   */
  aiGenerated?: boolean
}

type PageTab = 'events' | 'categories'

interface SortState {
  key: 'startDate' | 'endDate'
  dir: 'asc' | 'desc'
}

const AI_NO_ADD_EVENT = "Events can't be added to an AI-generated timeline"
const AI_NO_ADD_CATEGORY = "Categories can't be added to an AI-generated timeline"
const AI_NO_DELETE_CATEGORY = "Categories can't be deleted from an AI-generated timeline"
const AI_NO_RENAME_CATEGORY = "Categories can't be renamed on an AI-generated timeline"

const MAX_CATEGORIES = 4
const CATEGORY_LIMIT_REASON = `A timeline can have up to ${MAX_CATEGORIES} categories`
const MAX_EMPTY_ROWS = 10

/** Drag distance past which releasing the grabber dismisses the drawer. Same as `PopupShell`. */
const SWIPE_DISMISS_PX = 80

const DEFAULT_SORT: SortState = { key: 'startDate', dir: 'asc' }
// Session-scoped, like the trial draft: the choice outlives a close and reopen
// but not the tab.
const SORT_STORAGE_KEY = 'timeline_events_sort'

const MONO = "font-['JetBrains_Mono',monospace]"
const HAIRLINE = 'border-[rgba(210,210,210,0.07)]'

// Desktop table columns: # · Title · Start Date · End Date · Category · delete.
// The delete column comes and goes with editability; header and rows share the
// template, so it has to be one decision.
const EVENT_COLS_EDIT = 'grid-cols-[56px_minmax(0,1fr)_150px_150px_220px_44px]'
const EVENT_COLS_READ = 'grid-cols-[56px_minmax(0,1fr)_150px_150px_220px]'
// Categories: drag handle · # · title · color · actions.
const CATEGORY_COLS = 'grid-cols-[28px_56px_minmax(0,1fr)_300px_180px]'

function readStoredSort(): SortState {
  try {
    const raw = sessionStorage.getItem(SORT_STORAGE_KEY)
    if (!raw) return DEFAULT_SORT
    const parsed = JSON.parse(raw) as Partial<SortState>
    if ((parsed.key === 'startDate' || parsed.key === 'endDate') && (parsed.dir === 'asc' || parsed.dir === 'desc')) {
      return { key: parsed.key, dir: parsed.dir }
    }
  } catch {
    // Storage blocked or the value is garbage — the default is fine.
  }
  return DEFAULT_SORT
}

function storeSort(sort: SortState) {
  try {
    sessionStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort))
  } catch {
    // Remembering the sort is a convenience; losing it costs nothing.
  }
}

/** An event with no end date is a single day, so it ends when it starts. */
const endOf = (event: Pick<TimelineEvent, 'startDate' | 'endDate'>) => event.endDate || event.startDate

/** `#RRGGBB` at the given alpha. Category colours are always six-digit hex. */
function tint(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) return hex
  const n = parseInt(match[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/**
 * Explains a disabled button on hover. The title has to sit on a wrapper: the
 * button's own `disabled:pointer-events-none` means it never sees the hover.
 */
function DisabledReason({ reason, children }: { reason?: string; children: React.ReactNode }) {
  if (!reason) return <>{children}</>
  return (
    <span title={reason} className="inline-flex cursor-not-allowed">
      {children}
    </span>
  )
}

interface DraftEvent extends Omit<TimelineEvent, 'id'> {
  id: string
}

// Color palette for categories
const COLOR_PALETTE = [
  { label: 'Blue', value: '#4196E4' },
  { label: 'Purple', value: '#A770EC' },
  { label: 'Red', value: '#E10000' },
  { label: 'Green', value: '#259E23' },
  { label: 'Orange', value: '#FF7D05' },
]

/**
 * The five palette swatches, spread across whatever width they are given.
 * Unselected swatches sit at 64% height and half opacity; the selected one is
 * full height with a 1px ring in its own colour, offset 2px by the row's own
 * background so the gap reads as a cut-out on both visible and hidden rows.
 */
function ColorSwatches({
  category,
  rowBg,
  onColorChange,
  className = '',
}: {
  category: CategoryConfig
  rowBg: string
  onColorChange: (catId: string, color: string) => void
  className?: string
}) {
  return (
    <div className={`flex items-center gap-[8px] ${className}`} role="radiogroup" aria-label={`${category.label} color`}>
      {COLOR_PALETTE.map(color => {
        const isSelected = category.color.toUpperCase() === color.value.toUpperCase()
        return (
          <button
            key={color.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={color.label}
            onClick={() => onColorChange(category.id, color.value)}
            className="group flex-1 h-full flex items-center justify-center cursor-pointer rounded-[6px] outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            <span
              className={`
                block w-full rounded-[6px] transition-all duration-200
                ${isSelected ? 'h-full opacity-100' : 'h-[64%] opacity-50 group-hover:h-[76%] group-hover:opacity-80'}
              `}
              style={{
                backgroundColor: color.value,
                boxShadow: isSelected
                  ? `0 0 0 2px ${rowBg}, 0 0 0 3px ${color.value}`
                  : 'inset 0px 4px 20px rgba(0,0,0,0.25)',
              }}
            />
          </button>
        )
      })}
    </div>
  )
}

interface CategoryRowProps {
  cat: CategoryConfig
  index: number
  eventCount: number
  editingLabel: string
  onLabelChange: (catId: string, value: string) => void
  onLabelBlur: (catId: string) => void
  onColorChange: (catId: string, color: string) => void
  onVisibilityToggle: (catId: string) => void
  onDelete: (catId: string) => void
  canDelete: boolean
  deleteDisabledReason?: string
  labelReadOnly?: boolean
  narrow: boolean
}

// A category's row on the Categories tab: a flat grid row at `sm` and above, a
// card below it. Sortable either way; what differs is what the drag listeners
// sit on — the grip on desktop, the whole card on mobile, where the sensor is
// press-and-hold so a swipe still scrolls the list.
function SortableCategoryRow(props: CategoryRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.cat.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { zIndex: 10, position: 'relative' } : {}),
  }

  return props.narrow ? (
    <CategoryCard {...props} innerRef={setNodeRef} style={style} attributes={attributes} listeners={listeners} isDragging={isDragging} />
  ) : (
    <CategoryGridRow {...props} innerRef={setNodeRef} style={style} attributes={attributes} listeners={listeners} isDragging={isDragging} />
  )
}

interface SortableBits {
  innerRef: (node: HTMLElement | null) => void
  style: React.CSSProperties
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
  isDragging: boolean
}

function CategoryLabelInput({
  cat,
  editingLabel,
  onLabelChange,
  onLabelBlur,
  labelReadOnly,
  className,
}: Pick<CategoryRowProps, 'cat' | 'editingLabel' | 'onLabelChange' | 'onLabelBlur' | 'labelReadOnly'> & { className: string }) {
  return (
    <input
      type="text"
      value={editingLabel}
      onChange={(e) => onLabelChange(cat.id, e.target.value)}
      onBlur={() => onLabelBlur(cat.id)}
      onKeyDown={(e) => {
        // A mobile card carries the drag listeners itself; a keystroke meant
        // for the name must not reach them.
        e.stopPropagation()
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      readOnly={labelReadOnly}
      title={labelReadOnly ? AI_NO_RENAME_CATEGORY : undefined}
      aria-label="Category name"
      className={`
        min-w-0 w-full bg-transparent border-none outline-none rounded-[4px] px-[6px] py-[2px]
        font-['Aleo',serif] font-normal leading-[1.3] text-[#dadee5] truncate
        ${labelReadOnly ? '' : 'hover:bg-[#151617] focus:bg-[#151617]'} transition-colors
        ${className}
      `}
    />
  )
}

function CategoryActions({
  cat,
  onVisibilityToggle,
  onDelete,
  canDelete,
  deleteDisabledReason,
  size,
}: Pick<CategoryRowProps, 'cat' | 'onVisibilityToggle' | 'onDelete' | 'canDelete' | 'deleteDisabledReason'> & { size: 'sm' | 'lg' }) {
  // Mobile touch targets are 44px; the desktop row keeps the glass buttons'
  // natural size.
  const hit = size === 'lg' ? 'h-11' : 'h-[32px]'
  return (
    <div className="flex items-center gap-[8px] shrink-0">
      <button
        type="button"
        onClick={() => onVisibilityToggle(cat.id)}
        aria-pressed={!cat.visible}
        className={`${glassButtonClass} ${hit} min-w-[64px]`}
      >
        {cat.visible ? 'Hide' : 'Show'}
      </button>
      <DisabledReason reason={deleteDisabledReason}>
        <button
          type="button"
          onClick={() => onDelete(cat.id)}
          disabled={!canDelete}
          aria-label={`Delete category ${cat.label}`}
          className={`
            ${hit} ${size === 'lg' ? 'w-11' : 'w-[32px]'} shrink-0 inline-flex items-center justify-center rounded-[10px]
            border border-white/[0.15] text-[#9b9ea3] hover:text-[#dadee5] hover:bg-white/10 transition-colors
            outline-none focus-visible:ring-1 focus-visible:ring-white/40
            disabled:opacity-50 disabled:pointer-events-none
          `}
        >
          <Trash2 size={size === 'lg' ? 16 : 14} />
        </button>
      </DisabledReason>
    </div>
  )
}

function CategoryGridRow(props: CategoryRowProps & SortableBits) {
  const { cat, index, innerRef, style, attributes, listeners, isDragging } = props
  const rowBg = cat.visible ? '#171717' : '#151617'
  const dim = cat.visible ? '' : 'opacity-40'
  return (
    <div
      ref={innerRef}
      style={{ ...style, backgroundColor: rowBg }}
      className={`grid ${CATEGORY_COLS} items-center min-h-[84px] px-8 border-b ${HAIRLINE} ${isDragging ? 'shadow-[0px_12px_40px_rgba(0,0,0,0.6)]' : ''}`}
      {...attributes}
    >
      <div
        className="flex items-center justify-center h-full cursor-grab active:cursor-grabbing"
        aria-hidden
        {...listeners}
      >
        <GripVertical size={16} className="text-[#6b6e73]" />
      </div>
      <div className={`${MONO} text-[12px] text-[#6b6e73] pl-[8px] ${dim}`}>
        {String(index + 1).padStart(2, '0')}
      </div>
      <div className={`flex items-center gap-[12px] min-w-0 pr-6 ${dim}`}>
        <span className="w-[8px] h-[34px] shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
        <CategoryLabelInput {...props} className="text-[22px]" />
      </div>
      <ColorSwatches
        category={cat}
        rowBg={rowBg}
        onColorChange={props.onColorChange}
        className={`h-[56px] w-[300px] ${dim}`}
      />
      <div className="flex justify-end">
        <CategoryActions {...props} size="sm" />
      </div>
    </div>
  )
}

function CategoryCard(props: CategoryRowProps & SortableBits) {
  const { cat, index, eventCount, innerRef, style, attributes, listeners, isDragging } = props
  const rowBg = cat.visible ? '#1c1d1e' : '#151617'
  const dim = cat.visible ? '' : 'opacity-40'
  // The whole card is the handle, so it takes the pointer listeners only: with
  // the keyboard one too, Space or Enter on the card's Hide button would bubble
  // up and pick the card up instead.
  const pointerListeners = Object.fromEntries(
    Object.entries(listeners ?? {}).filter(([name]) => name !== 'onKeyDown'),
  )
  return (
    <div
      ref={innerRef}
      // `manipulation` keeps vertical panning — the list must still scroll —
      // while letting the touch sensor's press-and-hold claim the gesture.
      style={{ ...style, backgroundColor: rowBg, touchAction: 'manipulation' }}
      className={`flex flex-col gap-3 rounded-[14px] p-3 ${isDragging ? 'shadow-[0px_12px_40px_rgba(0,0,0,0.6)]' : ''}`}
      {...attributes}
      {...pointerListeners}
    >
      <div className="flex items-center gap-[10px] min-w-0">
        <span className={`${MONO} text-[12px] text-[#6b6e73] ${dim}`}>{String(index + 1).padStart(2, '0')}</span>
        <span className={`w-[4px] h-[22px] shrink-0 rounded-full ${dim}`} style={{ backgroundColor: cat.color }} />
        <div className={`flex-1 min-w-0 flex flex-col ${dim}`}>
          <CategoryLabelInput {...props} className="text-[20px] -ml-[6px]" />
          <span className={`${MONO} text-[11px] text-[#9b9ea3]`}>
            {eventCount} {eventCount === 1 ? 'event' : 'events'}
          </span>
        </div>
        <CategoryActions {...props} size="lg" />
      </div>
      <ColorSwatches
        category={cat}
        rowBg={rowBg}
        onColorChange={props.onColorChange}
        className={`h-[52px] w-full ${dim}`}
      />
    </div>
  )
}

// Date Picker Cell component
function DatePickerCell({
  value,
  onChange,
  placeholder,
  disabledBefore,
  isEmpty,
  isFilled,
  readOnly = false,
  muted = false,
}: {
  value: string
  onChange: (date: string) => void
  placeholder: string
  disabledBefore?: Date
  isEmpty: boolean
  isFilled: boolean
  readOnly?: boolean
  /** Greyed out — an End Date that only repeats the Start Date. */
  muted?: boolean
}) {
  const [open, setOpen] = useState(false)

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange(formatDateToString(date))
      setOpen(false)
    }
  }

  const cellBg = isEmpty && !isFilled
    ? 'bg-[#151617]'
    : readOnly
      ? 'bg-transparent'
      : 'bg-transparent hover:bg-[#151617]'
  const text = value && !muted ? 'text-[#c9ced4]' : 'text-[#6b6e73]'
  const cellClass = `
    w-full text-left px-[6px] py-[5px] rounded-[4px]
    ${MONO} font-normal text-[13px] leading-[20px]
    ${cellBg} ${text}
  `

  // Read-only drops the Popover entirely rather than disabling the trigger —
  // the calendar has nothing to offer when the value cannot change.
  if (readOnly) {
    return <div className={cellClass}>{value ? formatDateDisplay(value) : '—'}</div>
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${cellClass} cursor-pointer transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40`}
        >
          {value ? formatDateDisplay(value) : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto bg-[#242526] border border-[rgba(210,210,210,0.2)] rounded-lg shadow-md p-0"
        align="start"
      >
        <Calendar
          mode="single"
          selected={parseDate(value)}
          onSelect={handleSelect}
          disabled={disabledBefore ? { before: disabledBefore } : undefined}
          initialFocus
          className="rounded-lg"
          classNames={darkCalendarClassNames}
        />
      </PopoverContent>
    </Popover>
  )
}

/** A sortable column header: a button inside a `columnheader` carrying `aria-sort`. */
function SortHeader({
  label,
  column,
  sort,
  onSort,
  required,
}: {
  label: string
  column: SortState['key']
  sort: SortState
  onSort: (key: SortState['key']) => void
  required?: boolean
}) {
  const active = sort.key === column
  return (
    <div
      role="columnheader"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`
          inline-flex items-center gap-[6px] px-[6px] py-[2px] -ml-[6px] rounded-[4px]
          outline-none focus-visible:ring-1 focus-visible:ring-white/40
          ${active ? 'text-[#dadee5]' : 'text-[#9b9ea3] hover:text-[#c9ced4]'}
        `}
      >
        <span>{label}{required && <span className="text-destructive"> *</span>}</span>
        <ArrowUp
          size={13}
          aria-hidden
          className={`transition-transform ${active ? 'opacity-100' : 'opacity-30'} ${active && sort.dir === 'desc' ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  )
}

/** The two sort pills that stand in for the column headers below `sm`. */
function SortPill({
  label,
  column,
  sort,
  onSort,
}: {
  label: string
  column: SortState['key']
  sort: SortState
  onSort: (key: SortState['key']) => void
}) {
  const active = sort.key === column
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-pressed={active}
      aria-label={`Sort by ${label} date${active ? (sort.dir === 'asc' ? ', oldest first' : ', newest first') : ''}`}
      className={`
        relative h-9 shrink-0 inline-flex items-center gap-[6px] px-3 rounded-full
        before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']
        font-['Avenir',sans-serif] text-[14px] border transition-colors
        outline-none focus-visible:ring-1 focus-visible:ring-white/40
        ${active
          ? 'bg-[rgba(37,99,235,0.4)] border-transparent text-[#dadee5]'
          : 'border-white/[0.12] text-[#9b9ea3]'
        }
      `}
    >
      {label}
      <ArrowUp
        size={13}
        aria-hidden
        className={`${active ? 'opacity-100' : 'opacity-30'} ${active && sort.dir === 'desc' ? 'rotate-180' : ''}`}
      />
    </button>
  )
}

/** The category chip row's chips, including "All". */
function FilterChip({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string
  count: number
  color?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`
        relative h-10 shrink-0 inline-flex items-center gap-[8px] px-3 rounded-[10px] whitespace-nowrap
        before:absolute before:-inset-y-[2px] before:inset-x-0 before:content-['']
        font-['Avenir',sans-serif] font-medium text-[14px] border transition-colors
        outline-none focus-visible:ring-1 focus-visible:ring-white/40
        ${active
          ? 'bg-[rgba(37,99,235,0.4)] border-transparent text-[#dadee5]'
          : 'border-white/[0.12] text-[#c9ced4] hover:bg-white/[0.06] hover:text-[#dadee5]'
        }
      `}
    >
      {color && <span className="w-[4px] h-[14px] rounded-full shrink-0" style={{ backgroundColor: color }} />}
      <span>{label}</span>
      <span className={`${MONO} text-[12px] ${active ? 'text-[#c9ced4]' : 'text-[#6b6e73]'}`}>{count}</span>
    </button>
  )
}

export function EventTableEditor({
  isOpen,
  onClose,
  events,
  onEventsChange,
  categories,
  onCategoriesChange,
  mode = 'edit',
  initialView = 'events',
  aiGenerated = false,
}: EventTableEditorProps) {
  const isEditing = mode === 'edit'
  // The one thing the `sm:` breakpoint cannot express: dnd-kit's sensors are
  // props, not classes — and so is whether the event rows are editable at all.
  const isNarrow = useIsNarrow()
  // The event rows are a reader in view mode, on AI timelines, and on phones.
  // Only the rows: an AI timeline and a phone still have the Categories tab
  // and its Save.
  const eventsReadOnly = !isEditing || aiGenerated || isNarrow
  const [activePageTab, setActivePageTab] = useState<PageTab>('events')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [emptyRows, setEmptyRows] = useState<DraftEvent[]>([])
  const [draftEvents, setDraftEvents] = useState<TimelineEvent[]>(events)
  const [draftCategories, setDraftCategories] = useState<CategoryConfig[]>(categories)
  const [hasChanges, setHasChanges] = useState(false)
  const [sort, setSort] = useState<SortState>(readStoredSort)
  // The title of the row being typed in, as it was when the input took focus.
  // The comparator reads this instead of the live title, so a row whose order
  // turns on its title does not jump on every keystroke; it re-sorts on blur.
  const [frozenTitle, setFrozenTitle] = useState<{ id: string; title: string } | null>(null)
  const [dragY, setDragY] = useState(0)
  const [grabbing, setGrabbing] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const dragStartRef = useRef(0)
  const tabRefs = useRef<Partial<Record<PageTab, HTMLButtonElement | null>>>({})

  const tabs: PageTab[] = isEditing ? ['events', 'categories'] : ['events']

  React.useEffect(() => {
    if (isOpen) {
      setDraftEvents(events)
      setDraftCategories(categories)
      setEmptyRows([])
      setHasChanges(false)
      setActiveCategory(null)
      setFrozenTitle(null)
      setDragY(0)
      // The Categories tab doesn't exist in view mode.
      setActivePageTab(isEditing ? initialView : 'events')
    }
  }, [isOpen, events, categories, isEditing, initialView])

  const categoryById = useMemo(
    () => new Map(draftCategories.map(c => [c.id, c])),
    [draftCategories],
  )

  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const event of draftEvents) counts.set(event.category, (counts.get(event.category) ?? 0) + 1)
    return counts
  }, [draftEvents])

  // Filter, then sort, then the blank rows — which stay at the bottom whatever
  // the sort until they are valid. Display only: `draftEvents` keeps its
  // stored order, and so does what Save hands back.
  const sortedEvents = useMemo(() => {
    const filtered = activeCategory
      ? draftEvents.filter(event => event.category === activeCategory)
      : draftEvents
    const titleOf = (e: TimelineEvent) => (frozenTitle?.id === e.id ? frozenTitle.title : e.title)
    const dateOf = (e: TimelineEvent, key: SortState['key']) => (key === 'startDate' ? e.startDate : endOf(e)) || ''
    const other: SortState['key'] = sort.key === 'startDate' ? 'endDate' : 'startDate'
    const dir = sort.dir === 'asc' ? 1 : -1
    // YYYY-MM-DD with a four-digit year (`formatYMD`) orders correctly as a string.
    const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
    return [...filtered].sort((a, b) =>
      dir * (cmp(dateOf(a, sort.key), dateOf(b, sort.key)) || cmp(dateOf(a, other), dateOf(b, other)))
      || titleOf(a).localeCompare(titleOf(b))
    )
  }, [draftEvents, activeCategory, sort, frozenTitle])

  const displayEvents = useMemo(
    () => [...sortedEvents, ...emptyRows],
    [sortedEvents, emptyRows],
  )

  // Two digits, three once there are more than 99 events, so the column never
  // changes width mid-scroll.
  const rowNumberWidth = draftEvents.length > 99 ? 3 : 2

  const handleSort = (key: SortState['key']) => {
    setSort(prev => {
      const next: SortState = prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
      storeSort(next)
      return next
    })
  }

  const isValidEvent = (event: DraftEvent | TimelineEvent) => {
    return Boolean(event.title.trim() && event.startDate && event.category)
  }

  const toEvent = (row: DraftEvent): TimelineEvent => ({
    id: row.id,
    title: row.title,
    startDate: row.startDate,
    endDate: row.endDate || row.startDate,
    category: row.category,
  })

  const canApplyChanges = useMemo(() => {
    if (!hasChanges) return false
    const allEventsValid = draftEvents.every(isValidEvent)
    const allEmptyRowsValid = emptyRows.every(row => {
      const hasAnyField = Boolean(row.title.trim() || row.startDate || row.category)
      return hasAnyField ? isValidEvent(row) : true
    })
    const allCategoriesValid = draftCategories.every(c => c.label.trim())
    return allEventsValid && allEmptyRowsValid && allCategoriesValid
  }, [draftEvents, draftCategories, emptyRows, hasChanges])

  const handleDeleteEvent = (eventId: string) => {
    setDraftEvents(draftEvents.filter(event => event.id !== eventId))
    setHasChanges(true)
  }

  /**
   * Applies a change to a row. `commit` marks the moment a blank row may join
   * the table — a date or category pick, or leaving the title — rather than
   * the keystroke that happened to complete it, which would move the row out
   * from under the cursor. A promoted row keeps its id, so its React key and
   * focus survive the move.
   */
  const handleEventChange = (id: string, changes: Partial<TimelineEvent>, commit = true) => {
    const emptyRow = emptyRows.find(row => row.id === id)
    if (emptyRow) {
      const updatedRow = { ...emptyRow, ...changes }
      if (commit && isValidEvent(updatedRow)) {
        setDraftEvents(prev => [...prev, toEvent(updatedRow)])
        setEmptyRows(rows => rows.filter(row => row.id !== id))
      } else {
        setEmptyRows(rows => rows.map(row => row.id === id ? updatedRow : row))
      }
    } else {
      setDraftEvents(draftEvents.map(evt => evt.id === id ? { ...evt, ...changes } : evt))
    }
    setHasChanges(true)
  }

  const handleTitleBlur = (id: string) => {
    setFrozenTitle(null)
    const emptyRow = emptyRows.find(row => row.id === id)
    if (emptyRow && isValidEvent(emptyRow)) handleEventChange(id, {}, true)
  }

  const handleAddRow = () => {
    if (emptyRows.length < MAX_EMPTY_ROWS) {
      setEmptyRows(rows => [...rows, {
        id: crypto.randomUUID(), title: '', startDate: '', endDate: '', category: ''
      }])
    }
  }

  const handleDeleteEmptyRow = (rowId: string) => {
    setEmptyRows(rows => rows.filter(row => row.id !== rowId))
  }

  const handleApplyChanges = () => {
    if (!canApplyChanges) return
    // A valid blank row that was never committed (no blur reached it) still
    // counts. Untouched blank rows are dropped, as they always were.
    onEventsChange([...draftEvents, ...emptyRows.filter(isValidEvent).map(toEvent)])
    onCategoriesChange(draftCategories)
    onClose()
  }

  // Drag-to-reorder sensors. Above `sm` a 5px pointer drag on the grip starts
  // a reorder. Below it the whole card is the handle and a swipe must still
  // scroll the list, so the gesture is press-and-hold instead — touch for
  // phones, mouse for a narrowed desktop window.
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  const mouseHoldSensor = useSensor(MouseSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  const sensors = useSensors(
    ...(isNarrow ? [touchSensor, mouseHoldSensor] : [pointerSensor]),
    keyboardSensor,
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = draftCategories.findIndex(c => c.id === active.id)
      const newIndex = draftCategories.findIndex(c => c.id === over.id)
      const reordered = arrayMove(draftCategories, oldIndex, newIndex)
      setDraftCategories(reordered)
      setHasChanges(true)
    }
  }

  // Category management state and handlers
  const [editingLabels, setEditingLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    setEditingLabels(draftCategories.reduce((acc, cat) => ({ ...acc, [cat.id]: cat.label }), {} as Record<string, string>))
  }, [draftCategories])

  const handleCategoryLabelChange = useCallback((catId: string, value: string) => {
    setEditingLabels(prev => ({ ...prev, [catId]: value }))
  }, [])

  const handleCategoryLabelBlur = useCallback((catId: string) => {
    const trimmed = (editingLabels[catId] || '').trim()
    if (!trimmed) {
      const cat = draftCategories.find(c => c.id === catId)
      if (cat) setEditingLabels(prev => ({ ...prev, [catId]: cat.label }))
      return
    }
    const isDuplicate = draftCategories.some(c => c.id !== catId && c.label.toLowerCase() === trimmed.toLowerCase())
    if (isDuplicate) {
      const cat = draftCategories.find(c => c.id === catId)
      if (cat) setEditingLabels(prev => ({ ...prev, [catId]: cat.label }))
      return
    }
    // Blurring an unchanged name is not an edit.
    if (draftCategories.find(c => c.id === catId)?.label === trimmed) return
    setDraftCategories(draftCategories.map(c => c.id === catId ? { ...c, label: trimmed } : c))
    setHasChanges(true)
  }, [draftCategories, editingLabels])

  const handleCategoryColorChange = useCallback((catId: string, color: string) => {
    setDraftCategories(draftCategories.map(c => c.id === catId ? { ...c, color } : c))
    setHasChanges(true)
  }, [draftCategories])

  const handleCategoryVisibilityToggle = useCallback((catId: string) => {
    setDraftCategories(draftCategories.map(c => c.id === catId ? { ...c, visible: !c.visible } : c))
    setHasChanges(true)
  }, [draftCategories])

  const handleCategoryDelete = useCallback((catId: string) => {
    if (draftCategories.length <= 1) return
    setDraftCategories(draftCategories.filter(c => c.id !== catId))
    // A filter on a category that no longer exists would show an empty table
    // with no chip left to clear it.
    setActiveCategory(prev => (prev === catId ? null : prev))
    setHasChanges(true)
  }, [draftCategories])

  const handleAddCategory = useCallback(() => {
    if (draftCategories.length >= MAX_CATEGORIES) return
    let uniqueName = 'New Category'
    let counter = 1
    while (draftCategories.some(c => c.label.toLowerCase() === uniqueName.toLowerCase())) {
      uniqueName = `New Category ${counter}`
      counter++
    }
    const newCat: CategoryConfig = {
      id: uniqueName.toLowerCase().replace(/\s+/g, '_') as CategoryConfig['id'],
      label: uniqueName,
      color: COLOR_PALETTE[draftCategories.length % COLOR_PALETTE.length].value,
      visible: true,
    }
    setDraftCategories([...draftCategories, newCat])
    setEditingLabels(prev => ({ ...prev, [newCat.id]: newCat.label }))
    setHasChanges(true)
  }, [draftCategories])

  const isEmptyRow = (id: string) => emptyRows.some(row => row.id === id)

  const isFieldFilled = (event: DraftEvent | TimelineEvent, field: string) => {
    switch (field) {
      case 'title': return Boolean(event.title.trim())
      case 'startDate': return Boolean(event.startDate)
      case 'endDate': return Boolean(event.endDate)
      case 'category': return Boolean(event.category)
      default: return false
    }
  }

  // ── Tabs ────────────────────────────────────────────────────────────────

  const selectTab = (tab: PageTab) => {
    setActivePageTab(tab)
    tabRefs.current[tab]?.focus()
  }

  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    const index = tabs.indexOf(activePageTab)
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next === null) return
    e.preventDefault()
    selectTab(tabs[next])
  }

  const eventsCountLabel = activeCategory
    ? `${sortedEvents.length} of ${draftEvents.length}`
    : `${draftEvents.length} ${draftEvents.length === 1 ? 'event' : 'events'}`
  const categoriesCountLabel = `${draftCategories.length} of ${MAX_CATEGORIES}`

  // ── Grabber: drag down to dismiss ────────────────────────────────────────
  // Same pointer-capture recipe as `PopupShell`'s sheet. A drawer holding
  // unsaved edits springs back and asks before discarding them; Esc, the
  // overlay and Cancel still discard without asking, as they always have.

  const onGrabberDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = e.clientY
    setGrabbing(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onGrabberMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!grabbing) return
    setDragY(Math.max(0, e.clientY - dragStartRef.current))
  }
  const onGrabberUp = () => {
    if (!grabbing) return
    setGrabbing(false)
    const dismissed = dragY > SWIPE_DISMISS_PX
    if (dismissed && !hasChanges) {
      onClose()
      return
    }
    setDragY(0)
    if (dismissed) setConfirmDiscard(true)
  }

  // ── Header actions ──────────────────────────────────────────────────────

  const atCategoryLimit = draftCategories.length >= MAX_CATEGORIES
  const addCategoryReason = aiGenerated ? AI_NO_ADD_CATEGORY : atCategoryLimit ? CATEGORY_LIMIT_REASON : undefined

  // Disabling Add Event is also what keeps AI timelines free of blank entry
  // rows — they only ever come from this button. Phones never see it: events
  // are read-only there.
  const addButton = !isEditing ? null : activePageTab === 'events' ? (
    <DisabledReason reason={aiGenerated ? AI_NO_ADD_EVENT : undefined}>
      <button
        type="button"
        onClick={handleAddRow}
        disabled={aiGenerated || emptyRows.length >= MAX_EMPTY_ROWS}
        className={`${glassButtonClass} disabled:opacity-50 disabled:pointer-events-none`}
      >
        + Add Event
      </button>
    </DisabledReason>
  ) : (
    <DisabledReason reason={addCategoryReason}>
      <button
        type="button"
        onClick={handleAddCategory}
        disabled={Boolean(addCategoryReason)}
        className={`${glassButtonClass} disabled:opacity-50 disabled:pointer-events-none`}
      >
        + Add Category
      </button>
    </DisabledReason>
  )

  const cancelButton = (
    <button type="button" onClick={onClose} className={`${glassButtonClass} max-sm:h-11`}>
      {isEditing ? 'Cancel' : 'Close'}
    </button>
  )

  const saveButton = isEditing && (
    <button
      type="button"
      onClick={handleApplyChanges}
      disabled={!canApplyChanges}
      className={`${primaryGlassButtonClass} max-sm:h-11 disabled:opacity-50 disabled:pointer-events-none`}
    >
      Save
    </button>
  )

  // ── Render ──────────────────────────────────────────────────────────────

  const eventCols = eventsReadOnly ? EVENT_COLS_READ : EVENT_COLS_EDIT

  const renderDesktopRow = (event: TimelineEvent | DraftEvent, index: number) => {
    const empty = isEmptyRow(event.id)
    const category = categoryById.get(event.category)
    const hidden = category ? !category.visible : false
    const sameDay = Boolean(event.startDate) && endOf(event) === event.startDate

    return (
      <div
        key={event.id}
        role="row"
        className={`grid ${eventCols} items-center min-h-[52px] border-b ${HAIRLINE} hover:bg-white/[0.03] transition-colors ${hidden ? 'opacity-40' : ''}`}
      >
        {/* Row number — position in the sorted, filtered list. Blank rows
            have no position yet. */}
        <div role="cell" className={`${MONO} text-[12px] text-[#6b6e73] pl-[8px]`}>
          {empty ? '' : String(index + 1).padStart(rowNumberWidth, '0')}
        </div>

        {/* Title */}
        <div role="cell" className="flex items-center gap-[10px] min-w-0 pr-4">
          <span
            className="w-[4px] h-[22px] shrink-0 rounded-full"
            style={{ backgroundColor: category?.color ?? '#3D3E40' }}
          />
          <input
            type="text"
            value={event.title}
            onChange={(e) => handleEventChange(event.id, { title: e.target.value }, false)}
            onFocus={() => setFrozenTitle({ id: event.id, title: event.title })}
            onBlur={() => handleTitleBlur(event.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            placeholder="Event title"
            autoComplete="off"
            aria-label="Event title"
            readOnly={eventsReadOnly}
            // Stays an <input> when read-only so the text is still selectable
            // and the column widths do not shift; only the hover/focus fills
            // go, since those are what read as "editable".
            className={`
              min-w-0 w-full px-[6px] py-[5px] rounded-[4px] border-none outline-none truncate
              font-['Avenir',sans-serif] font-normal text-[15px] leading-[22px] text-[#dadee5]
              placeholder:text-[#6b6e73]
              ${empty && !isFieldFilled(event, 'title')
                ? 'bg-[#151617]'
                : !eventsReadOnly
                  ? 'bg-transparent hover:bg-[#151617] focus:bg-[#151617]'
                  : 'bg-transparent'
              }
              transition-colors
            `}
          />
        </div>

        {/* Start Date */}
        <div role="cell" className="pr-4">
          <DatePickerCell
            value={event.startDate}
            onChange={(date) => {
              handleEventChange(event.id, {
                startDate: date,
                endDate: event.endDate && event.endDate < date ? date : event.endDate,
              })
            }}
            placeholder="Pick a date"
            isEmpty={empty}
            isFilled={isFieldFilled(event, 'startDate')}
            readOnly={eventsReadOnly}
          />
        </div>

        {/* End Date — greyed when it only repeats the start. */}
        <div role="cell" className="pr-4">
          <DatePickerCell
            value={event.endDate}
            onChange={(date) => handleEventChange(event.id, { endDate: date })}
            placeholder="Pick a date"
            disabledBefore={parseDate(event.startDate)}
            isEmpty={empty}
            isFilled={isFieldFilled(event, 'endDate')}
            readOnly={eventsReadOnly}
            muted={sameDay}
          />
        </div>

        {/* Category — a pill in the category's colour, still the Select trigger. */}
        <div role="cell" className="min-w-0 pr-2">
          {eventsReadOnly ? (
            <span
              className="inline-flex max-w-full items-center h-[28px] px-[10px] rounded-full font-['Avenir',sans-serif] text-[14px] text-[#dadee5]"
              style={{ backgroundColor: category ? tint(category.color, 0.18) : undefined }}
            >
              <span className="truncate">{category?.label ?? '—'}</span>
            </span>
          ) : (
            <Select
              value={event.category || undefined}
              onValueChange={(value) => handleEventChange(event.id, { category: value })}
            >
              <SelectTrigger
                style={{ backgroundColor: category ? tint(category.color, 0.18) : undefined }}
                className={`
                  w-auto max-w-full h-[28px] gap-[6px] border-none shadow-none px-[10px] rounded-full
                  font-['Avenir',sans-serif] font-normal text-[14px] text-[#dadee5]
                  ${category ? 'hover:brightness-125' : 'bg-[#151617]'}
                  focus:ring-1 focus:ring-white/40 transition-[filter]
                  [&>span[data-placeholder]]:text-[#6b6e73]
                `}
              >
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent className="bg-[#242526] border border-[rgba(210,210,210,0.2)] rounded-lg">
                {draftCategories.map(cat => (
                  <SelectItem
                    key={cat.id}
                    value={cat.id}
                    className="text-[#c9ced4] font-['Avenir',sans-serif] text-[14px] hover:bg-[#151617] focus:bg-[#151617] focus:text-[#c9ced4]"
                  >
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Delete */}
        {!eventsReadOnly && (
          <div role="cell" className="flex justify-center">
            <button
              type="button"
              onClick={() => empty
                ? handleDeleteEmptyRow(event.id)
                : handleDeleteEvent(event.id)
              }
              aria-label={event.title ? `Delete ${event.title}` : 'Delete row'}
              className="p-1 text-[#9b9ea3] hover:text-[#dadee5] transition-colors rounded outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>
    )
  }

  // Below `sm` the table is a list to read: number · colour bar · a stack of
  // title, dates and category. Nothing in it is editable.
  const renderMobileRow = (event: TimelineEvent, index: number) => {
    const category = categoryById.get(event.category)
    const hidden = category ? !category.visible : false
    const end = endOf(event)
    const dates = end && end !== event.startDate
      ? `${formatDateDisplay(event.startDate)} → ${formatDateDisplay(end)}`
      : formatDateDisplay(event.startDate)

    return (
      <li
        key={event.id}
        className={`grid grid-cols-[28px_4px_minmax(0,1fr)] gap-x-[12px] items-stretch py-3 border-b ${HAIRLINE} ${hidden ? 'opacity-40' : ''}`}
      >
        <span className={`${MONO} text-[12px] leading-[22px] text-[#6b6e73]`}>
          {String(index + 1).padStart(rowNumberWidth, '0')}
        </span>
        <span className="w-[4px] rounded-full" style={{ backgroundColor: category?.color ?? '#3D3E40' }} />
        <div className="flex flex-col gap-[2px] min-w-0">
          <span className="font-['Avenir',sans-serif] text-[15px] leading-[22px] text-[#dadee5] break-words">{event.title}</span>
          <span className={`${MONO} text-[12px] text-[#9b9ea3]`}>{dates}</span>
          <span className="font-['Avenir',sans-serif] text-[12px] text-[#9b9ea3]">{category?.label ?? '—'}</span>
        </div>
      </li>
    )
  }

  const eventsPanel = (
    <div className="flex flex-col h-full min-h-0">
      {/* Category filter — All, then one chip per category in category order,
          then the way across to the Categories tab. */}
      <div className="flex items-center gap-[8px] px-4 sm:px-8 py-3 overflow-x-auto overflow-y-hidden shrink-0">
        <FilterChip
          label="All"
          count={draftEvents.length}
          active={activeCategory === null}
          onClick={() => setActiveCategory(null)}
        />
        {draftCategories.map(cat => (
          <FilterChip
            key={cat.id}
            label={cat.label}
            count={eventCounts.get(cat.id) ?? 0}
            color={cat.color}
            active={activeCategory === cat.id}
            onClick={() => setActiveCategory(cat.id)}
          />
        ))}
        {isEditing && (
          <button
            type="button"
            onClick={() => selectTab('categories')}
            className={`
              relative h-10 shrink-0 inline-flex items-center px-3 rounded-[10px] whitespace-nowrap
              before:absolute before:-inset-y-[2px] before:inset-x-0 before:content-['']
              border border-dashed border-white/[0.2] text-[#9b9ea3] hover:text-[#dadee5] hover:border-white/[0.35]
              font-['Avenir',sans-serif] font-medium text-[14px] transition-colors
              outline-none focus-visible:ring-1 focus-visible:ring-white/40
            `}
          >
            <span className="sm:hidden">Edit →</span>
            <span className="hidden sm:inline">Edit categories →</span>
          </button>
        )}
      </div>

      {/* Mobile sort — the column headers' job, as two pills. */}
      <div className="sm:hidden flex items-center gap-[8px] px-4 pb-3 shrink-0">
        <span className={`${MONO} text-[11px] text-[#6b6e73] mr-1`}>Sort</span>
        <SortPill label="Start" column="startDate" sort={sort} onSort={handleSort} />
        <SortPill label="End" column="endDate" sort={sort} onSort={handleSort} />
      </div>

      {isNarrow ? (
        <ol className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 border-t border-[rgba(210,210,210,0.12)]">
          {sortedEvents.map(renderMobileRow)}
          {sortedEvents.length === 0 && (
            <li className="py-8 text-center font-['Avenir',sans-serif] text-[14px] text-[#6b6e73]">No events</li>
          )}
        </ol>
      ) : (
        <div role="table" aria-label="Events" className="flex-1 min-h-0 flex flex-col">
          {/* Column headers — outside the scroller, so they stay put. */}
          <div role="rowgroup" className="px-8 shrink-0">
            <div
              role="row"
              className={`grid ${eventCols} items-center h-[36px] border-y border-[rgba(210,210,210,0.12)] ${MONO} font-light text-[12px] text-[#9b9ea3]`}
            >
              <div role="columnheader" className="pl-[8px]">#</div>
              <div role="columnheader" className="pl-[20px]">
                Title {!eventsReadOnly && <span className="text-destructive">*</span>}
              </div>
              <SortHeader label="Start Date" column="startDate" sort={sort} onSort={handleSort} required={!eventsReadOnly} />
              <SortHeader label="End Date" column="endDate" sort={sort} onSort={handleSort} />
              <div role="columnheader">
                Category {!eventsReadOnly && <span className="text-destructive">*</span>}
              </div>
              {!eventsReadOnly && <div role="columnheader" aria-label="Delete" />}
            </div>
          </div>

          <div role="rowgroup" className="flex-1 min-h-0 overflow-y-auto px-8 pb-8">
            {displayEvents.map(renderDesktopRow)}
            {displayEvents.length === 0 && (
              <div className="py-10 text-center font-['Avenir',sans-serif] text-[14px] text-[#6b6e73]">
                {activeCategory ? 'No events in this category' : 'No events yet'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )

  const categoryRows = draftCategories.map((cat, index) => (
    <SortableCategoryRow
      key={cat.id}
      cat={cat}
      index={index}
      eventCount={eventCounts.get(cat.id) ?? 0}
      editingLabel={editingLabels[cat.id] || ''}
      onLabelChange={handleCategoryLabelChange}
      onLabelBlur={handleCategoryLabelBlur}
      onColorChange={handleCategoryColorChange}
      onVisibilityToggle={handleCategoryVisibilityToggle}
      onDelete={handleCategoryDelete}
      canDelete={!aiGenerated && draftCategories.length > 1}
      deleteDisabledReason={aiGenerated ? AI_NO_DELETE_CATEGORY : undefined}
      labelReadOnly={aiGenerated}
      narrow={isNarrow}
    />
  ))

  const categoriesPanel = (
    <div className="flex flex-col h-full min-h-0">
      {isNarrow ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-6 flex flex-col gap-3">
          <p className="m-0 font-['Avenir',sans-serif] text-[13px] leading-[18px] text-[#9b9ea3]">
            Categories are the rows of your timeline. Press and hold to reorder.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext items={draftCategories.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">{categoryRows}</div>
            </SortableContext>
          </DndContext>
          <DisabledReason reason={addCategoryReason}>
            <button
              type="button"
              onClick={handleAddCategory}
              disabled={Boolean(addCategoryReason)}
              className={`
                w-full h-11 rounded-[14px] border border-dashed border-white/[0.2]
                font-['Avenir',sans-serif] font-medium text-[14px] text-[#c9ced4]
                disabled:opacity-50 disabled:pointer-events-none
              `}
            >
              Add Category · {categoriesCountLabel} used
            </button>
          </DisabledReason>
        </div>
      ) : (
        <>
          <div
            className={`grid ${CATEGORY_COLS} items-center h-[36px] mx-0 px-8 border-y border-[rgba(210,210,210,0.12)] ${MONO} font-light text-[12px] text-[#9b9ea3] shrink-0`}
          >
            <span aria-hidden />
            <span className="pl-[8px]">#</span>
            <span className="pl-[26px]">Category Title</span>
            <span>Color</span>
            <span />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pb-8">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            >
              <SortableContext items={draftCategories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <div>{categoryRows}</div>
              </SortableContext>
            </DndContext>
            <p className={`m-0 pl-[124px] pt-3 ${MONO} text-[11px] text-[#6b6e73]`}>
              {draftCategories.length} of {MAX_CATEGORIES} categories used
            </p>
          </div>
        </>
      )}
    </div>
  )

  const tabList = (
    <div
      role="tablist"
      aria-label="Editor sections"
      onKeyDown={handleTabKeyDown}
      className="flex items-end gap-6 min-w-0"
    >
      {tabs.map(tab => {
        const active = activePageTab === tab
        return (
          <button
            key={tab}
            ref={(node) => { tabRefs.current[tab] = node }}
            type="button"
            role="tab"
            id={`event-editor-tab-${tab}`}
            aria-selected={active}
            aria-controls={`event-editor-panel-${tab}`}
            tabIndex={active ? 0 : -1}
            onClick={() => setActivePageTab(tab)}
            className={`
              relative flex items-baseline gap-[8px] pb-3 pt-1 rounded-[4px]
              outline-none focus-visible:ring-1 focus-visible:ring-white/40
              ${active ? 'text-[#dadee5]' : 'text-[#6b6e73] hover:text-[#9b9ea3]'} transition-colors
            `}
          >
            <span className="font-['Aleo',serif] font-normal text-[22px] sm:text-[28px] leading-[1.2]">
              {tab === 'events' ? 'Events' : 'Categories'}
            </span>
            <span className={`${MONO} text-[12px] ${active ? 'text-[#9b9ea3]' : 'text-[#6b6e73]'}`}>
              {tab === 'events' ? eventsCountLabel : categoriesCountLabel}
            </span>
            {active && <span className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full bg-[#2563eb]" />}
          </button>
        )
      })}
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogPortal>
        <DialogOverlay />
        {/*
          A bottom drawer at every breakpoint: full width, 95% of the dynamic
          viewport, so the top sliver of the timeline stays visible above it.
          Reduced motion keeps the fade and zeroes the slide. The guards carry
          the same `data-[state=…]` selector as the utilities they cancel, or
          they lose on specificity — see
          `docs/2026-09-19-mobile-bottom-drawers-plan.md` §8.
        */}
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Focus starts on the active tab rather than Radix's first
            // focusable, which below `sm` would be Cancel.
            e.preventDefault()
            tabRefs.current[activePageTab]?.focus()
          }}
          style={{
            transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
            transition: grabbing ? undefined : 'transform 200ms ease-out',
          }}
          className="
            fixed z-50 inset-x-0 bottom-0 h-[95dvh] w-screen max-w-none
            flex flex-col overflow-hidden outline-none
            rounded-t-[20px] border-t border-[rgba(210,210,210,0.2)] bg-[#171717]
            shadow-[0_-8px_32px_rgba(0,0,0,0.4)] duration-200 ease-out
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0
            data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom
            motion-reduce:data-[state=open]:slide-in-from-bottom-0 motion-reduce:data-[state=closed]:slide-out-to-bottom-0
          "
        >
          <DialogPrimitive.Title className="sr-only">
            {activePageTab === 'categories' ? 'Categories' : 'Events'}
          </DialogPrimitive.Title>

          {/* Grabber. Its padded row is the drag target; `touch-none` so the
              drag is not taken for a scroll. */}
          <div
            className="flex shrink-0 justify-center pt-[10px] pb-[6px] touch-none cursor-grab active:cursor-grabbing"
            onPointerDown={onGrabberDown}
            onPointerMove={onGrabberMove}
            onPointerUp={onGrabberUp}
            onPointerCancel={onGrabberUp}
            aria-hidden
          >
            <div className="h-1 w-10 rounded-full bg-[#3D3E40]" />
          </div>

          {/* Mobile: Cancel top-left, Save top-right, tabs underneath. */}
          <div className="sm:hidden flex items-center justify-between px-4 pb-2 shrink-0">
            {cancelButton}
            {saveButton}
          </div>

          {/* Header: tabs on the left, actions on the right. */}
          <div className="flex items-end justify-between gap-4 px-4 sm:px-8 border-b border-[rgba(210,210,210,0.2)] shrink-0">
            {tabList}
            <div className="hidden sm:flex items-center gap-[10px] pb-3">
              {addButton}
              {addButton && <span className="w-px h-5 bg-white/[0.15] mx-1" aria-hidden />}
              {cancelButton}
              {saveButton}
            </div>
          </div>

          {/* Tab body */}
          <div
            role="tabpanel"
            id={`event-editor-panel-${activePageTab}`}
            aria-labelledby={`event-editor-tab-${activePageTab}`}
            className="flex-1 min-h-0"
          >
            {!isEditing || activePageTab === 'events' ? eventsPanel : categoriesPanel}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>

      <ConfirmationModal
        isOpen={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={onClose}
        title="Discard changes?"
        message="Your edits to these events and categories haven't been saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
      />
    </Dialog>
  )
}
