import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTimelines } from '../../hooks/useTimelines';
import { useTimelineMetadata } from '../../hooks/useTimelineMetadata';
import { AuthModal } from '../Auth/AuthModal';
import { HomepageNav } from './HomepageNav';
import { TimelineTile } from './TimelineTile';
import { EmptyState } from './EmptyState';

const MAX_TIMELINES = 3;

export function Homepage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { timelines, isLoading, error, loadTimelines } = useTimelines();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const timelineIds = useMemo(
    () => timelines.map(t => t.id),
    [timelines]
  );
  const metadata = useTimelineMetadata(timelineIds);

  const handleTileClick = (timelineId: string) => {
    navigate('/', { state: { timelineId } });
  };

  const handleCreateTimeline = () => {
    navigate('/', { state: { timelineId: 'new' } });
  };

  const handleAuthClick = (signUp: boolean) => {
    setIsSignUp(signUp);
    setShowAuthModal(true);
  };

  const canCreate = timelines.length < MAX_TIMELINES;

  const renderContent = () => {
    if (!user) {
      return (
        <EmptyState
          variant="logged-out"
          onSignInClick={() => handleAuthClick(false)}
          onSignUpClick={() => handleAuthClick(true)}
        />
      );
    }

    if (isLoading) {
      return (
        <div className="text-gray-400 text-center py-8">Loading timelines...</div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-8">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => loadTimelines()}
            className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    if (timelines.length === 0) {
      return (
        <EmptyState
          variant="no-timelines"
          onCreateClick={handleCreateTimeline}
        />
      );
    }

    return (
      <div className="flex flex-col gap-4">
        {timelines.map(timeline => {
          const meta = metadata.get(timeline.id);
          return (
            <TimelineTile
              key={timeline.id}
              title={timeline.title}
              eventCount={meta?.eventCount ?? 0}
              yearRange={meta?.yearRange ?? ''}
              onClick={() => handleTileClick(timeline.id)}
            />
          );
        })}
        {canCreate && (
          <button
            onClick={handleCreateTimeline}
            className="w-full flex items-center justify-center gap-2 bg-[#1A1A1A] text-gray-400 hover:bg-[#252525] hover:text-white rounded-xl px-5 py-6 text-sm font-medium transition-all duration-200 ease-out border border-dashed border-gray-600 hover:border-gray-500"
          >
            <Plus size={18} />
            Create New Timeline
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <HomepageNav
        onSignInClick={() => handleAuthClick(false)}
        onSignUpClick={() => handleAuthClick(true)}
      />
      <main className="max-w-2xl mx-auto px-8 pt-16 pb-20">
        <h1 className="text-[48px] leading-[115%] text-[#F3F3F3] font-['Aleo'] font-medium tracking-[-0.01em] mb-12">
          Timelines
        </h1>
        {renderContent()}
      </main>
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultIsSignUp={isSignUp}
      />
    </div>
  );
}
