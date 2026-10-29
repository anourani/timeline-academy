import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { countryName, getCountryOptions } from '@/constants/countries'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'

interface CountryPickerProps {
  /** ISO 3166-1 alpha-2. */
  value: string
  onChange: (code: string) => void
  /** Collapsed inside the Design menu: out of the tab order. */
  tabIndex?: number
  className?: string
}

/**
 * The World Events country: a trigger styled like the BYOK key input, opening
 * the app's dropdown surface with a search field over the country list.
 *
 * Non-modal on desktop, like `ModelSelector` and `AccountMenu`: it opens from
 * the non-modal Design popover, and modal mode would inert the page behind a
 * country list. Modal on a phone, where it opens inside the Design drawer —
 * a modal Dialog whose focus trap otherwise takes focus straight back from a
 * non-modal menu, which then reads that as focus leaving and closes within a
 * frame of opening. A modal menu holds its own trap above the drawer's.
 *
 * Radix menus have typeahead — any printable key jumps to a matching item and
 * moves focus there — which would snatch keystrokes out of the search field.
 * So the field swallows its own keys (bar Escape, which closes, and ArrowDown,
 * which steps into the list), and a printable key typed while an item has
 * focus is sent back to the field instead of to typeahead.
 */
export function CountryPicker({ value, onChange, tabIndex, className }: CountryPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  const options = getCountryOptions()
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.name.toLowerCase().includes(q) || o.code.toLowerCase() === q)
  }, [options, query])

  // Into the search field once open, rather than onto the menu. Radix keeps
  // its own open-focus hook private on DropdownMenu, so this lands a frame
  // after it. Not on a phone, where focusing a field throws the keyboard up
  // over the list.
  useEffect(() => {
    if (!open || isMobile) return
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open, isMobile])

  const focusFirstItem = () => {
    listRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus()
  }

  return (
    <DropdownMenu
      modal={isMobile}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          tabIndex={tabIndex}
          aria-label={`Country: ${countryName(value)}`}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-[8px] border border-[#262626] bg-[#242526] pl-3 pr-2.5',
            'body-m text-left text-[#DADEE5] outline-none transition-colors',
            'hover:border-[#404040] focus-visible:ring-1 focus-visible:ring-white/40',
            className,
          )}
        >
          <span className="truncate">{countryName(value)}</span>
          <ChevronDown size={16} className="shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        collisionPadding={8}
        className="flex w-[var(--radix-dropdown-menu-trigger-width)] flex-col p-1"
        style={{ maxHeight: 'min(320px, var(--radix-dropdown-menu-content-available-height))' }}
        onKeyDownCapture={(e) => {
          if (e.target === inputRef.current) return
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.stopPropagation()
            inputRef.current?.focus()
          }
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              focusFirstItem()
            }
            e.stopPropagation()
          }}
          placeholder="Search countries"
          aria-label="Search countries"
          autoComplete="off"
          spellCheck={false}
          className="mb-1 h-9 w-full shrink-0 rounded-[6px] border border-[#262626] bg-[#242526] px-3 text-sm text-[#DADEE5] placeholder:text-[#6b6e73] outline-none focus-visible:ring-1 focus-visible:ring-white/40"
        />
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[#6b6e73]">No matches</p>
          ) : (
            filtered.map((country) => {
              const selected = country.code === value
              return (
                <DropdownMenuItem
                  key={country.code}
                  role="menuitemradio"
                  aria-checked={selected}
                  onSelect={() => onChange(country.code)}
                >
                  <span className="truncate">{country.name}</span>
                  <Check
                    size={14}
                    aria-hidden="true"
                    className={cn('ml-auto shrink-0', !selected && 'invisible')}
                  />
                </DropdownMenuItem>
              )
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
