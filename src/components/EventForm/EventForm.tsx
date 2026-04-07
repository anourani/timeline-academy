import React, { useState, useCallback, useEffect } from 'react'
import { TimelineEvent, CategoryConfig } from '../../types/event'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { DialogClose } from '@/components/ui/dialog'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  parseDate,
  formatDateToString,
  formatDateDisplay,
  darkCalendarClassNames,
} from '@/utils/dateUtils'
import { normalizeDate } from '@/utils/dateUtils'

const MAX_TITLE_LENGTH = 55

interface EventFormProps {
  onSubmit: (event: Omit<TimelineEvent, 'id'>) => void
  categories: CategoryConfig[]
  onImport?: (events: Array<Omit<TimelineEvent, 'id'>>, categories: CategoryConfig[]) => void
  initialStartDate?: string | null
  initialEvent?: TimelineEvent | null
}

export function EventForm({
  onSubmit,
  categories,
  initialStartDate,
  initialEvent
}: EventFormProps) {
  const [title, setTitle] = useState(initialEvent?.title || '')
  const [startDate, setStartDate] = useState(initialEvent?.startDate || initialStartDate || '')
  const [endDate, setEndDate] = useState(initialEvent?.endDate || '')
  const [category, setCategory] = useState(initialEvent?.category || categories[0]?.id || '')
  const [isEndDateFocused, setIsEndDateFocused] = useState(false)

  // Date display text states
  const [startDateText, setStartDateText] = useState(
    startDate ? formatDateDisplay(startDate) : ''
  )
  const [endDateText, setEndDateText] = useState(
    endDate ? formatDateDisplay(endDate) : ''
  )
  const [startCalendarOpen, setStartCalendarOpen] = useState(false)
  const [endCalendarOpen, setEndCalendarOpen] = useState(false)

  useEffect(() => {
    if (initialEvent) {
      setTitle(initialEvent.title)
      setStartDate(initialEvent.startDate)
      setEndDate(initialEvent.endDate)
      setCategory(initialEvent.category)
      setStartDateText(formatDateDisplay(initialEvent.startDate))
      setEndDateText(formatDateDisplay(initialEvent.endDate))
    }
  }, [initialEvent])

  useEffect(() => {
    if (isEndDateFocused && !endDate && startDate) {
      setEndDate(startDate)
      setEndDateText(formatDateDisplay(startDate))
    }
  }, [isEndDateFocused, endDate, startDate])

  const isFormValid = title.trim().length > 0 && category.length > 0 && startDate.length > 0

  const handleStartDateBlur = useCallback(() => {
    if (!startDateText) {
      setStartDate('')
      return
    }
    const normalized = normalizeDate(startDateText)
    if (normalized) {
      setStartDate(normalized)
      setStartDateText(formatDateDisplay(normalized))
    } else {
      setStartDateText(startDate ? formatDateDisplay(startDate) : '')
    }
  }, [startDateText, startDate])

  const handleEndDateBlur = useCallback(() => {
    setIsEndDateFocused(false)
    if (!endDateText) {
      setEndDate('')
      return
    }
    const normalized = normalizeDate(endDateText)
    if (normalized) {
      // Validate end date is not before start date
      if (startDate && normalized < startDate) {
        setEndDateText(endDate ? formatDateDisplay(endDate) : '')
        return
      }
      setEndDate(normalized)
      setEndDateText(formatDateDisplay(normalized))
    } else {
      setEndDateText(endDate ? formatDateDisplay(endDate) : '')
    }
  }, [endDateText, endDate, startDate])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (!category) {
      alert('Please select a category')
      return
    }

    if (title.length > MAX_TITLE_LENGTH) {
      alert(`Title must be ${MAX_TITLE_LENGTH} characters or less`)
      return
    }

    if (!startDate) {
      alert('Please enter a valid start date')
      return
    }

    onSubmit({
      title,
      startDate,
      endDate: endDate || startDate,
      category
    })

    setTitle('')
    setStartDate('')
    setEndDate('')
    setStartDateText('')
    setEndDateText('')
    setCategory(categories[0]?.id || '')
  }, [title, startDate, endDate, category, categories, onSubmit])

  return (
    <form onSubmit={handleSubmit} className="rounded-lg">
      <div className="flex flex-col gap-6">
        {/* Event Title */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-[6px]">
            <label htmlFor="title" className="label-m-type2 text-[#c9ced4]">
              Event title
            </label>
            <span className="label-s-type2 text-[#9b9ea3]">
              {title.length}/{MAX_TITLE_LENGTH}
            </span>
          </div>
          <Input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE_LENGTH}
            required
            className="h-9 bg-[#242526] border-[#737373] rounded-lg font-['Avenir',sans-serif] text-sm text-[#dadee5] [color-scheme:dark]"
            autoFocus
          />
        </div>

        {/* Category Toggle Grid */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-[6px]">
            <label className="label-m-type2 text-[#c9ced4]">
              Category
            </label>
            <span className="label-s-type2 text-[#9b9ea3]">
              select one
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex gap-1">
              {categories.slice(0, 2).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  style={category === cat.id ? {
                    backgroundColor: `${cat.color}4D`,
                    borderColor: cat.color,
                  } : undefined}
                  className={cn(
                    "flex-1 px-2 py-2 rounded text-sm text-center border transition-colors",
                    "font-['Avenir',sans-serif]",
                    category === cat.id
                      ? "text-[#dadee5]"
                      : "bg-[#242526] border-[#242526] text-[#c9ced4] hover:brightness-110"
                  )}
                  aria-pressed={category === cat.id}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {categories.slice(2, 4).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  style={category === cat.id ? {
                    backgroundColor: `${cat.color}4D`,
                    borderColor: cat.color,
                  } : undefined}
                  className={cn(
                    "flex-1 px-2 py-2 rounded text-sm text-center border transition-colors",
                    "font-['Avenir',sans-serif]",
                    category === cat.id
                      ? "text-[#dadee5]"
                      : "bg-[#242526] border-[#242526] text-[#c9ced4] hover:brightness-110"
                  )}
                  aria-pressed={category === cat.id}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date Fields */}
        <div className="flex gap-2">
          {/* Start Date */}
          <div className="flex-1 flex flex-col gap-1.5">
            <label className="label-m-type2 text-[#c9ced4]">
              Start date
            </label>
            <Popover open={startCalendarOpen} onOpenChange={setStartCalendarOpen}>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="XX/XX/XXXX"
                  value={startDateText}
                  onChange={(e) => setStartDateText(e.target.value)}
                  onBlur={handleStartDateBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  className="h-9 pr-9 bg-[#242526] border-[#242526] rounded font-['Avenir',sans-serif] text-sm text-[#c9ced4] placeholder:text-[#9b9ea3] [color-scheme:dark]"
                />
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9b9ea3] hover:text-[#dadee5] transition-colors"
                  >
                    <CalendarDays size={16} />
                  </button>
                </PopoverTrigger>
              </div>
              <PopoverContent
                className="w-auto bg-[#242526] border border-[rgba(210,210,210,0.2)] rounded-lg shadow-md p-0"
                align="start"
              >
                <Calendar
                  mode="single"
                  selected={parseDate(startDate)}
                  onSelect={(date) => {
                    if (date) {
                      const iso = formatDateToString(date)
                      setStartDate(iso)
                      setStartDateText(formatDateDisplay(iso))
                      setStartCalendarOpen(false)
                    }
                  }}
                  initialFocus
                  className="rounded-lg"
                  classNames={darkCalendarClassNames}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* End Date */}
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-[6px]">
              <label className="label-m-type2 text-[#c9ced4]">
                End date
              </label>
              <span className="label-s-type2 text-[#9b9ea3]">
                optional
              </span>
            </div>
            <Popover open={endCalendarOpen} onOpenChange={setEndCalendarOpen}>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="XX/XX/XXXX"
                  value={endDateText}
                  onChange={(e) => setEndDateText(e.target.value)}
                  onFocus={() => setIsEndDateFocused(true)}
                  onBlur={handleEndDateBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  className="h-9 pr-9 bg-[#242526] border-[#242526] rounded font-['Avenir',sans-serif] text-sm text-[#c9ced4] placeholder:text-[#9b9ea3] [color-scheme:dark]"
                />
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9b9ea3] hover:text-[#dadee5] transition-colors"
                  >
                    <CalendarDays size={16} />
                  </button>
                </PopoverTrigger>
              </div>
              <PopoverContent
                className="w-auto bg-[#242526] border border-[rgba(210,210,210,0.2)] rounded-lg shadow-md p-0"
                align="start"
              >
                <Calendar
                  mode="single"
                  selected={parseDate(endDate)}
                  onSelect={(date) => {
                    if (date) {
                      const iso = formatDateToString(date)
                      setEndDate(iso)
                      setEndDateText(formatDateDisplay(iso))
                      setEndCalendarOpen(false)
                    }
                  }}
                  disabled={startDate ? { before: parseDate(startDate)! } : undefined}
                  initialFocus
                  className="rounded-lg"
                  classNames={darkCalendarClassNames}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-center gap-2.5 pt-3">
          <DialogClose asChild>
            <Button type="button" variant="glass" className="min-w-[80px]">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="submit"
            variant="glass"
            disabled={!isFormValid}
            className={cn(
              "min-w-[80px]",
              isFormValid
                ? "!bg-[rgba(37,99,235,0.8)]"
                : "!bg-[rgba(37,99,235,0.3)] opacity-50 cursor-not-allowed"
            )}
          >
            {initialEvent ? 'Update' : 'Add'}
          </Button>
        </div>
      </div>
    </form>
  )
}
