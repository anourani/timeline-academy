import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface PanelPhoto {
  url: string
  attribution: string | null
}

interface PhotoHeaderProps {
  photos: PanelPhoto[]
  date: string
  title: string
  /** The Wikipedia lookup is still in flight — there may be a photo coming. */
  searching: boolean
  /** The header's button cluster (Edit, Delete, mobile Close). */
  actions?: ReactNode
}

/** How far a drag must travel before it counts as a swipe, in px. */
const SWIPE_THRESHOLD = 40

/**
 * The top of the event detail panel: the photo, full-bleed, with the date and
 * title laid over its lower edge.
 *
 * Built for several photos — swipe on touch, arrows on hover from `md` up,
 * dots for position, a credit line that follows the current slide — though
 * every event stores one image today, so a single photo is the case that
 * actually runs. The panel remounts this per event (`key`), which is what
 * resets the slide index and the loaded set.
 *
 * With no photo — Wikipedia had none, or the lookup failed — it collapses to
 * a plain header: no empty frame, because an empty frame is a picture of
 * nothing. While the lookup is still running, the frame holds its full height
 * and pulses, so a photo arriving doesn't push the text down.
 */
export function PhotoHeader({ photos, date, title, searching, actions }: PhotoHeaderProps) {
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(new Set())
  const dragStartX = useRef<number | null>(null)

  const count = photos.length
  const current = Math.min(index, Math.max(0, count - 1))
  const photo = photos[current]
  const multiple = count > 1

  if (count === 0 && !searching) {
    return (
      <div className="flex flex-col gap-2 px-[20px] pt-[24px] shrink-0">
        <div className="flex items-center justify-between gap-3 min-h-[30px]">
          <p className="label-s-type1 text-[#9B9EA3] m-0">{date}</p>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
        <h2 className="header-small text-[#ECEEF1] m-0">{title}</h2>
      </div>
    )
  }

  const go = (next: number) => setIndex(Math.max(0, Math.min(count - 1, next)))
  const markLoaded = (url: string) =>
    setLoaded((prev) => (prev.has(url) ? prev : new Set(prev).add(url)))
  const pulsing = searching || (!!photo && !loaded.has(photo.url))

  return (
    <div className="shrink-0">
      {/* `shrink-0` is load-bearing, as it was on the old frame: this sits in
          a flex column that overflows as soon as a description arrives, and
          an aspect-ratio box has no min-content height to stop flexbox
          squeezing it to nothing. */}
      <div
        className="group relative w-full aspect-[3/2] max-h-[320px] overflow-hidden bg-[#0A0A0A] select-none"
        // Horizontal drags are ours; vertical ones still scroll the panel.
        style={{ touchAction: multiple ? 'pan-y' : undefined }}
        onPointerDown={multiple ? (e) => { dragStartX.current = e.clientX } : undefined}
        onPointerUp={
          multiple
            ? (e) => {
                if (dragStartX.current === null) return
                const dx = e.clientX - dragStartX.current
                dragStartX.current = null
                if (dx <= -SWIPE_THRESHOLD) go(current + 1)
                else if (dx >= SWIPE_THRESHOLD) go(current - 1)
              }
            : undefined
        }
        onPointerCancel={multiple ? () => { dragStartX.current = null } : undefined}
      >
        {pulsing && (
          <div aria-hidden="true" className="absolute inset-0 bg-white/[0.04] animate-pulse" />
        )}

        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {photos.map((p, i) => (
            <img
              key={p.url}
              src={p.url}
              alt={i === current ? title : ''}
              aria-hidden={i === current ? undefined : true}
              // Never send the page URL (a /view share link is the access
              // capability itself) to the image host.
              referrerPolicy="no-referrer"
              draggable={false}
              onLoad={() => markLoaded(p.url)}
              // A broken URL stops the wait like a successful one; pulsing at
              // an image that will never arrive is the bug the old frame fixed.
              onError={() => markLoaded(p.url)}
              className={`w-full h-full shrink-0 object-cover transition-opacity duration-300 ${
                loaded.has(p.url) ? 'opacity-100' : 'opacity-0'
              }`}
            />
          ))}
        </div>

        {/* Scrim for the date and title. From the card colour, so the photo
            runs into the panel instead of ending at a hard edge. */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[55%] pointer-events-none bg-gradient-to-t from-[#171717] via-[#171717]/60 to-transparent"
        />

        {actions && (
          <div className="absolute top-[12px] right-[12px] flex items-center gap-2">{actions}</div>
        )}

        {multiple && (
          <>
            <ArrowButton side="left" disabled={current === 0} onClick={() => go(current - 1)} />
            <ArrowButton side="right" disabled={current === count - 1} onClick={() => go(current + 1)} />
          </>
        )}

        <div className="absolute inset-x-0 bottom-0 px-[20px] pb-[12px] flex flex-col gap-1 pointer-events-none">
          <div className="flex items-center justify-between gap-3">
            <p className="label-s-type1 text-[#C4C7CC] m-0">{date}</p>
            {multiple && (
              <div aria-hidden="true" className="flex items-center gap-[6px]">
                {photos.map((p, i) => (
                  <span
                    key={p.url}
                    className={`h-[6px] rounded-full transition-all duration-200 ${
                      i === current ? 'w-[16px] bg-[#ECEEF1]' : 'w-[6px] bg-white/40'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
          <h2 className="header-small text-[#ECEEF1] m-0">{title}</h2>
        </div>
      </div>

      {photo?.attribution && (
        <p className="m-0 px-[20px] pt-[8px] font-['Avenir',sans-serif] text-[11px] leading-[140%] text-[#9B9EA3]">
          {photo.attribution}
        </p>
      )}
      {multiple && (
        <p className="sr-only" aria-live="polite">
          Photo {current + 1} of {count}
        </p>
      )}
    </div>
  )
}

function ArrowButton({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right'
  disabled: boolean
  onClick: () => void
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Previous photo' : 'Next photo'}
      // Desktop only: touch has the swipe. Hidden until the photo is hovered
      // or the button itself has keyboard focus.
      className={`hidden md:flex absolute top-1/2 -translate-y-1/2 ${
        side === 'left' ? 'left-[12px]' : 'right-[12px]'
      } items-center justify-center w-[32px] h-[32px] rounded-full border border-white/20 bg-black/55 text-[#ECEEF1] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-black/75 transition-opacity disabled:!opacity-0 disabled:pointer-events-none`}
    >
      <Icon size={16} strokeWidth={1.5} />
    </button>
  )
}
