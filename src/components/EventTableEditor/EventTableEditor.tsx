import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { TimelineEvent, CategoryConfig } from '../../types/event'
import { Trash2, GripVertical } from 'lucide-react'
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
        text-left
        font-['Avenir',sans-serif] font-medium text-[14px] leading-[20px] transition-colors
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
          classNames={darkCalendarClassNames}
        />
      </PopoverContent>
    </Popover>
  )
}

// Color palette for categories
const COLOR_PALETTE = [
  { label: 'Blue', value: '#4196E4' },
  { label: 'Purple', value: '#A770EC' },
  { label: 'Red', value: '#E10000' },
  { label: 'Green', value: '#259E23' },
  { label: 'Orange', value: '#FF7D05' },
]

// Color bar component for category color picker
function ColorBar({
  color,
  isSelected,
  onClick,
}: {
  color: string
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="relative w-[30px] h-[75px] flex items-center justify-center cursor-pointer group"
    >
      <div
        className={`
          w-[27px] rounded-[4px] transition-all duration-200
          ${isSelected
            ? 'h-[75px] opacity-100'
            : 'h-[50px] opacity-60 group-hover:h-[60px] group-hover:opacity-80'
          }
        `}
        style={{
          backgroundColor: color,
          border: `1px solid ${color}`,
          boxShadow: 'inset 0px 4px 20px rgba(0,0,0,0.25)',
        }}
      />
    </button>
  )
}

// Glass button used in category rows
const glassButtonClass = `
  relative min-w-[80px] px-[11px] py-[6px] rounded-[10px]
  backdrop-blur-[12px] bg-white/10 border border-white/[0.15]
  shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
  font-['Avenir',sans-serif] font-medium text-[14px] text-[#c9ced4]
  hover:bg-white/20 hover:text-[#dadee5] transition-all
`

