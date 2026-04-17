import { useState, useEffect, useRef } from 'react'
import type { SubjectType } from '@/constants/pillDefinitions'
import { Button } from '@/components/ui/button'
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
  error,
}: NewTimelineScreenProps) {
  const [name, setName] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputWrapperRef = useRef<HTMLDivElement>(null)

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
      if (inputWrapperRef.current && !inputWrapperRef.current.contains(e.target as Node)) {
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

  const hasText = name.trim().length > 0
  const dropdownVisible =
    showSuggestions && !isWorking && suggestionsForQuery(name).length > 0

  return (
    <div className="relative min-h-screen bg-surface-primary overflow-auto">
      <BackgroundPattern />
      <div className="relative z-10">
        <div className="px-4 pt-[120px] pb-[80px] flex flex-col items-center">
          <ModeSwitcher onStartFresh={onStartFresh} onImportCSV={onImportCSV} />

          <h1 className="header-medium text-text-secondary mt-[64px] text-center">
            Generate a timeline of any subject
          </h1>

          <form onSubmit={handleSubmit} className="w-full max-w-[480px] mt-[16px] flex flex-col items-center">
            <div ref={inputWrapperRef} className="relative w-full">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!isWorking) setShowSuggestions(true)
                }}
                onFocus={() => {
                  if (!isWorking) setShowSuggestions(true)
                }}
                placeholder={PLACEHOLDER_NAMES[placeholderIndex]}
                disabled={isWorking}
                className="block w-full font-['Aleo'] text-[32px] leading-[1.25] text-center text-text-secondary placeholder-text-tertiary bg-[#171717] border border-[#3d3e40] rounded-[12px] h-[80px] px-[16px] outline-none shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4)] focus:border-[#4d4e50] disabled:opacity-70"
              />
              {dropdownVisible && (
                <SubjectSuggestions
                  query={name}
                  onSelect={handleSelectSuggestion}
                />
              )}
            </div>

            <div className="mt-[24px]">
              {isWorking ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="relative inline-flex items-center justify-center h-[36px] min-w-[80px] px-[16px] rounded-[10px] border border-[rgba(255,255,255,0.15)] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4)] font-avenir text-sm font-medium text-text-secondary"
                >
                  <div aria-hidden="true" className="absolute inset-0 rounded-[10px] backdrop-blur-[12px] bg-[rgba(255,255,255,0.1)] pointer-events-none" />
                  <span className="relative">Cancel</span>
                </button>
              ) : (
                <Button
                  type="submit"
                  variant="primary-sm"
                  size="none"
                  disabled={!hasText}
                  className={[
                    'gap-[6px] transition-opacity disabled:cursor-not-allowed',
                    hasText ? 'opacity-100' : 'opacity-50',
                  ].join(' ')}
                >
                  <span className="text-base leading-none">↵</span>
                  <span>Enter</span>
                </Button>
              )}
            </div>
          </form>

          {error && (
            <p className="mt-[16px] text-sm text-red-400 text-center">{error}</p>
          )}

          {isWorking && <SineWaveLoader className="mt-[32px]" />}
        </div>
      </div>
    </div>
  )
}
