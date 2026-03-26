import React, { useState, useMemo } from 'react'
import { TimelineEvent, CategoryConfig } from '../../types/event'
import { Trash2, GripVertical } from 'lucide-react'
import { format } from 'date-fns'
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
import { Calendar } from '@/components/ui/calendar'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
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
}

interface DraftEvent extends Omit<TimelineEvent, 'id'> {
  id: string
}

// Date conversion helpers
const parseDate = (dateStr: string): Date | undefined => {
  if (!dateStr) return undefined
  return new Date(dateStr + 'T00:00:00')
}

const formatDateToString = (date: Date): string => {
  return format(date, 'yyyy-MM-dd')
}

const formatDateDisplay = (dateStr: string): string => {
  if (!dateStr) return ''
  const date = parseDate(dateStr)
  if (!date) return ''
  return format(date, 'MM/dd/yyyy')
}

// Sortable Tab component
function SortableTab({
  category,
  isActive,
  onClick,
}: {
  category: CategoryConfig
  isActive: boolean
  onClick: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { scale: '1.02', zIndex: 10 } : {}),
  }

  return (
    <button
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`
        group relative flex items-center justify-between w-full py-[9px] pl-[11px] pr-[3px] rounded-[10px]
        backdrop-blur-[12px] text-left
        font-['Avenir',sans-serif] font-medium text-[14px] leading-[20px] transition-all
        ${isActive
          ? 'border border-transparent bg-[rgba(37,99,235,0.4)] text-[#dadee5]'
          : 'border border-transparent bg-transparent text-[#c9ced4] hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.1)] hover:text-[#dadee5]'
        }
        ${isDragging ? 'shadow-[0px_12px_40px_rgba(0,0,0,0.6)]' : ''}
      `}
      {...attributes}
    >
      <span className="truncate">{category.label}</span>
      <span
        {...listeners}
        className={`
          flex items-center justify-center w-[18px] h-[18px] cursor-grab active:cursor-grabbing
          opacity-0 group-hover:opacity-100 transition-opacity
          ${isDragging ? 'opacity-100' : ''}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={18} className="text-[#9b9ea3]" />
      </span>
    </button>
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
}: {
  value: string
  onChange: (date: string) => void
  placeholder: string
  disabledBefore?: Date
  isEmpty: boolean
  isFilled: boolean
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
    : 'bg-transparent hover:bg-[#151617]'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`
            w-full text-left px-[6px] py-[5px] rounded-[4px] cursor-pointer
            font-['Avenir',sans-serif] font-normal text-[14px] leading-[20px]
            ${cellBg}
            ${value ? 'text-[#c9ced4]' : 'text-[#6b6e73]'}
            transition-colors
          `}
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
          classNames={{
            day_selected: "bg-[rgba(37,99,235,0.8)] text-white hover:bg-[rgba(37,99,235,0.9)] focus:bg-[rgba(37,99,235,0.9)]",
            day_today: "ring-1 ring-[#9b9ea3] text-[#c9ced4]",
            day: "h-8 w-8 p-0 font-normal text-[#c9ced4] hover:bg-[#151617] rounded-md inline-flex items-center justify-center aria-selected:opacity-100",
            head_cell: "text-[#9b9ea3] w-8 font-normal text-[0.8rem]",
            caption_label: "text-[#c9ced4] text-sm font-medium",
            nav_button: "h-7 w-7 bg-transparent hover:bg-[#151617] rounded-md p-0 opacity-70 hover:opacity-100 inline-flex items-center justify-center border border-[rgba(210,210,210,0.2)]",
            cell: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-[rgba(37,99,235,0.2)] [&:has([aria-selected])]:rounded-md",
            day_outside: "text-[#6b6e73] opacity-50 aria-selected:opacity-100",
            day_disabled: "text-[#6b6e73] opacity-30",
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export function EventTableEditor({
  isOpen,
  onClose,
  events,
  onEventsChange,
  categories,
  onCategoriesChange,
}: EventTableEditorProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [emptyRows, setEmptyRows] = useState<DraftEvent[]>([])
  const [draftEvents, setDraftEvents] = useState<TimelineEvent[]>(events)
  const [hasChanges, setHasChanges] = useState(false)
  const MAX_EMPTY_ROWS = 10

  React.useEffect(() => {
    if (isOpen) {
      setDraftEvents(events)
      setEmptyRows([])
      setHasChanges(false)
    }
  }, [isOpen, events])

  const displayEvents = useMemo(() => {
    const filteredEvents = activeCategory
      ? draftEvents.filter(event => event.category === activeCategory)
      : draftEvents
    return [...filteredEvents, ...emptyRows]
  }, [draftEvents, activeCategory, emptyRows])

  const isValidEvent = (event: DraftEvent | TimelineEvent) => {
    return Boolean(event.title.trim() && event.startDate && event.category)
  }

  const canApplyChanges = useMemo(() => {
    if (!hasChanges) return false
    const allEventsValid = draftEvents.every(isValidEvent)
    const allEmptyRowsValid = emptyRows.every(row => {
      const hasAnyField = Boolean(row.title.trim() || row.startDate || row.category)
      return hasAnyField ? isValidEvent(row) : true
    })
    return allEventsValid && allEmptyRowsValid
  }, [draftEvents, emptyRows, hasChanges])

  const handleDeleteEvent = (eventId: string) => {
    setDraftEvents(draftEvents.filter(event => event.id !== eventId))
    setHasChanges(true)
  }

  const handleEventChange = (id: string, changes: Partial<TimelineEvent>) => {
    const emptyRowIndex = emptyRows.findIndex(row => row.id === id)
    if (emptyRowIndex !== -1) {
      const updatedEmptyRows = [...emptyRows]
      updatedEmptyRows[emptyRowIndex] = { ...updatedEmptyRows[emptyRowIndex], ...changes }
      setEmptyRows(updatedEmptyRows)
      const updatedRow = updatedEmptyRows[emptyRowIndex]
      if (isValidEvent(updatedRow)) {
        const newEvent: TimelineEvent = {
          id: crypto.randomUUID(),
          title: updatedRow.title,
          startDate: updatedRow.startDate,
          endDate: updatedRow.endDate || updatedRow.startDate,
          category: updatedRow.category,
        }
        setDraftEvents(prev => [...prev, newEvent])
        setEmptyRows(rows => rows.filter(row => row.id !== id))
      }
    } else {
      setDraftEvents(draftEvents.map(evt => evt.id === id ? { ...evt, ...changes } : evt))
    }
    setHasChanges(true)
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
    onEventsChange(draftEvents)
    onClose()
  }

  // Drag-to-reorder sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = categories.findIndex(c => c.id === active.id)
      const newIndex = categories.findIndex(c => c.id === over.id)
      const reordered = arrayMove(categories, oldIndex, newIndex)
      onCategoriesChange(reordered)
    }
  }

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 w-full max-w-[960px] translate-x-[-50%] translate-y-[-50%] bg-[#171717] border border-[rgba(210,210,210,0.2)] rounded-[20px] p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
        >
          {/* Title */}
          <DialogPrimitive.Title className="text-center font-['Aleo',serif] font-normal text-[24px] leading-[1.4] text-[#c9ced4]">
            Events
          </DialogPrimitive.Title>

          {/* Content Area: Sidebar + Table */}
          <div className="flex gap-6 mt-6" style={{ height: 'min(500px, calc(100vh - 280px))' }}>
            {/* Category Sidebar */}
            <div className="w-[162px] shrink-0 bg-[#242526] rounded-[12px] p-2 flex flex-col gap-[2px] overflow-y-auto">
              {/* All Categories tab (pinned, not draggable) */}
              <button
                onClick={() => setActiveCategory(null)}
                className={`
                  w-full py-[9px] pl-[11px] pr-[3px] rounded-[10px]
                  backdrop-blur-[12px] text-left
                  font-['Avenir',sans-serif] font-medium text-[14px] leading-[20px] transition-all
                  ${activeCategory === null
                    ? 'border border-transparent bg-[rgba(37,99,235,0.4)] text-[#dadee5]'
                    : 'border border-transparent bg-transparent text-[#c9ced4] hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.1)] hover:text-[#dadee5]'
                  }
                `}
              >
                All Categories
              </button>

              {/* Draggable category tabs */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              >
                <SortableContext
                  items={categories.map(c => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {categories.map(cat => (
                    <SortableTab
                      key={cat.id}
                      category={cat}
                      isActive={activeCategory === cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>

            {/* Table Area */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Header Row */}
              <div
                className="flex items-center pl-[16px] pr-[10px] pb-2 gap-[22px] border-b border-[rgba(210,210,210,0.2)]"
                style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: '12px', lineHeight: '1.4', color: '#9b9ea3' }}
              >
                <div className="w-[240px] shrink-0">Title <span className="text-destructive">*</span></div>
                <div className="w-[90px] shrink-0">Start Date <span className="text-destructive">*</span></div>
                <div className="w-[90px] shrink-0">End Date</div>
                <div className="flex-1">Category <span className="text-destructive">*</span></div>
                <div className="w-[32px] shrink-0"></div>
              </div>

              {/* Scrollable Event Rows */}
              <div className="flex-1 overflow-y-auto py-1 pb-4 space-y-1">
                {displayEvents.map((event) => {
                  const empty = isEmptyRow(event.id)

                  return (
                    <div
                      key={event.id}
                      className="flex items-center bg-[#242526] rounded-[4px] py-[6px] px-[10px] gap-[22px]"
                    >
                      {/* Title */}
                      <div className="w-[240px] shrink-0">
                        <input
                          type="text"
                          value={event.title}
                          onChange={(e) => handleEventChange(event.id, { title: e.target.value })}
                          placeholder="Event title"
                          autoComplete="off"
                          className={`
                            w-full px-[6px] py-[5px] rounded-[4px] border-none outline-none
                            font-['Avenir',sans-serif] font-normal text-[14px] leading-[20px]
                            placeholder:text-[#6b6e73]
                            ${empty && !isFieldFilled(event, 'title')
                              ? 'bg-[#151617] text-[#c9ced4]'
                              : 'bg-transparent text-[#c9ced4] hover:bg-[#151617]'
                            }
                            focus:bg-[#151617] transition-colors
                          `}
                        />
                      </div>

                      {/* Start Date */}
                      <div className="w-[90px] shrink-0">
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
                        />
                      </div>

                      {/* End Date */}
                      <div className="w-[90px] shrink-0">
                        <DatePickerCell
                          value={event.endDate}
                          onChange={(date) => handleEventChange(event.id, { endDate: date })}
                          placeholder="Pick a date"
                          disabledBefore={parseDate(event.startDate)}
                          isEmpty={empty}
                          isFilled={isFieldFilled(event, 'endDate')}
                        />
                      </div>

                      {/* Category */}
                      <div className="flex-1 min-w-0">
                        <Select
                          value={event.category || undefined}
                          onValueChange={(value) => handleEventChange(event.id, { category: value })}
                        >
                          <SelectTrigger
                            className={`
                              w-full h-auto border-none shadow-none px-[6px] py-[5px] rounded-[4px]
                              font-['Avenir',sans-serif] font-normal text-[14px] leading-[20px]
                              ${empty && !isFieldFilled(event, 'category')
                                ? 'bg-[#151617] text-[#c9ced4]'
                                : 'bg-transparent text-[#c9ced4] hover:bg-[#151617]'
                              }
                              focus:bg-[#151617] focus:ring-0 transition-colors
                              [&>span]:text-[#6b6e73] [&>span[data-placeholder]]:text-[#6b6e73]
                            `}
                          >
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#242526] border border-[rgba(210,210,210,0.2)] rounded-lg">
                            {categories.map(cat => (
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
                      </div>

                      {/* Delete */}
                      <div className="w-[32px] shrink-0 flex justify-center">
                        <button
                          onClick={() => empty
                            ? handleDeleteEmptyRow(event.id)
                            : handleDeleteEvent(event.id)
                          }
                          className="p-1 text-[#9b9ea3] hover:text-[#dadee5] transition-colors rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center mt-6">
            {/* Add Event (left) */}
            <button
              onClick={handleAddRow}
              disabled={emptyRows.length >= MAX_EMPTY_ROWS}
              className="
                min-w-[80px] px-[11px] py-[6px] rounded-[10px]
                backdrop-blur-[12px] bg-white/10 border border-white/[0.15]
                shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
                font-['Avenir',sans-serif] font-medium text-[14px] text-[#c9ced4]
                hover:bg-white/20 hover:text-[#dadee5] transition-all
                disabled:opacity-50 disabled:pointer-events-none
              "
            >
              Add Event
            </button>

            {/* Cancel + Save Changes (right) */}
            <div className="flex gap-[10px]">
              <button
                onClick={onClose}
                className="
                  min-w-[80px] px-[11px] py-[6px] rounded-[10px]
                  backdrop-blur-[12px] bg-white/10 border border-white/[0.15]
                  shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
                  font-['Avenir',sans-serif] font-medium text-[14px] text-[#c9ced4]
                  hover:bg-white/20 hover:text-[#dadee5] transition-all
                "
              >
                Cancel
              </button>

              <button
                onClick={handleApplyChanges}
                disabled={!canApplyChanges}
                className="
                  min-w-[80px] px-[11px] py-[6px] rounded-[10px]
                  backdrop-blur-[12px] bg-[rgba(37,99,235,0.8)] border border-white/[0.15]
                  shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
                  font-['Avenir',sans-serif] font-medium text-[14px] text-[#dadee5]
                  hover:bg-[rgba(37,99,235,0.9)] transition-all
                  disabled:opacity-50 disabled:pointer-events-none
                "
              >
                Save Changes
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
