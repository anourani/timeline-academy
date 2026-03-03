import { useState } from 'react';
import { PanelLeft, Play, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FeedbackPanel } from '@/components/FeedbackPanel/FeedbackPanel';

interface GlobalNavProps {
  onViewTimelinesClick: () => void;
  onSignInClick: () => void;
  onSignUpClick: () => void;
  onPresentMode: () => void;
  timelineId: string | null;
  title: string;
  onTitleChange: (title: string) => void;
}

export function GlobalNav({
  onViewTimelinesClick,
  onSignInClick,
  onSignUpClick,
  onPresentMode,
  timelineId,
  title,
  onTitleChange
}: GlobalNavProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isVideoTutorialOpen, setIsVideoTutorialOpen] = useState(false);

  const handleShare = () => {
    if (timelineId) {
      const shareUrl = `${window.location.origin}/view/${timelineId}`;
      navigator.clipboard.writeText(shareUrl);
      alert('Share link copied to clipboard!');
    }
  };

  return (
    <div className="bg-black">
      <div className="mx-auto px-8 py-2 flex justify-between items-center relative">
        {/* Left side - Sidebar toggle and breadcrumbs */}
        <div className="flex items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onViewTimelinesClick}
                  className="text-gray-400 hover:text-white hover:bg-gray-800"
                  aria-label="View Timelines"
                >
                  <PanelLeft size={20} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-gray-800 text-white border-gray-700">
                <p>View Timelines</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {user ? (
            <Breadcrumb>
              <BreadcrumbList className="text-sm">
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <button
                      onClick={() => navigate('/timelines')}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      Timelines
                    </button>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="text-gray-500" />
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-white font-medium">
                    {title}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          ) : (
            <button
              onClick={() => navigate('/timelines')}
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              Timelines
            </button>
          )}
        </div>

        {/* Right side - Controls */}
        <div className="flex items-center gap-4">
          {!user && (
            <Button
              variant="ghost"
              onClick={() => setIsVideoTutorialOpen(true)}
              className="text-gray-400 hover:text-white text-sm h-auto px-2 py-1"
            >
              How it Works
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={() => setIsFeedbackOpen(true)}
            className="text-gray-400 hover:text-white text-sm h-auto px-2 py-1"
          >
            Feedback
          </Button>

          {user && (
            <Button
              variant="ghost"
              onClick={onPresentMode}
              className="text-gray-400 hover:text-white text-sm h-auto px-2 py-1 gap-1.5"
            >
              <Play size={16} />
              Present
            </Button>
          )}

          {user && (
            <Button
              onClick={handleShare}
              disabled={!timelineId}
              className="bg-blue-600 text-white hover:bg-blue-700 text-sm h-auto px-4 py-1.5"
            >
              Share
            </Button>
          )}
        </div>
      </div>

      {/* Feedback Panel */}
      <FeedbackPanel open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen} />

      {/* Video Tutorial Dialog */}
      <Dialog open={isVideoTutorialOpen} onOpenChange={setIsVideoTutorialOpen}>
        <DialogContent className="bg-gray-800 border-gray-700 max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              Quick Tutorial to Get Started
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-300">
              This video tutorial walks through how to start building your timeline by adding events, editing categories, customizing timeline settings, and importing or exporting data to build faster.
            </p>

            <div className="aspect-video">
              <a
                href="https://www.loom.com/share/f19575818a9341d4a266c482af981ba2"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full h-full bg-gray-700 rounded-lg flex items-center justify-center text-white hover:bg-gray-600 transition-colors"
              >
                <div className="text-center p-6">
                  <Video size={48} className="mx-auto mb-4" />
                  <p>Click to watch the tutorial video on Loom</p>
                  <p className="text-sm text-gray-400 mt-2">The video will open in a new tab</p>
                </div>
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
