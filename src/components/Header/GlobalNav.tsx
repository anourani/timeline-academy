import React, { useState } from 'react';
import { PanelLeft, Play, X, Video } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Modal } from '../Modal/Modal';

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
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isVideoTutorialOpen, setIsVideoTutorialOpen] = useState(false);

  const handleShare = () => {
    if (timelineId) {
      const shareUrl = `${window.location.origin}/view/${timelineId}`;
      navigator.clipboard.writeText(shareUrl);
      alert('Share link copied to clipboard!');
    }
  };

  const handleFeedbackClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsHelpOpen(true);
  };

  const handleEmailClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const mailtoLink = "mailto:alex@timeline.academy?subject=" + encodeURIComponent("I'm a timeline.academy user. Here's my feedback");
    window.location.href = mailtoLink;
  };

  const handleVideoTutorialClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsVideoTutorialOpen(true);
  };

  return (
    <div className="bg-black">
      <div className="mx-auto px-8 py-2 flex justify-between items-center relative">
        {/* Left side - Sidebar toggle and breadcrumbs */}
        <div className="flex items-center gap-3">
          <button
            onClick={onViewTimelinesClick}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"
            aria-label="View Timelines"
          >
            <PanelLeft size={20} />
          </button>
          {user ? (
            <div className="flex items-center text-sm">
              <span className="text-gray-400">Timelines</span>
              <span className="text-gray-500 mx-1.5">/</span>
              <span className="text-white font-medium">{title}</span>
            </div>
          ) : (
            <span className="text-gray-400 text-sm">Timelines</span>
          )}
        </div>

        {/* Right side - Controls */}
        <div className="flex items-center gap-4">
          {!user && (
            <button
              onClick={handleVideoTutorialClick}
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              How it Works
            </button>
          )}

          <button
            onClick={handleFeedbackClick}
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            Feedback
          </button>

          {user && (
            <button
              onClick={onPresentMode}
              className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1.5"
            >
              <Play size={16} />
              Present
            </button>
          )}

          {user && (
            <button
              onClick={handleShare}
              disabled={!timelineId}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Share
            </button>
          )}
        </div>
      </div>

      {/* Feedback Panel */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-250 ease-in-out ${
          isHelpOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsHelpOpen(false)}
      />
      
      <div 
        className={`fixed right-0 top-0 h-full w-[400px] min-w-[360px] bg-gray-800 z-50 shadow-xl transform transition-transform duration-250 ease-in-out ${
          isHelpOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Feedback</h2>
          <button
            onClick={() => setIsHelpOpen(false)}
            className="text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-gray-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 text-gray-300 space-y-4">
          <p className="text-white font-medium">Hi, I'm Alex.</p>
          
          <p>
            I'm obsessed with timelines and how they transform the way we understand information. They turn isolated moments into visual stories that reveal hidden patterns and connections.
          </p>
          
          <p>
            Timeline.academy is my attempt to create the timeline tool I've always wanted - one that's visually clean, simple to manage, and functionally intuitive.
          </p>

          <p>
            I'm looking for feedback! The best products grow through their community. I'd love to hear your thoughts on how to make timeline.academy better – your feedback will help shape its future.
          </p>

          <p>
            Thanks!
          </p>

          <div className="pt-4 space-y-3">
            <button
              onClick={handleEmailClick}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Give Feedback
            </button>

            <a 
              href="https://buymeacoffee.com/ttjs81madp" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full py-2 px-4 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
            >
              Buy me a coffee
            </a>
          </div>
        </div>
      </div>

      {/* Video Tutorial Modal */}
      <Modal
        isOpen={isVideoTutorialOpen}
        onClose={() => setIsVideoTutorialOpen(false)}
        title="Quick Tutorial to Get Started"
      >
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
      </Modal>
    </div>
  );
}