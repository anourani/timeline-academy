import { useEffect, useState } from 'react'
import { ThinkingOrb } from 'thinking-orbs'

interface GeneratingIndicatorProps {
  subject: string
  phase: 'classifying' | 'generating'
  categoryLabels: string[]
}

// Generation is a single non-streaming Sonnet call, so there is no real
// progress to report. The copy instead tracks the two phases the hook does
// expose, then cycles the category labels it already resolved for the
// classified subject so a long wait still reads as specific work.
const GENERATING_HOLD_MS = 6000
const ROTATE_MS = 3500

export function GeneratingIndicator({
  subject,
  phase,
  categoryLabels,
}: GeneratingIndicatorProps) {
  const [step, setStep] = useState(0)
  const hasLabels = categoryLabels.length > 0

  // Depend on `hasLabels` rather than the array itself — a caller passing a
  // fresh `[]` literal would otherwise restart the rotation on every render.
  useEffect(() => {
    setStep(0)
    if (phase !== 'generating' || !hasLabels) return

    let rotate: ReturnType<typeof setInterval> | undefined
    const hold = setTimeout(() => {
      setStep(1)
      rotate = setInterval(() => setStep((s) => s + 1), ROTATE_MS)
    }, GENERATING_HOLD_MS)

    return () => {
      clearTimeout(hold)
      if (rotate) clearInterval(rotate)
    }
  }, [phase, hasLabels])

  const trimmedSubject = subject.trim()

  // Announced once per phase. The visible label rotates every few seconds,
  // which would make a live region chatty, so it stays aria-hidden and this
  // parallel message carries the announcement instead.
  const announcement =
    phase === 'classifying'
      ? `Researching ${trimmedSubject}`
      : 'Building the timeline'

  let message: string
  if (phase === 'classifying') {
    message = `Researching ${trimmedSubject}…`
  } else if (step === 0 || !hasLabels) {
    message = 'Building the timeline…'
  } else {
    message = `Gathering ${categoryLabels[(step - 1) % categoryLabels.length]}…`
  }

  return (
    <div className="mt-[24px] flex flex-col items-start gap-[10px] duration-150 ease-in fill-mode-forwards animate-in fade-in-0 slide-in-from-top-1">
      <div className="inline-flex items-center gap-[16px] max-w-full pl-[12px] pr-[28px] py-[12px] rounded-full border border-[#262626] bg-[rgba(184,184,184,0.04)] backdrop-blur-[4px] shadow-[0px_8px_32px_0px_rgba(155,158,163,0.04)]">
        <ThinkingOrb
          state="searching"
          size={64}
          theme="dark"
          aria-hidden="true"
          className="shrink-0"
        />
        <span
          aria-hidden="true"
          className="font-['Avenir',sans-serif] text-[20px] leading-[28px] text-text-tertiary whitespace-nowrap overflow-hidden text-ellipsis"
        >
          {message}
        </span>
      </div>

      <p className="body-m text-text-tertiary pl-[16px]">Press Esc to cancel</p>

      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </div>
  )
}
