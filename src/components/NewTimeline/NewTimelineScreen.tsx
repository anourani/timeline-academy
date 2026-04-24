import { useState, useEffect, useRef } from 'react'
import type { SubjectType } from '@/constants/pillDefinitions'
import { SubjectSuggestions } from '@/components/AIMode/SubjectSuggestions'
import { DEFAULT_SUBJECT_SUGGESTIONS, SUBJECT_SUGGESTIONS } from '@/constants/aiSubjectSuggestions'

interface NewTimelineScreenProps {
  onAIGenerate: (subject: string) => void
  onCancel: () => void
  isGenerating: boolean
  isClassifying: boolean
  classifiedType: SubjectType | null
  error: string | null
}

const PLACEHOLDER_NAMES = [
  'Kobe Bryant',
  'Muhammad Ali',
  'Frida Kahlo',
  'Albert Einstein',
  'Marie Curie',
  'Martin Luther King Jr.',
]

function BackgroundGrid() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="absolute top-0 bottom-0"
        style={{
          left: '120px',
          right: '0',
          backgroundImage:
            'repeating-linear-gradient(to right, rgba(210,210,210,0.1) 0 1px, transparent 1px 200px)',
        }}
      />
    </div>
  )
}

function BackgroundPattern() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="absolute rounded-full"
        style={{
          width: 878,
          height: 879,
          left: '-567px',
          top: '77px',
          background: 'rgba(143, 146, 252, 0.08)',
          filter: 'blur(100px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 837,
          height: 839,
          left: '1004px',
          top: '-93px',
          background: 'rgba(37, 158, 35, 0.06)',
          filter: 'blur(100px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 911,
          height: 911,
          left: '259px',
          top: '158px',
          background: 'rgba(65, 150, 228, 0.06)',
          filter: 'blur(100px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 405,
          height: 405,
          left: '274px',
          top: '-205px',
          background: 'rgba(120, 44, 0, 0.09)',
          filter: 'blur(100px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 375,
          height: 375,
          left: '875px',
          top: '-28px',
          background: 'rgba(100, 0, 120, 0.04)',
          filter: 'blur(100px)',
        }}
      />
    </div>
  )
}

function suggestionsForQuery(query: string): string[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) return DEFAULT_SUBJECT_SUGGESTIONS
  const lower = trimmed.toLowerCase()
  return SUBJECT_SUGGESTIONS.filter((s) => s.toLowerCase().includes(lower)).slice(0, 6)
}

export function NewTimelineScreen({
  onAIGenerate,
  onCancel,
  isGenerating,
  isClassifying,
  error,
}: NewTimelineScreenProps) {
  const [name, setName] = useState('')
  const [placeholderText, setPlaceholderText] = useState('')
  const [placeholderPhase, setPlaceholderPhase] = useState<'typing' | 'deleting'>('typing')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [hasEngaged, setHasEngaged] = useState(false)
  const [renderDropdown, setRenderDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const isWorking = isClassifying || isGenerating

  useEffect(() => {
    if (hasEngaged) return
    const currentName = PLACEHOLDER_NAMES[placeholderIndex]

    if (placeholderPhase === 'typing') {
      if (placeholderText.length < currentName.length) {
        const t = setTimeout(() => {
          setPlaceholderText(currentName.slice(0, placeholderText.length + 1))
        }, 80)
        return () => clearTimeout(t)
      }
      const t = setTimeout(() => setPlaceholderPhase('deleting'), 1500)
      return () => clearTimeout(t)
    }

    if (placeholderText.length > 0) {
      const t = setTimeout(() => {
        setPlaceholderText(currentName.slice(0, placeholderText.length - 1))
      }, 40)
      return () => clearTimeout(t)
    }
    setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_NAMES.length)
    setPlaceholderPhase('typing')
  }, [placeholderText, placeholderPhase, placeholderIndex, hasEngaged])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (isWorking) {
        onCancel()
      } else {
        setShowSuggestions(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [showSuggestions, isWorking, onCancel])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || isWorking) return
    setShowSuggestions(false)
    onAIGenerate(trimmed)
  }

  const handleSelectSuggestion = (suggestion: string) => {
    setName(suggestion)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const dropdownVisible =
    showSuggestions && !isWorking && suggestionsForQuery(name).length > 0

  useEffect(() => {
    if (dropdownVisible) {
      setRenderDropdown(true)
      return
    }
    if (!renderDropdown) return
    const t = setTimeout(() => setRenderDropdown(false), 180)
    return () => clearTimeout(t)
  }, [dropdownVisible, renderDropdown])

  return (
    <div className="relative min-h-screen bg-surface-primary overflow-auto">
      <BackgroundGrid />
      <BackgroundPattern />
      <div className="relative z-10">
        <div
          className="flex flex-col items-start gap-[40px]"
          style={{ padding: '200px 120px 120px 120px' }}
        >
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="w-[996px] max-w-full flex flex-col"
          >
            <h2 className="header-xsmall text-text-tertiary m-0">
              Search for a person, place, or event
            </h2>

            <div className="relative flex flex-row items-end gap-[10px] pt-[8px] pb-[2px] min-h-[80px]">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!isWorking) setShowSuggestions(true)
                }}
                onFocus={() => {
                  setHasEngaged(true)
                  if (!isWorking) setShowSuggestions(true)
                }}
                onBlur={() => {
                  if (name.trim().length === 0) setHasEngaged(false)
                }}
                placeholder={hasEngaged ? '' : placeholderText}
                disabled={isWorking}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none p-0 font-['Aleo'] text-[60px] leading-[100%] font-normal text-text-secondary placeholder-text-tertiary disabled:opacity-70"
                aria-label="Subject for timeline generation"
              />

              {renderDropdown && (
                <div
                  data-state={dropdownVisible ? 'open' : 'closed'}
                  className="absolute left-0 top-[calc(100%+4px)] z-20 duration-150 ease-in fill-mode-forwards data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=closed]:pointer-events-none"
                >
                  <SubjectSuggestions
                    query={name}
                    onSelect={handleSelectSuggestion}
                  />
                </div>
              )}
            </div>

            {error && (
              <p className="mt-[16px] text-sm text-red-400">{error}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
