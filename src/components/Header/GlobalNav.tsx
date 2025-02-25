import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface GlobalNavProps {
  onViewTimelinesClick: () => void;
  onSignInClick: () => void;
  onSignUpClick: () => void;
  timelineId: string | null;
}

export function GlobalNav({ 
  onViewTimelinesClick, 
  onSignInClick, 
  onSignUpClick,
  timelineId
}: GlobalNavProps) {
  const { user } = useAuth();
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const handlePresentMode = () => {
    if (timelineId) {
      window.open(`/view/${timelineId}`, '_blank');
    }
  };

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

  return (
    <div className="bg-black border-b border-gray-800">
      <div className="mx-auto px-8 py-2 flex justify-between items-center relative">
        {/* Left side - Menu button */}
        <button
          onClick={onViewTimelinesClick}
          className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-lg"
          aria-label="View Timelines"
        >
          <Menu size={20} />
        </button>

        {/* Center - Logo */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
          <div className="text-[16pt] text-[#FBFBFB] font-['Droid_Serif'] leading-[1.15] pt-2">
            timeline.academy
          </div>
        </div>

        {/* Right side - Controls */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleFeedbackClick}
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            Feedback
          </button>

          <button
            onClick={handlePresentMode}
            className="text-gray-400 hover:text-white transition-colors text-sm"
            disabled={!timelineId}
          >
            Present Mode
          </button>

          <button
            onClick={handleShare}
            disabled={!timelineId}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Share
          </button>
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
    </div>
  );
}