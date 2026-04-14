import { useState } from 'react'
import { Columns3, Layers, PanelLeft, Plus, Settings as SettingsIcon, Video } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSidePanel } from '@/contexts/SidePanelContext'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FeedbackPanel } from '@/components/FeedbackPanel/FeedbackPanel'
import { SaveStatusIndicator, type SaveStatus } from '@/components/SaveStatusIndicator/SaveStatusIndicator'
import { getTimelineYearRange } from '@/utils/timelineUtils'
import type { TimelineEvent } from '@/types/event'

interface GlobalNavProps {
  variant?: 'default' | 'timeline'
  timelineId?: string | null
  /** Timeline identity — only rendered on variant="timeline" */
  timelineTitle?: string
  events?: TimelineEvent[]
  timelineAccentColor?: string
  /** Toolbar actions — only rendered on variant="timeline" */
  onAddEventClick?: () => void
  onEventsClick?: () => void
  onCategoriesClick?: () => void
  onSettingsClick?: () => void
  activePanel?: 'events' | 'categories' | 'settings' | null
  onPresentMode?: () => void
  /** Save status — only rendered on variant="timeline" */
  saveStatus?: SaveStatus
  lastSavedTime?: Date
}

export function GlobalNav({
  variant = 'default',
  timelineId,
  timelineTitle,
  events = [],
  timelineAccentColor = '#4196E4',
  onAddEventClick,
  onEventsClick,
  onCategoriesClick,
  onSettingsClick,
  activePanel,
  onPresentMode,
  saveStatus,
  lastSavedTime,
}: GlobalNavProps) {
  const { user } = useAuth()
  const { isOpen: isPanelOpen, toggle: togglePanel } = useSidePanel()
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
  const [isVideoTutorialOpen, setIsVideoTutorialOpen] = useState(false)

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
      <div className="flex h-[64px] items-center gap-5 px-6 py-4 relative">
        {/* Left cluster: panel toggle + optional timeline identity */}
        <div className="flex items-center gap-5 min-w-0">
          <div
            className={`overflow-hidden transition-[width,opacity,margin] duration-300 ease-out ${
              isPanelOpen ? 'w-0 opacity-0 pointer-events-none -ml-5' : 'w-8 opacity-100'
            }`}
            aria-hidden={isPanelOpen}
          >
            <button
              onClick={togglePanel}
              className="relative flex items-center justify-center p-1.5 rounded-md border border-white/15 bg-white/10 backdrop-blur-[12px] text-[#c9ced4] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] hover:bg-white/20 hover:text-[#dadee5] transition-colors"
              aria-label="Open timelines panel"
              tabIndex={isPanelOpen ? -1 : 0}
            >
              <PanelLeft size={20} />
            </button>
          </div>

          {showTitleCluster && (
            <div className="flex items-center gap-6 min-w-0">
              <p className="font-['Aleo:Regular',serif] font-normal text-[18px] leading-[1.4] text-[#9b9ea3] truncate">
                {timelineTitle || 'Untitled Timeline'}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-['JetBrains_Mono:Light',monospace] font-light text-[12px] leading-[1.4] text-[#c9ced4] whitespace-nowrap">
                  {yearRange}
                </span>
                <span
                  className="rounded-full size-1.5 shrink-0"
                  style={{ backgroundColor: timelineAccentColor }}
                  aria-hidden
                />
                <span className="font-['JetBrains_Mono:Light',monospace] font-light text-[12px] leading-[1.4] text-[#c9ced4] whitespace-nowrap">
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
              data-active={activePanel === 'categories'}
              onClick={onCategoriesClick}
            >
              <Layers size={18} />
              Categories
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
          {variant === 'default' && (
            <>
              <Button
                variant="glass-sm"
                size="none"
                onClick={() => setIsVideoTutorialOpen(true)}
              >
                How It Works
              </Button>
              {user && (
                <Button
                  variant="glass-sm"
                  size="none"
                  onClick={() => setIsFeedbackOpen(true)}
                >
                  Feedback
                </Button>
              )}
            </>
          )}

          {variant === 'timeline' && (
            <>
              <Button
                variant="glass-sm"
                size="none"
                onClick={() => setIsFeedbackOpen(true)}
              >
                Feedback
              </Button>
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

      <FeedbackPanel open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen} />

      <Dialog open={isVideoTutorialOpen} onOpenChange={setIsVideoTutorialOpen}>
        <DialogContent className="max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Quick Tutorial to Get Started</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              This video tutorial walks through how to start building your timeline by adding events, editing categories, customizing timeline settings, and importing or exporting data to build faster.
            </p>
            <div className="aspect-video">
              <a
                href="https://www.loom.com/share/f19575818a9341d4a266c482af981ba2"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-full bg-secondary rounded-lg flex items-center justify-center hover:bg-secondary/80 transition-colors"
              >
                <div className="text-center p-6">
                  <Video size={48} className="mx-auto mb-4" />
                  <p>Click to watch the tutorial video on Loom</p>
                  <p className="text-sm text-muted-foreground mt-2">The video will open in a new tab</p>
                </div>
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
