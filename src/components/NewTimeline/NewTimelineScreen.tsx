import { useState, useEffect, useRef, useCallback } from 'react'
import { GlobalNav } from '@/components/Navigation/GlobalNav'
import { SUBJECT_TYPE_SUFFIX } from '@/constants/pillDefinitions'
import type { SubjectType } from '@/constants/pillDefinitions'

interface NewTimelineScreenProps {
  onAIGenerate: (subject: string) => void
  onCancel: () => void
  onManualCreate: () => void
  isGenerating: boolean
  isClassifying: boolean
  classifiedType: SubjectType | null
  categoryLabels: string[]
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

const TYPEWRITER_TEXT = 'thinking through the lens of...'
const PILL_DELAYS = [400, 350, 450, 300]

function TypewriterText({ text, onComplete }: { text: string; onComplete: () => void }) {
  const [displayedCount, setDisplayedCount] = useState(0)
  const completedRef = useRef(false)

  useEffect(() => {
    if (displayedCount < text.length) {
      const timer = setTimeout(() => {
        setDisplayedCount((c) => c + 1)
      }, 35)
      return () => clearTimeout(timer)
    } else if (!completedRef.current) {
      completedRef.current = true
      onComplete()
    }
  }, [displayedCount, text, onComplete])

  return (
    <span>
      {text.slice(0, displayedCount)}
      {displayedCount < text.length && (
        <span className="animate-pulse">|</span>
      )}
    </span>
  )
}

function BackgroundPattern() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {/* Green glow — bottom center */}
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
      {/* Blue/navy glow — right side */}
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
      {/* Warm amber glow — top left */}
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

export function NewTimelineScreen({
  onAIGenerate,
  onCancel,
  onManualCreate,
  isGenerating,
  isClassifying,
  classifiedType,
  categoryLabels,
  error,
}: NewTimelineScreenProps) {
  const [name, setName] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [inputFocused, setInputFocused] = useState(false)
  const [typewriterDone, setTypewriterDone] = useState(false)
  const [visiblePills, setVisiblePills] = useState<number[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const pillTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const isWorking = isClassifying || isGenerating

  // Cycle placeholder names
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_NAMES.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Reset animation state when not working
  useEffect(() => {
    if (!isWorking) {
      setTypewriterDone(false)
      setVisiblePills([])
      pillTimersRef.current.forEach(clearTimeout)
      pillTimersRef.current = []
    }
  }, [isWorking])

  // Stagger pill reveal after typewriter completes
  const handleTypewriterComplete = useCallback(() => {
    setTypewriterDone(true)
    let cumulative = 0
    PILL_DELAYS.forEach((delay, i) => {
      cumulative += delay
      const timer = setTimeout(() => {
        setVisiblePills((prev) => [...prev, i])
      }, cumulative)
      pillTimersRef.current.push(timer)
    })
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || isWorking) return
    onAIGenerate(trimmed)
  }

  const handleCancel = () => {
    onCancel()
  }

  const suffix = classifiedType ? SUBJECT_TYPE_SUFFIX[classifiedType] : ''

  // Input state: completed (working + has text), typed (has text), default (empty)
  const isCompleted = isWorking && name.trim().length > 0
  const hasText = name.trim().length > 0

  return (
    <div className="fixed inset-0 bg-surface-primary z-50 overflow-auto">
      <BackgroundPattern />
      <div className="relative z-10">
        <GlobalNav />
        <div
          className="pl-[120px] pr-[80px] pt-[260px] pb-[200px]"
        >
          <div className="flex flex-col gap-[50px] items-start">
            {/* Step 1: Subject line */}
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-[50px] items-start">
                <div className="flex gap-[8px] items-center flex-wrap">
                  <span className="font-['Aleo'] text-[32px] text-text-secondary whitespace-nowrap leading-[1.25]">
                    Generate a timeline of
                  </span>
                  <div className="flex flex-col gap-[2px] items-center">
                    <div className="flex items-center gap-[8px]">
                      <input
                        ref={inputRef}
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onFocus={() => setInputFocused(true)}
                        onBlur={() => setInputFocused(false)}
                        placeholder={PLACEHOLDER_NAMES[placeholderIndex]}
                        disabled={isWorking}
                        className={[
                          "font-['Aleo'] text-[32px] leading-[1.25] outline-none rounded-[8px] px-[11px] py-[9px] transition-all duration-150 ease-in",
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
                            : Math.max(280, name.length * 19 + 30),
                          minWidth: isCompleted && !inputFocused ? undefined : 280,
                        }}
                      />
                      {suffix && (
                        <span className="font-['Aleo'] text-[32px] text-text-tertiary whitespace-nowrap leading-[1.25]">
                          {suffix}
                        </span>
                      )}
                    </div>
                    {/* Type subtext */}
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
                  </div>
                </div>

                {/* Button: Enter or Cancel */}
                <div>
                  {isWorking ? (
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="relative inline-flex items-center justify-center h-[42px] min-w-[80px] px-[17px] py-[10.5px] rounded-[12px] border border-[rgba(255,255,255,0.15)] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4)] font-avenir text-sm font-medium text-text-secondary text-center"
                    >
                      <div aria-hidden="true" className="absolute inset-0 rounded-[12px] backdrop-blur-[12px] bg-[rgba(255,255,255,0.1)] pointer-events-none" />
                      <span className="relative">Cancel</span>
                      <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] pointer-events-none" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!hasText}
                      className={[
                        'relative inline-flex items-center justify-center gap-[6px] h-[42px] min-w-[80px] px-[17px] py-[10.5px] rounded-[12px] border border-[rgba(255,255,255,0.15)] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4)] font-avenir text-sm font-medium text-text-secondary text-center transition-opacity',
                        hasText ? 'opacity-100' : 'opacity-50',
                        'disabled:cursor-not-allowed',
                      ].join(' ')}
                    >
                      <div aria-hidden="true" className="absolute inset-0 rounded-[12px] backdrop-blur-[12px] bg-[#2563eb] pointer-events-none" />
                      <span className="relative text-base">↵</span>
                      <span className="relative">Enter</span>
                      <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] pointer-events-none" />
                    </button>
                  )}
                </div>
              </div>
            </form>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            {/* Loading animation: typewriter + pills */}
            {isWorking && (
              <div className="flex flex-col gap-[8px] items-start">
                <p className="font-mono text-sm font-light text-text-tertiary leading-[1.4]">
                  <TypewriterText
                    text={TYPEWRITER_TEXT}
                    onComplete={handleTypewriterComplete}
                  />
                </p>
                {typewriterDone && categoryLabels.length > 0 && (
                  <div className="flex flex-col gap-[4px] items-start">
                    {categoryLabels.map((label, i) => (
                      <div
                        key={label}
                        className={[
                          'bg-[#171717] border border-[#171717] rounded-[8px] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4)] px-[9px] pt-[7px] pb-[6px]',
                          "font-['Aleo'] text-[18px] leading-[1.4] text-text-tertiary lowercase",
                          'transition-opacity duration-300',
                          visiblePills.includes(i) ? 'opacity-100' : 'opacity-0',
                        ].join(' ')}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Manual create escape hatch */}
            {!isWorking && (
              <button
                onClick={onManualCreate}
                className="text-sm text-text-tertiary hover:text-white underline underline-offset-2 transition-colors font-avenir"
              >
                Create my own timeline
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
