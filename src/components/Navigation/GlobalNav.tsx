import { type CSSProperties } from 'react'
import { Columns3, PanelLeft, Plus, Settings as SettingsIcon } from 'lucide-react'
import { useSidePanel } from '@/hooks/useSidePanel'
import { Button } from '@/components/ui/button'
import { SaveStatusIndicator, type SaveStatus } from '@/components/SaveStatusIndicator/SaveStatusIndicator'
import { getTimelineYearRange } from '@/utils/timelineUtils'
import type { TimelineEvent } from '@/types/event'

interface GlobalNavProps {
  variant?: 'default' | 'timeline'
  timelineId?: string | null
  /** Timeline identity — only rendered on variant="timeline" */
  timelineTitle?: string
  onTimelineTitleChange?: (title: string) => void
  events?: TimelineEvent[]
  timelineAccentColor?: string
  /** Toolbar actions — only rendered on variant="timeline" */
  onAddEventClick?: () => void
  onEventsClick?: () => void
  onSettingsClick?: () => void
  activePanel?: 'events' | 'settings' | null
  onPresentMode?: () => void
  /** Save status — only rendered on variant="timeline" */
  saveStatus?: SaveStatus
  lastSavedTime?: Date
}

export function GlobalNav({
  variant = 'default',
  timelineId,
  timelineTitle,
  onTimelineTitleChange,
  events = [],
  timelineAccentColor = '#4196E4',
  onAddEventClick,
  onEventsClick,
  onSettingsClick,
  activePanel,
  onPresentMode,
  saveStatus,
  lastSavedTime,
}: GlobalNavProps) {
  const { isOpen: isPanelOpen, toggle: togglePanel } = useSidePanel()

  const handleShare = () => {
    if (timelineId) {
      const shareUrl = `${window.location.origin}/view/${timelineId}`
      navigator.clipboard.writeText(shareUrl)
      alert('Share link copied to clipboard!')
    }
  }

  // SaveStatusIndicator is hidden for now — flip to true to re-enable.
  const SHOW_SAVE_STATUS = false
  const showTitleCluster = variant === 'timeline' && typeof timelineTitle === 'string'
  const yearRange = showTitleCluster ? getTimelineYearRange(events) : ''
  const eventCount = events.length
  const eventCountLabel = `${eventCount} ${eventCount === 1 ? 'event' : 'events'}`

  return (
    <div>
      <div className="flex h-[80px] items-start gap-5 px-6 py-[22px] relative">
        {/* Left cluster: panel toggle + optional timeline identity */}
        <div className="flex items-start gap-5 min-w-0">
          <div
            className={`shrink-0 overflow-visible transition-[max-width,opacity,margin] duration-300 ease-out ${
              isPanelOpen ? 'max-w-0 opacity-0 pointer-events-none -ml-5' : 'max-w-[48px] opacity-100'
            }`}
            aria-hidden={isPanelOpen}
          >
            <button
              onClick={togglePanel}
              className="relative flex items-center justify-center p-1.5 rounded-lg border border-white/15 bg-white/10 backdrop-blur-[12px] text-[#c9ced4] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] hover:bg-white/20 hover:text-[#dadee5] transition-colors"
              aria-label="Open timelines panel"
              tabIndex={isPanelOpen ? -1 : 0}
            >
              <PanelLeft size={20} />
            </button>
          </div>

          {showTitleCluster && (
            <div className="flex flex-col gap-1 min-w-0">
              {onTimelineTitleChange ? (
                <input
                  type="text"
                  value={timelineTitle ?? ''}
                  onChange={(e) => onTimelineTitleChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur()
                    }
                  }}
                  placeholder="Untitled Timeline"
                  aria-label="Timeline name"
                  size={Math.max((timelineTitle ?? '').length, 'Untitled Timeline'.length)}
                  className="font-['Aleo',serif] font-normal text-[18px] leading-[1.4] text-text-secondary hover:text-text-primary focus:text-text-primary bg-transparent border-none outline-none caret-white min-w-0 p-0"
                  style={{ fieldSizing: 'content' } as CSSProperties}
                />
              ) : (
                <p className="font-['Aleo',serif] font-normal text-[18px] leading-[1.4] text-text-secondary truncate">
                  {timelineTitle || 'Untitled Timeline'}
                </p>
              )}
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-['JetBrains_Mono',monospace] font-light text-[12px] leading-[1.4] text-text-tertiary whitespace-nowrap">
                  {yearRange}
                </span>
                <span
                  className="rounded-full size-1.5 shrink-0"
                  style={{ backgroundColor: timelineAccentColor }}
                  aria-hidden
                />
                <span className="font-['JetBrains_Mono',monospace] font-light text-[12px] leading-[1.4] text-text-tertiary whitespace-nowrap">
                  {eventCountLabel}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Center cluster: editor action buttons */}
        {variant === 'timeline' && (
          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-2.5">
            {onAddEventClick && (
              <Button variant="glass" size="none" onClick={onAddEventClick}>
                <Plus size={18} />
                Add Event
              </Button>
            )}
            <Button
              variant="glass"
              size="none"
              data-active={activePanel === 'events'}
              onClick={onEventsClick}
            >
              <Columns3 size={18} />
              Events
            </Button>
            <Button
              variant="glass"
              size="none"
              data-active={activePanel === 'settings'}
              onClick={onSettingsClick}
            >
              <SettingsIcon size={18} />
              Settings
            </Button>
          </div>
        )}

        {/* Right cluster: save status + action buttons */}
        <div className="ml-auto flex items-center gap-2">
          {/* SaveStatusIndicator hidden for now — keeping wiring in place for future reuse */}
          {SHOW_SAVE_STATUS && variant === 'timeline' && saveStatus && (
            <div className="hidden md:block mr-2">
              <SaveStatusIndicator status={saveStatus} lastSaved={lastSavedTime} />
            </div>
          )}
          {variant === 'timeline' && (
            <>
              <Button
                variant="glass-sm"
                size="none"
                onClick={onPresentMode}
              >
                Present
              </Button>
              <Button
                variant="glass-sm"
                size="none"
                onClick={handleShare}
                disabled={!timelineId}
              >
                Share
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
