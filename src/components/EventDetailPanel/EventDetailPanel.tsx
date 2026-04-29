import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { TimelineEvent } from '../../types/event'

interface EventDetailPanelProps {
  isOpen: boolean
  event: TimelineEvent | null
  onClose: () => void
}

export function EventDetailPanel({ isOpen, event, onClose }: EventDetailPanelProps) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (typeof document === 'undefined') return null

  const sources = event?.sources?.filter(s => s.url) ?? []
  const hasDescription = !!event?.description?.trim()
  const hasSources = sources.length > 0

  return createPortal(
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-out ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-[320px] pr-[6px] py-[6px] transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!isOpen}
        aria-label="Event detail panel"
      >
        <div className="h-full w-full bg-[#171717] rounded-[6px] border border-[#262626] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2 border-b border-[#404040] shrink-0">
            <h2 className="header-xsmall text-[#c9ced4] m-0">Event</h2>
            <button
              onClick={onClose}
              className="relative flex items-center justify-center p-1.5 rounded-lg border border-white/15 bg-white/10 backdrop-blur-[12px] text-[#c9ced4] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] hover:bg-white/20 hover:text-[#dadee5] transition-colors"
              aria-label="Close event panel"
            >
              <X size={16} strokeWidth={1.25} />
            </button>
          </div>

          {/* Body */}
          {event && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="flex flex-col gap-6 px-5 pt-6 pb-2">
                {/* Image (or placeholder) */}
                {event.imageUrl ? (
                  <img
                    src={event.imageUrl}
                    alt=""
                    className="w-full aspect-[4/3] object-cover rounded-lg"
                  />
                ) : (
                  <div className="w-full aspect-[4/3] rounded-lg border border-[#262626] bg-[#0F0F0F]" />
                )}

                {/* Title */}
                <h3
                  className="header-xsmall m-0"
                  style={{ color: '#C9CED4', fontSize: 18 }}
                >
                  {event.title}
                </h3>

                {/* Description */}
                {hasDescription && (
                  <p className="body-m text-[#9B9EA3] whitespace-pre-wrap m-0">
                    {event.description}
                  </p>
                )}

                {/* Sources */}
                {hasSources && (
                  <div className="flex flex-col gap-2">
                    <span className="label-m-type2 text-[#9B9EA3]">Sources</span>
                    <div className="h-px bg-[#262626] w-full" />
                    {sources.map((source, idx) => (
                      <div key={`${source.url}-${idx}`} className="flex flex-col gap-2">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="body-m text-[#C9CED4] underline break-words hover:text-white"
                        >
                          {source.label.trim() || source.url}
                        </a>
                        {idx < sources.length - 1 && (
                          <div className="h-px bg-[#262626] w-full" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
    </>,
    document.body
  )
}
