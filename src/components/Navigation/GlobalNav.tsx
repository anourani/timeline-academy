import { useState } from 'react'
import { Video } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FeedbackPanel } from '@/components/FeedbackPanel/FeedbackPanel'

interface GlobalNavProps {
  variant?: 'default' | 'timeline'
  onPresentMode?: () => void
  timelineId?: string | null
}

export function GlobalNav({
  variant = 'default',
  onPresentMode,
  timelineId,
}: GlobalNavProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
  const [isVideoTutorialOpen, setIsVideoTutorialOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const handleShare = () => {
    if (timelineId) {
      const shareUrl = `${window.location.origin}/view/${timelineId}`
      navigator.clipboard.writeText(shareUrl)
      alert('Share link copied to clipboard!')
    }
  }

  return (
    <div className="bg-black">
      <div className="flex h-[60px] items-center justify-between px-6 py-3">
        <div className="flex items-center">
          <Button
            variant={variant === 'timeline' ? 'glass' : 'glass-sm'}
            size="none"
            onClick={() => navigate('/')}
          >
            Timelines
          </Button>
        </div>

        <div className="flex items-center gap-2">
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
                    onClick={handleSignOut}
                  >
                    Log Out
                  </Button>
                </>
              )}
            </>
          )}

          {variant === 'timeline' && (
            <>
              <Button
                variant="glass"
                size="none"
                onClick={() => setIsFeedbackOpen(true)}
              >
                Feedback
              </Button>
              <Button
                variant="glass"
                size="none"
                onClick={onPresentMode}
              >
                Present
              </Button>
              <Button
                variant="glass"
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
