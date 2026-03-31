import React, { useState, useEffect, useRef, useCallback } from 'react'
import { GlobalNav } from '@/components/Navigation/GlobalNav'
import { SUBJECT_TYPE_SUFFIX } from '@/constants/pillDefinitions'
import type { SubjectType } from '@/constants/pillDefinitions'

interface NewTimelineScreenProps {
  onAIGenerate: (subject: string) => void
  onClassify: (subject: string) => void
  onManualCreate: () => void
  onSubjectChange: () => void
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

function SineWaveLoader() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cols = 12
    const rows = 3
    const cellSize = 12
    const gap = 1
    const totalWidth = cols * (cellSize + gap) - gap
    const totalHeight = rows * (cellSize + gap) - gap

    canvas.width = totalWidth
    canvas.height = totalHeight

    const baseColor = { r: 65, g: 150, b: 228 } // #4196E4
    const opacityLevels = [1, 0.75, 0.5, 0.25, 0.1]

    let offset = 0

    function draw() {
      if (!ctx) return
      ctx.clearRect(0, 0, totalWidth, totalHeight)

      for (let col = 0; col < cols; col++) {
        // Sine wave determines which row is brightest for this column
        const wave = Math.sin((col + offset) * 0.5) * 1 + 1 // range 0-2

        for (let row = 0; row < rows; row++) {
          const distance = Math.abs(row - wave)
          const opacityIndex = Math.min(
            Math.floor(distance * 1.5),
            opacityLevels.length - 1
          )
          const opacity = opacityLevels[opacityIndex]

          const x = col * (cellSize + gap)
          const y = row * (cellSize + gap)

          ctx.fillStyle = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, ${opacity})`
          ctx.fillRect(x, y, cellSize, cellSize)
        }
      }

      offset += 0.08
      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animationRef.current)
    }
  }, [])

  return <canvas ref={canvasRef} className="mt-8" />
}

export function NewTimelineScreen({
  onAIGenerate,
  onClassify,
  onManualCreate,
  onSubjectChange,
  isGenerating,
  isClassifying,
  classifiedType,
  categoryLabels,
  error,
}: NewTimelineScreenProps) {
  const [name, setName] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastClassifiedName = useRef<string>('')

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_NAMES.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value
    setName(newName)
    // Reset classification if subject changes after classification
    if (classifiedType && newName.trim() !== lastClassifiedName.current) {
      onSubjectChange()
      lastClassifiedName.current = ''
    }
  }, [classifiedType, onSubjectChange])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || isClassifying || isGenerating) return

    if (!classifiedType) {
      // First Enter: classify
      lastClassifiedName.current = trimmed
      onClassify(trimmed)
    } else {
      // Second Enter: generate
      onAIGenerate(trimmed)
    }
  }

  const suffix = classifiedType ? SUBJECT_TYPE_SUFFIX[classifiedType] : ''
  const isActive = classifiedType !== null
  const showCategories = isGenerating && categoryLabels.length > 0

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] z-50 overflow-auto">
      <GlobalNav />
      <div
        className="transition-all duration-500 ease-out"
        style={{ paddingTop: showCategories ? 110 : 260, paddingLeft: 200, paddingRight: 80 }}
      >
        {/* Subject line */}
        <form onSubmit={handleSubmit}>
          <div className="flex items-baseline flex-wrap gap-y-2">
            <span className="font-['Aleo'] text-[32px] text-[#c9ced4] whitespace-nowrap mr-3">
              Generate a timeline of
            </span>
            <div className="inline-flex items-baseline">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder={PLACEHOLDER_NAMES[placeholderIndex]}
                disabled={isGenerating}
                className={`font-['Aleo'] text-[32px] text-[#c9ced4] placeholder-[#6b6f76] outline-none rounded-[8px] px-3 py-1 transition-colors ${
                  name.trim()
                    ? 'bg-[#262626] border border-[#3d3e40]'
                    : 'bg-[#171717] border border-[#171717]'
                } disabled:opacity-50`}
                style={{ width: Math.max(180, name.length * 19 + 40) }}
              />
              {suffix && (
                <span className="font-['Aleo'] text-[32px] text-[#6b6f76] ml-2 whitespace-nowrap">
                  {suffix}
                </span>
              )}
            </div>
          </div>

          {/* Type subtext */}
          <div className="mt-1 flex items-center gap-1 font-avenir text-sm" style={{ paddingLeft: 'calc(32px * 13.5)' }}>
            {TYPE_LABELS.map((t, i) => (
              <span key={t.key}>
                {i > 0 && <span className="text-[#9b9ea3] mx-0.5">/</span>}
                <span
                  className={
                    classifiedType === t.key ? 'text-[#dadee5]' : 'text-[#9b9ea3]'
                  }
                >
                  {t.display}
                </span>
              </span>
            ))}
          </div>

          {/* "through the lens of" + category pills */}
          <div
            className="mt-6 transition-opacity duration-500"
            style={{ opacity: showCategories ? 1 : 0 }}
          >
            <p className="font-['Aleo'] text-[32px] text-[#c9ced4] mb-3">
              through the lens of
            </p>
            <div className="flex items-center flex-wrap gap-2">
              {categoryLabels.map((label, i) => (
                <span key={label} className="flex items-center">
                  <span className="font-['Aleo'] text-[24px] text-[#c9ced4] bg-[#171717] border border-[#171717] rounded-[8px] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4)] px-[11px] py-[8px] lowercase">
                    {label}
                  </span>
                  {i < categoryLabels.length - 1 && (
                    <span className="font-['Aleo'] text-[24px] text-[#c9ced4] mx-1">
                      {i === categoryLabels.length - 2 ? ' and' : ' ,'}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Enter button */}
          <div className="mt-6">
            <button
              type="submit"
              disabled={!name.trim() || isClassifying || isGenerating}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-avenir text-sm font-medium text-white backdrop-blur-[12px] transition-all ${
                isActive && !isGenerating
                  ? 'bg-[rgba(37,99,235,0.8)] opacity-100'
                  : 'bg-[rgba(255,255,255,0.1)] opacity-50'
              } disabled:cursor-not-allowed`}
            >
              <span className="text-base">↵</span>
              {isClassifying ? 'Classifying...' : 'Enter'}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <p className="mt-4 text-sm text-red-400">{error}</p>
        )}

        {/* Sine wave loader */}
        {isGenerating && <SineWaveLoader />}

        {/* Manual create escape hatch */}
        {!isGenerating && !isClassifying && (
          <button
            onClick={onManualCreate}
            className="mt-8 text-sm text-[#9b9ea3] hover:text-white underline underline-offset-2 transition-colors font-avenir"
          >
            Create my own timeline
          </button>
        )}
      </div>
    </div>
  )
}
