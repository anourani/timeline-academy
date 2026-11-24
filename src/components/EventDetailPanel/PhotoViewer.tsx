import { useRef, useState } from 'react'

export interface EventPhoto {
  url: string
  /** A smaller rendition for the thumbnail row; falls back to `url`. */
  thumbUrl?: string | null
  /** What the photo shows — from the file's description on Wikimedia. */
  caption?: string | null
  /** "Photo: Author / Licence", as `wikipediaImage.ts` builds it. */
  attribution: string | null
}

interface PhotoViewerProps {
  photos: EventPhoto[]
  /** The event title: the image's alt text when it has no caption. */
  title: string
  /** The lookup is still running — there may be a photo coming. */
  searching: boolean
  /** Category colour, for the selected thumbnail's ring. */
  accent: string
}

/** How far a drag must travel before it counts as a swipe, in px. */
const SWIPE_THRESHOLD = 40

/**
 * The event view's photos: one large frame, a caption and credit on its lower
 * edge, and — when there is more than one — a row of thumbnails underneath.
 *
 * Full-bleed and 300px tall below `lg`; a 5:3 rounded frame in the right-hand
 * column from `lg` up. Changing photo crossfades. Left/Right move between
 * photos while focus is inside the viewer — never between events, which the
 * view deliberately does not do (docs/2026-11-24-event-view-prd.md §2).
 *
 * The page remounts this per event (`key`), which resets the index and the
 * loaded set. With no photos and nothing searching it renders nothing: an
 * empty frame is a picture of nothing.
 */
export function PhotoViewer({ photos, title, searching, accent }: PhotoViewerProps) {
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(new Set())
  const dragStartX = useRef<number | null>(null)

  const count = photos.length
  if (count === 0 && !searching) return null

  const current = Math.min(index, Math.max(0, count - 1))
  const photo = photos[current]
  const multiple = count > 1
  const go = (next: number) => setIndex(Math.max(0, Math.min(count - 1, next)))
  const markLoaded = (url: string) =>
    setLoaded((prev) => (prev.has(url) ? prev : new Set(prev).add(url)))
  const pulsing = searching || (!!photo && !loaded.has(photo.url))

  return (
    <div
      role="group"
      aria-label="Photos"
      onKeyDown={
        multiple
          ? (e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault()
                go(current + 1)
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault()
                go(current - 1)
              }
            }
          : undefined
      }
    >
      <div
        className="relative w-full h-[300px] lg:h-auto lg:aspect-[5/3] overflow-hidden bg-[#111111] lg:rounded-[14px] select-none"
        // Horizontal drags are ours; vertical ones still scroll the page.
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

        {photos.map((p, i) => (
          <img
            key={p.url}
            src={p.url}
            alt={i === current ? p.caption || title : ''}
            aria-hidden={i === current ? undefined : true}
            // Never send the page URL (a /view share link is the access
            // capability itself) to the image host.
            referrerPolicy="no-referrer"
            draggable={false}
            onLoad={() => markLoaded(p.url)}
            // A broken URL stops the wait like a successful one.
            onError={() => markLoaded(p.url)}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[450ms] ease-out ${
              i === current && loaded.has(p.url) ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}

        {photo && (photo.caption || photo.attribution || multiple) && (
          <div className="absolute inset-x-0 bottom-0 pt-[40px] pb-[12px] px-[20px] lg:px-[18px] bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                {photo.caption && (
                  <p className="m-0 font-['Avenir',sans-serif] text-[14px] lg:text-[15px] leading-[1.35] text-[#ECEEF1]">
                    {photo.caption}
                  </p>
                )}
                {photo.attribution && (
                  <p className="m-0 mt-[2px] label-xs-type1 text-[#C4C7CC] truncate">
                    {photo.attribution}
                  </p>
                )}
              </div>
              {multiple && (
                <span
                  aria-live="polite"
                  className="shrink-0 label-s-type1 text-[#ECEEF1] bg-black/55 rounded-[6px] px-[8px] py-[3px]"
                >
                  {current + 1} / {count}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {multiple && (
        <div className="mt-[10px] px-[20px] lg:px-0 flex gap-[8px] lg:gap-[10px] overflow-x-auto">
          {photos.map((p, i) => {
            const selected = i === current
            return (
              <button
                key={p.url}
                type="button"
                onClick={() => go(i)}
                aria-pressed={selected}
                aria-label={p.caption || `Photo ${i + 1} of ${count}`}
                className={`shrink-0 w-[58px] h-[44px] lg:w-auto lg:flex-1 lg:max-w-[140px] lg:h-[72px] rounded-[7px] lg:rounded-[8px] overflow-hidden border-2 bg-[#111111] transition-opacity duration-200 ${
                  selected ? 'opacity-100' : 'opacity-[0.55] hover:opacity-80 border-transparent'
                }`}
                style={selected ? { borderColor: accent } : undefined}
              >
                <img
                  src={p.thumbUrl || p.url}
                  alt=""
                  referrerPolicy="no-referrer"
                  draggable={false}
                  className="w-full h-full object-cover"
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
