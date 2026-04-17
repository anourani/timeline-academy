import { useState, useEffect, useRef } from 'react'
import { SUBJECT_TYPE_SUFFIX } from '@/constants/pillDefinitions'
import type { SubjectType } from '@/constants/pillDefinitions'
import { ModeSwitcher } from '@/components/AIMode/ModeSwitcher'
import { SubjectSuggestions } from '@/components/AIMode/SubjectSuggestions'
import { SineWaveLoader } from '@/components/AIMode/SineWaveLoader'
import { DEFAULT_SUBJECT_SUGGESTIONS, SUBJECT_SUGGESTIONS } from '@/constants/aiSubjectSuggestions'

interface NewTimelineScreenProps {
  onAIGenerate: (subject: string) => void
  onCancel: () => void
  onStartFresh: () => void
  onImportCSV: () => void
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

const TYPE_LABELS: { key: SubjectType; display: string }[] = [
  { key: 'person', display: 'Person' },
  { key: 'event', display: 'Event' },
  { key: 'topic', display: 'Topic' },
  { key: 'organization', display: 'Org' },
]

function BackgroundPattern() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="absolute rounded-full"
        style={{
          width: 800,
          height: 800,
          left: '20%',
          bottom: '-10%',
          background: 'radial-gradient(circle, rgba(34,120,60,0.25) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 700,
          height: 700,
          right: '-5%',
          top: '10%',
          background: 'radial-gradient(circle, rgba(30,50,120,0.3) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 500,
          height: 500,
          left: '5%',
          top: '-5%',
          background: 'radial-gradient(circle, rgba(140,100,30,0.15) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
    </div>
  )
}

function suggestionsForQuery(query: string): string[] {
  const trimmed = query.trim()
  if (trimmed.length < 3) return DEFAULT_SUBJECT_SUGGESTIONS
  const lower = trimmed.toLowerCase()
  return SUBJECT_SUGGESTIONS.filter((s) => s.toLowerCase().startsWith(lower))
}

export function NewTimelineScreen({
  onAIGenerate,
  onCancel,
  onStartFresh,
  onImportCSV,
  isGenerating,
  isClassifying,
  classifiedType,
  error,
}: NewTimelineScreenProps) {
  const [name, setName] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [inputFocused, setInputFocused] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const isWorking = isClassifying || isGenerating

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_NAMES.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!showSuggestions) return
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSuggestions(false)
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [showSuggestions])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || isWorking) return
    setShowSuggestions(false)
    onAIGenerate(trimmed)
  }

  const handleCancel = () => {
    setName('')
    onCancel()
  }

  const handleSelectSuggestion = (suggestion: string) => {
    setName(suggestion)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const suffix = classifiedType ? SUBJECT_TYPE_SUFFIX[classifiedType] : ''

  const isCompleted = isWorking && name.trim().length > 0
  const hasText = name.trim().length > 0

  const dropdownVisible =
    showSuggestions &&
    !isWorking &&
    suggestionsForQuery(name).length > 0

  return (
    <div className="relative min-h-screen bg-surface-primary overflow-auto">
      <BackgroundPattern />
      <div className="relative z-10">
        <div className="px-4 pt-24 pb-10 md:pl-[120px] md:pr-[80px] md:pt-[180px] md:pb-[120px]">
          <div className="flex flex-col gap-[32px] md:gap-[50px] items-start">
            <ModeSwitcher onStartFresh={onStartFresh} onImportCSV={onImportCSV} />

            <form onSubmit={handleSubmit} className="w-full">
              <div className="flex flex-col gap-[32px] md:gap-[50px] items-start">
                <div className="flex flex-wrap gap-[8px] items-start">
                  <span className="font-['Aleo'] text-[24px] md:text-[32px] text-text-secondary whitespace-nowrap leading-[1.25] h-[58px] flex items-center shrink-0">
                    Generate a timeline of
                  </span>
                  <div ref={wrapperRef} className="relative flex flex-col items-start gap-[2px]">
                    <div className="flex items-center gap-[8px] h-[58px]">
                      <input
                        ref={inputRef}
                        type="text"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value)
                          if (!isWorking) setShowSuggestions(true)
                        }}
                        onFocus={() => {
                          setInputFocused(true)
                          if (!isWorking) setShowSuggestions(true)
                        }}
                        onBlur={() => setInputFocused(false)}
                        placeholder={PLACEHOLDER_NAMES[placeholderIndex]}
                        disabled={isWorking}
                        className={[
                          "font-['Aleo'] text-[24px] md:text-[32px] leading-[1.25] outline-none rounded-[8px] px-[11px] py-[9px] h-[58px] box-border transition-all duration-150 ease-in",
                          isCompleted
                            ? 'bg-[#171717] border border-[#3d3e40] text-text-secondary shadow-[0px_8px_32px_0px_rgba(155,158,163,0.04)]'
                            : hasText
                              ? 'bg-[#171717] border border-[#3d3e40] text-text-secondary shadow-[0px_8px_32px_0px_rgba(155,158,163,0.04)]'
                              : 'bg-[#0a0a0a] border border-[#171717] text-text-tertiary shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4)]',
                          'placeholder-text-tertiary disabled:opacity-70',
                        ].join(' ')}
                        style={{
                          width: isCompleted && !inputFocused
                            ? Math.max(60, name.length * 19 + 30)
                            : Math.max(240, name.length * 19 + 30),
                          minWidth: isCompleted && !inputFocused ? undefined : 240,
                        }}
                      />
                      {suffix && (
                        <span className="font-['Aleo'] text-[24px] md:text-[32px] text-text-tertiary whitespace-nowrap leading-[1.25]">
                          {suffix}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-[4px] font-avenir text-sm leading-[20px]">
                      {TYPE_LABELS.map((t, i) => (
                        <span key={t.key} className="flex items-center gap-[4px]">
                          {i > 0 && <span className="text-text-tertiary">/</span>}
                          <span
                            className={
                              classifiedType === t.key ? 'text-text-primary' : 'text-text-tertiary'
                            }
                          >
                            {t.display}
                          </span>
                        </span>
                      ))}
                    </div>
                    {dropdownVisible && (
                      <SubjectSuggestions
                        query={name}
                        onSelect={handleSelectSuggestion}
                      />
                    )}
                  </div>
                </div>

                <div>
                  {isWorking ? (
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="relative inline-flex items-center justify-center h-[36px] min-w-[80px] px-[14px] rounded-[10px] border border-[rgba(255,255,255,0.15)] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4)] font-avenir text-sm font-medium text-text-secondary text-center"
                    >
                      <div aria-hidden="true" className="absolute inset-0 rounded-[10px] backdrop-blur-[12px] bg-[rgba(255,255,255,0.1)] pointer-events-none" />
                      <span className="relative">Cancel</span>
                      <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] pointer-events-none" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!hasText}
                      className={[
                        'inline-flex items-center justify-center gap-[6px] h-[36px] px-[14px] rounded-[10px] bg-[#2563eb] text-white font-avenir text-sm font-medium shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.15)] transition-opacity hover:bg-[#1d4ed8] disabled:cursor-not-allowed',
                        hasText ? 'opacity-100' : 'opacity-50',
                      ].join(' ')}
                    >
                      <span className="text-base leading-none">↵</span>
                      <span>Enter</span>
                    </button>
                  )}
                </div>
              </div>
            </form>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            {isWorking && (
              <SineWaveLoader className="mt-2" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
