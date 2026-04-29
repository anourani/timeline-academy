import React, { useState, useCallback, useEffect, useRef } from 'react'
import { TimelineEvent, CategoryConfig, EventSource } from '../../types/event'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { DialogClose } from '@/components/ui/dialog'
import { CalendarDays, ChevronDown, Plus, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  parseDate,
  formatDateToString,
  formatDateDisplay,
  darkCalendarClassNames,
} from '@/utils/dateUtils'
import { normalizeDate } from '@/utils/dateUtils'
import { useAuth } from '@/hooks/useAuth'
import { uploadEventImage, deleteEventImage } from '@/utils/eventImageUpload'

const MAX_TITLE_LENGTH = 55
const MAX_DESCRIPTION_LENGTH = 500

function isValidUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim())
}

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
  const { user } = useAuth()
  const [title, setTitle] = useState(initialEvent?.title || '')
  const [startDate, setStartDate] = useState(initialEvent?.startDate || initialStartDate || '')
  const [endDate, setEndDate] = useState(initialEvent?.endDate || '')
  const [category, setCategory] = useState(initialEvent?.category || categories[0]?.id || '')
  const [isEndDateFocused, setIsEndDateFocused] = useState(false)
  const [description, setDescription] = useState(initialEvent?.description || '')
  const [imageUrl, setImageUrl] = useState(initialEvent?.imageUrl || '')
  const [sources, setSources] = useState<EventSource[]>(initialEvent?.sources ?? [])
  const [detailsExpanded, setDetailsExpanded] = useState(
    !!(initialEvent?.description || initialEvent?.imageUrl || (initialEvent?.sources?.length ?? 0) > 0)
  )
  const [imageError, setImageError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sourceUrlErrors, setSourceUrlErrors] = useState<Record<number, boolean>>({})
  const eventIdRef = useRef<string>(initialEvent?.id || crypto.randomUUID())

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
      setDescription(initialEvent.description || '')
      setImageUrl(initialEvent.imageUrl || '')
      setSources(initialEvent.sources ?? [])
      setDetailsExpanded(
        !!(initialEvent.description || initialEvent.imageUrl || (initialEvent.sources?.length ?? 0) > 0)
      )
      eventIdRef.current = initialEvent.id
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

  const updateSource = useCallback((idx: number, field: keyof EventSource, value: string) => {
    setSources(prev => prev.map((src, i) => i === idx ? { ...src, [field]: value } : src))
    if (field === 'url') {
      setSourceUrlErrors(prev => {
        if (!prev[idx]) return prev
        const next = { ...prev }
        delete next[idx]
        return next
      })
    }
  }, [])

  const removeSource = useCallback((idx: number) => {
    setSources(prev => prev.filter((_, i) => i !== idx))
    setSourceUrlErrors(prev => {
      if (!prev[idx]) return prev
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }, [])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!user) {
      setImageError('Sign in to upload images.')
      return
    }
    setImageError(null)
    setUploading(true)
    try {
      const url = await uploadEventImage(file, user.id, eventIdRef.current)
      setImageUrl(url)
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to upload image.')
    } finally {
      setUploading(false)
    }
  }, [user])

  const handleRemoveImage = useCallback(() => {
    const previousUrl = imageUrl
    setImageUrl('')
    setImageError(null)
    if (previousUrl) {
      // Best-effort: drop the storage object so cancelled uploads don't pile up.
      // Errors are swallowed inside deleteEventImage.
      void deleteEventImage(previousUrl)
    }
  }, [imageUrl])

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

    // Drop empty source rows; validate the rest.
    const cleanedSources: EventSource[] = []
    const newErrors: Record<number, boolean> = {}
    sources.forEach((source, idx) => {
      const url = source.url.trim()
      if (!url) return
      if (!isValidUrl(url)) {
        newErrors[idx] = true
        return
      }
      cleanedSources.push({ label: source.label.trim(), url })
    })
    if (Object.keys(newErrors).length > 0) {
      setSourceUrlErrors(newErrors)
      return
    }
    setSourceUrlErrors({})

    onSubmit({
      title,
      startDate,
      endDate: endDate || startDate,
      category,
      description: description.trim() ? description : undefined,
      imageUrl: imageUrl || undefined,
      sources: cleanedSources.length > 0 ? cleanedSources : undefined,
    })

    setTitle('')
    setStartDate('')
    setEndDate('')
    setStartDateText('')
    setEndDateText('')
    setCategory(categories[0]?.id || '')
    setDescription('')
    setImageUrl('')
    setSources([])
    setSourceUrlErrors({})
    setDetailsExpanded(false)
    eventIdRef.current = crypto.randomUUID()
  }, [title, startDate, endDate, category, categories, description, imageUrl, sources, onSubmit])

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

        {/* Collapsible details section */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setDetailsExpanded(prev => !prev)}
            aria-expanded={detailsExpanded}
            className="flex items-center justify-between w-full label-m-type2 text-[#9B9EA3] hover:text-[#C9CED4] transition-colors"
          >
            Add more details
            <ChevronDown
              size={16}
              className={`transition-transform ${detailsExpanded ? 'rotate-180' : ''}`}
            />
          </button>

          {detailsExpanded && (
            <div className="flex flex-col gap-4">
              {/* Description */}
              <div>
                <label htmlFor="event-description" className="label-m-type2 text-[#9B9EA3] mb-1 block">
                  Description{' '}
                  <span className="text-muted-foreground">
                    ({description.length}/{MAX_DESCRIPTION_LENGTH})
                  </span>
                </label>
                <textarea
                  id="event-description"
                  value={description}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_DESCRIPTION_LENGTH) {
                      setDescription(e.target.value)
                    }
                  }}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  rows={4}
                  className="w-full bg-[#262626] border border-[#262626] rounded-[8px] p-2 body-m text-[#DADEE5] outline-none focus:border-[#404040]"
                />
              </div>

              {/* Image */}
              <div>
                <label className="label-m-type2 text-[#9B9EA3] mb-1 block">Image</label>
                {imageUrl ? (
                  <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-[#262626]">
                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 p-1.5 rounded-md bg-black/70 hover:bg-black text-white"
                      aria-label="Remove image"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center aspect-[4/3] rounded-lg border border-dashed border-[#404040] cursor-pointer hover:border-[#525252]">
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={uploading}
                    />
                    <Upload size={20} className="text-[#9B9EA3] mb-2" />
                    <span className="body-m text-[#9B9EA3]">
                      {uploading ? 'Uploading…' : 'Click to upload'}
                    </span>
                    <span className="label-s-type2 text-[#737373] mt-1">JPG or PNG, up to 5MB</span>
                  </label>
                )}
                {imageError && (
                  <p className="label-s-type2 text-red-400 mt-1">{imageError}</p>
                )}
              </div>

              {/* Sources */}
              <div>
                <label className="label-m-type2 text-[#9B9EA3] mb-1 block">Sources</label>
                <div className="flex flex-col gap-2">
                  {sources.map((source, idx) => {
                    const hasUrlError = !!sourceUrlErrors[idx]
                    return (
                      <div key={idx} className="flex gap-2 items-start">
                        <div className="flex-1 flex flex-col gap-1">
                          <input
                            type="text"
                            placeholder="Label (optional)"
                            value={source.label}
                            onChange={(e) => updateSource(idx, 'label', e.target.value)}
                            className="w-full h-8 bg-[#262626] border border-[#262626] rounded-[8px] px-2 body-m text-[#DADEE5] outline-none focus:border-[#404040]"
                          />
                          <input
                            type="url"
                            placeholder="https://…"
                            value={source.url}
                            onChange={(e) => updateSource(idx, 'url', e.target.value)}
                            className={cn(
                              'w-full h-8 bg-[#262626] rounded-[8px] px-2 body-m text-[#DADEE5] outline-none border',
                              hasUrlError
                                ? 'border-red-500 focus:border-red-500'
                                : 'border-[#262626] focus:border-[#404040]'
                            )}
                          />
                          {hasUrlError && (
                            <p className="label-s-type2 text-red-400">
                              URL must start with http:// or https://
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSource(idx)}
                          className="p-1.5 rounded-md text-[#9B9EA3] hover:text-[#C9CED4] hover:bg-[#262626]"
                          aria-label="Remove source"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setSources(prev => [...prev, { label: '', url: '' }])}
                  className="mt-2 flex items-center gap-1 label-m-type2 text-[#9B9EA3] hover:text-[#C9CED4]"
                >
                  <Plus size={14} /> Add source
                </button>
              </div>
            </div>
          )}
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