export function EventTableEditor({
  isOpen,
  onClose,
  events,
  onEventsChange,
  categories,
  onCategoriesChange,
}: EventTableEditorProps) {
  const [activePageTab, setActivePageTab] = useState<'events' | 'categories'>('events')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [emptyRows, setEmptyRows] = useState<DraftEvent[]>([])
  const [draftEvents, setDraftEvents] = useState<TimelineEvent[]>(events)
  const [draftCategories, setDraftCategories] = useState<CategoryConfig[]>(categories)
  const [hasChanges, setHasChanges] = useState(false)
  const MAX_EMPTY_ROWS = 10

  React.useEffect(() => {
    if (isOpen) {
      setDraftEvents(events)
      setDraftCategories(categories)
      setEmptyRows([])
      setHasChanges(false)
      setActivePageTab('events')
    }
  }, [isOpen, events, categories])

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
    const allCategoriesValid = draftCategories.every(c => c.label.trim())
    return allEventsValid && allEmptyRowsValid && allCategoriesValid
  }, [draftEvents, draftCategories, emptyRows, hasChanges])

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
    onCategoriesChange(draftCategories)
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
    setHasChanges(true)
  }, [draftCategories])

  const handleAddCategory = useCallback(() => {
    if (draftCategories.length >= 4) return
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 w-full max-w-[960px] translate-x-[-50%] translate-y-[-50%] bg-[#171717] border border-[rgba(210,210,210,0.2)] rounded-[20px] p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
        >
          {/* Accessible title (sr-only) */}
          <DialogPrimitive.Title className="sr-only">Events</DialogPrimitive.Title>

          {/* Page Tabs */}
          <div className="flex items-center justify-center h-[48px]">
            <div className="relative flex items-center">
              {/* Glass pill indicator */}
              <div
                className="absolute top-1/2 -translate-y-1/2 h-[44px] border border-[rgba(255,255,255,0.15)] rounded-[12px] shadow-[0px_8px_32px_rgba(0,0,0,0.4)] pointer-events-none"
                style={{
                  left: activePageTab === 'events' ? '0px' : '99px',
                  width: activePageTab === 'events' ? '99px' : '139px',
                  transition: 'left 320ms ease-out, width 320ms ease-out',
                }}
              >
                <div className="absolute inset-0 backdrop-blur-[12px] bg-[rgba(255,255,255,0.1)] rounded-[12px]" />
                <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0px_1px_0px_rgba(255,255,255,0.1)]" />
              </div>
              <button
                onClick={() => setActivePageTab('events')}
                className="relative flex items-start h-[44px] px-[12px] py-[5px] rounded-[4px]"
              >
                <span className={`font-['Aleo',serif] font-normal text-[24px] leading-[1.4] whitespace-nowrap transition-colors ${activePageTab === 'events' ? 'text-[#dadee5]' : 'text-[#9b9ea3]'}`}>
                  Events
                </span>
              </button>
              <button
                onClick={() => setActivePageTab('categories')}
                className="relative flex items-start h-[44px] px-[12px] py-[5px] rounded-[4px] cursor-pointer"
              >
                <span className={`font-['Aleo',serif] font-normal text-[24px] leading-[1.4] whitespace-nowrap transition-colors ${activePageTab === 'categories' ? 'text-[#dadee5]' : 'text-[#9b9ea3]'}`}>
                  Categories
                </span>
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="mt-8" style={{ height: 'min(520px, calc(100vh - 280px))' }}>
            {activePageTab === 'events' ? (
              /* Events Tab Content */
              <div className="flex gap-[16px] h-full">
                {/* Category Sidebar */}
                <div className="w-[162px] shrink-0 bg-[#242526] rounded-[12px] p-2 flex flex-col gap-[2px] overflow-y-auto">
                  {/* All Categories tab (pinned, not draggable) */}
                  <button
                    onClick={() => setActiveCategory(null)}
                    className={`
                      w-full py-[9px] pl-[11px] pr-[3px] rounded-[10px]
                      text-left
                      font-['Avenir',sans-serif] font-medium text-[14px] leading-[20px] transition-colors
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
                      items={draftCategories.map(c => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {draftCategories.map(cat => (
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
            ) : (
              /* Categories Tab Content */
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex flex-col gap-[6px]">
                  <div
                    className="flex items-center gap-[24px] px-[16px]"
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 300, fontSize: '12px', lineHeight: '1.4', color: '#9b9ea3' }}
                  >
                    <div className="w-[243px] shrink-0">Category Title</div>
                    <div className="flex-1 text-center">Category Color</div>
                    <div className="w-[176px] shrink-0 opacity-0">Category Color</div>
                  </div>
                  <div className="h-px w-full bg-[rgba(210,210,210,0.2)]" />
                </div>

                {/* Scrollable category rows */}
                <div className="flex-1 overflow-y-auto pt-1 pb-5 space-y-2">
                  {draftCategories.map(cat => (
                    <div
                      key={cat.id}
                      className={`flex items-center rounded-[4px] pt-[6px] pb-[5px] ${cat.visible ? 'bg-[#242526]' : 'bg-[#151617]'}`}
                    >
                      <div className="flex flex-1 items-center gap-[20px] h-[76px] px-[10px]">
                        {/* Editable title */}
                        <div className={`w-[250px] shrink-0 bg-[#151617] rounded-[4px] px-[6px] py-[5px] ${!cat.visible ? 'opacity-40' : ''}`}>
                          <input
                            type="text"
                            value={editingLabels[cat.id] || ''}
                            onChange={(e) => handleCategoryLabelChange(cat.id, e.target.value)}
                            onBlur={() => handleCategoryLabelBlur(cat.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            className="w-full bg-transparent border-none outline-none font-['Aleo',serif] font-normal text-[24px] leading-[1.4] text-[#dadee5]"
                          />
                        </div>

                        {/* Color picker */}
                        <div className={`flex-1 flex items-center justify-center gap-[6px] ${!cat.visible ? 'opacity-40' : ''}`}>
                          {COLOR_PALETTE.map(color => (
                            <ColorBar
                              key={color.value}
                              color={color.value}
                              isSelected={cat.color.toUpperCase() === color.value.toUpperCase()}
                              onClick={() => handleCategoryColorChange(cat.id, color.value)}
                            />
                          ))}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-[16px] shrink-0">
                          <button
                            onClick={() => handleCategoryVisibilityToggle(cat.id)}
                            className={glassButtonClass}
                          >
                            {cat.visible ? 'Hide' : 'Show'}
                          </button>
                          <button
                            onClick={() => handleCategoryDelete(cat.id)}
                            disabled={draftCategories.length <= 1}
                            className={`${glassButtonClass} disabled:opacity-50 disabled:pointer-events-none`}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom divider */}
                <div className="h-px w-full bg-[rgba(210,210,210,0.2)]" />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center mt-8">
            {/* Add button (left) — context-dependent */}
            {activePageTab === 'events' ? (
              <button
                onClick={handleAddRow}
                disabled={emptyRows.length >= MAX_EMPTY_ROWS}
                className={`${glassButtonClass} disabled:opacity-50 disabled:pointer-events-none`}
              >
                Add Event
              </button>
            ) : (
              <button
                onClick={handleAddCategory}
                disabled={draftCategories.length >= 4}
                className={`${glassButtonClass} disabled:opacity-50 disabled:pointer-events-none`}
              >
                Add Category
              </button>
            )}

            {/* Cancel + Save (right) */}
            <div className="flex gap-[10px]">
              <button onClick={onClose} className={glassButtonClass}>
                Cancel
              </button>

              <button
                onClick={handleApplyChanges}
                disabled={!canApplyChanges}
                className="
                  relative min-w-[80px] px-[11px] py-[6px] rounded-[10px]
                  backdrop-blur-[12px] bg-[rgba(37,99,235,0.8)] border border-white/[0.15]
                  shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
                  font-['Avenir',sans-serif] font-medium text-[14px] text-[#dadee5]
                  hover:bg-[rgba(37,99,235,0.9)] transition-all
                  disabled:opacity-50 disabled:pointer-events-none
                "
              >
                Save
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
