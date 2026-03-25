import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTimelines } from '../../hooks/useTimelines';
import { useTimelineMetadata } from '../../hooks/useTimelineMetadata';
import { supabase } from '../../lib/supabase';
import { AuthModal } from '../Auth/AuthModal';
import { ConfirmationModal } from '../Modal/ConfirmationModal';
import { GlobalNav } from '@/components/Navigation/GlobalNav';
import { TimelineTile } from './TimelineTile';
import { EmptyState } from './EmptyState';
import { Button } from '@/components/ui/button';
import { utils, writeFile } from 'xlsx';
import { getAllDrafts, deleteDraft as deleteLocalDraft } from '../../utils/draftStorage';
import { getTimelineYearRange } from '../../utils/timelineUtils';
import type { LocalDraft } from '../../utils/draftStorage';
import type { User } from '@supabase/supabase-js';

function getUserFirstName(user: User): string | null {
  const meta = user.user_metadata
  if (meta?.full_name) return meta.full_name.split(' ')[0]
  if (meta?.name) return meta.name.split(' ')[0]
  return null
}

export function Homepage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { timelines, isLoading, error, loadTimelines } = useTimelines();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [timelineToDelete, setTimelineToDelete] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [localDrafts, setLocalDrafts] = useState<LocalDraft[]>([]);
  const [deletingLocalDraft, setDeletingLocalDraft] = useState(false);

  const timelineIds = useMemo(
    () => timelines.map(t => t.id),
    [timelines]
  );
  const metadata = useTimelineMetadata(timelineIds);

  const firstName = user ? getUserFirstName(user) : null

  // Load local drafts for logged-out users
  useEffect(() => {
    if (!user) {
      setLocalDrafts(getAllDrafts());
    } else {
      setLocalDrafts([]);
    }
  }, [user]);

  const currentCount = user ? timelines.length : localDrafts.length;
  const atLimit = currentCount >= 3;

  const handleTileClick = (timelineId: string) => {
    navigate('/editor', { state: { timelineId } });
  };

  const handleLocalDraftClick = (draftId: string) => {
    navigate('/editor', { state: { draftId } });
  };

  const handleGetStarted = () => {
    if (user) {
      navigate('/editor', { state: { timelineId: 'new', skipCreationScreen: true } });
    } else {
      navigate('/editor', { state: { newTimeline: true, skipCreationScreen: true } });
    }
  };

  const handleBuildWithAI = () => {
    if (user) {
      navigate('/editor', { state: { timelineId: 'new' } });
    } else {
      navigate('/editor', { state: { newTimeline: true } });
    }
  };

  const handleAuthClick = (signUp: boolean) => {
    setIsSignUp(signUp);
    setShowAuthModal(true);
  };

  const handleDownloadTemplate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const wb = utils.book_new();
    const headers = ['Event Title', 'Start Date', 'End Date', 'Category'];
    const instructions = [
      '55 char limit',
      'Format: MM/DD/YYYY',
      'Format: MM/DD/YYYY',
      'Must match a timeline category'
    ];
    const data = [
      headers,
      instructions,
      ['Sample Event 1', '1/15/2024', '1/20/2024', 'Personal Life'],
      ['Sample Event 2', '10/14/2024', '10/16/2024', 'Career']
    ];
    const ws = utils.aoa_to_sheet(data);
    utils.book_append_sheet(wb, ws, 'Timeline Events');
    writeFile(wb, 'timeline-template.xlsx');
  };

  const handleShareTimeline = (id: string) => {
    const shareUrl = `${window.location.origin}/view/${id}`;
    navigator.clipboard.writeText(shareUrl);
    alert('Share link copied to clipboard!');
  };

  const handleDuplicateTimeline = async (id: string) => {
    if (!user) return;
    try {
      const { data: original, error: fetchError } = await supabase
        .from('timelines')
        .select('*')
        .eq('id', id)
        .single();
      if (fetchError || !original) throw fetchError;

      const { data: newTimeline, error: createError } = await supabase
        .from('timelines')
        .insert({
          title: `${original.title} (Copy)`,
          user_id: user.id,
          scale: original.scale,
        })
        .select()
        .single();
      if (createError || !newTimeline) throw createError;

      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('timeline_id', id);
      if (eventsError) throw eventsError;

      if (events && events.length > 0) {
        const newEvents = events.map((event) => ({
          title: event.title,
          start_date: event.start_date,
          end_date: event.end_date,
          category: event.category,
          timeline_id: newTimeline.id,
        }));
        const { error: insertError } = await supabase
          .from('events')
          .insert(newEvents);
        if (insertError) throw insertError;
      }

      loadTimelines();
    } catch (err) {
      console.error('Error duplicating timeline:', err);
      alert('Failed to duplicate timeline. Please try again.');
    }
  };

  const handleDeleteTimeline = async () => {
    if (!timelineToDelete) return;

    // Check if this is a local draft deletion
    if (deletingLocalDraft) {
      deleteLocalDraft(timelineToDelete);
      setLocalDrafts(getAllDrafts());
      setTimelineToDelete(null);
      setShowDeleteConfirmation(false);
      setDeletingLocalDraft(false);
      return;
    }

    try {
      const { error: deleteError } = await supabase
        .from('timelines')
        .delete()
        .eq('id', timelineToDelete);
      if (deleteError) throw deleteError;
      loadTimelines();
    } catch (err) {
      console.error('Error deleting timeline:', err);
      alert('Failed to delete timeline. Please try again.');
    } finally {
      setTimelineToDelete(null);
      setShowDeleteConfirmation(false);
    }
  };

  const confirmDeleteTimeline = (id: string) => {
    setTimelineToDelete(id);
    setDeletingLocalDraft(false);
    setShowDeleteConfirmation(true);
  };

  const confirmDeleteLocalDraft = (id: string) => {
    setTimelineToDelete(id);
    setDeletingLocalDraft(true);
    setShowDeleteConfirmation(true);
  };

  const renderTimelinesContent = () => {
    // Logged-out users: show local drafts or empty state
    if (!user) {
      if (localDrafts.length === 0) {
        return (
          <EmptyState
            variant="logged-out"
            onSignInClick={() => handleAuthClick(false)}
            onSignUpClick={() => handleAuthClick(true)}
          />
        );
      }

      return (
        <div className="flex flex-col gap-3">
          {localDrafts.map(draft => {
            const yearRange = draft.events.length > 0
              ? getTimelineYearRange(draft.events)
              : '';
            return (
              <TimelineTile
                key={draft.id}
                id={draft.id}
                title={draft.title}
                eventCount={draft.events.length}
                yearRange={yearRange}
                onClick={() => handleLocalDraftClick(draft.id)}
                onDelete={confirmDeleteLocalDraft}
                hideShare
                hideDuplicate
              />
            );
          })}
          <p className="text-text-tertiary text-sm text-center mt-2">
            Timelines are saved to this browser.{' '}
            <button
              onClick={() => handleAuthClick(true)}
              className="text-blue-400 underline hover:text-blue-300 transition-colors"
            >
              Sign up
            </button>
            {' '}to sync across devices.
          </p>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="text-text-tertiary text-center py-8">Loading timelines...</div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-8">
          <p className="text-red-400 mb-4">{error}</p>
          <Button
            variant="outline"
            onClick={() => loadTimelines()}
          >
            Try Again
          </Button>
        </div>
      );
    }

    if (timelines.length === 0) {
      return (
        <EmptyState variant="no-timelines" />
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {timelines.map(timeline => {
          const meta = metadata.get(timeline.id);
          return (
            <TimelineTile
              key={timeline.id}
              id={timeline.id}
              title={timeline.title}
              eventCount={meta?.eventCount ?? 0}
              yearRange={meta?.yearRange ?? ''}
              dominantCategoryColor={meta?.dominantCategoryColor}
              onClick={() => handleTileClick(timeline.id)}
              onShare={handleShareTimeline}
              onDuplicate={handleDuplicateTimeline}
              onDelete={confirmDeleteTimeline}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-surface-primary text-white">
      <GlobalNav />
      <main className="max-w-[792px] mx-auto px-8 pt-[72px] pb-20">
        {/* Welcome Heading */}
        <h1 className="header-medium text-text-primary text-center mb-8">
          {firstName ? `Welcome, ${firstName}` : 'Welcome'}
        </h1>

        {/* Start a New Timeline */}
        <section className="mb-6">
          <div className="flex flex-col gap-3 bg-[#151617] rounded-[20px] pt-5 pb-4 px-4 shadow-[inset_4px_4px_24px_0px_rgba(156,163,175,0.1)]">
            <h2 className="header-xsmall text-text-secondary">
              Start a New Timeline
            </h2>
            {atLimit ? (
              <p className="font-avenir text-sm leading-5 text-[#9b9ea3] py-2">
                You've reached the 3-timeline limit. Delete an existing timeline to create a new one.
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row items-stretch gap-4 w-full">
                <button
                  onClick={handleGetStarted}
                  className="flex-1 flex flex-col gap-1 bg-neutral-950 rounded-xl border border-neutral-800 p-4 text-left cursor-pointer hover:border-neutral-600 transition-colors"
                >
                  <h3 className="header-xsmall text-[#dadee5]">Build From Scratch</h3>
                  <p className="font-avenir text-sm leading-5 text-[#9b9ea3]">
                    Build a timeline from scratch or import a pre-filled excel file in the format of our{' '}
                    <span
                      onClick={handleDownloadTemplate}
                      className="underline underline-offset-2 hover:text-text-primary transition-colors cursor-pointer"
                    >
                      template
                    </span>
                    .
                  </p>
                </button>

                <button
                  onClick={handleBuildWithAI}
                  className="flex-1 flex flex-col gap-1 bg-neutral-950 rounded-xl border border-neutral-800 p-4 text-left cursor-pointer hover:border-neutral-600 transition-colors"
                >
                  <h3 className="header-xsmall text-[#dadee5]">Build with AI</h3>
                  <p className="font-avenir text-sm leading-5 text-[#9b9ea3]">
                    Use AI as a jump start to build out a timeline of any well-known individual or event.
                  </p>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Your Timelines */}
        <section>
          <h2 className="header-xsmall text-text-secondary mb-4">
            Your Timelines
          </h2>
          {renderTimelinesContent()}
        </section>
      </main>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultIsSignUp={isSignUp}
      />

      <ConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={() => {
          setShowDeleteConfirmation(false);
          setTimelineToDelete(null);
          setDeletingLocalDraft(false);
        }}
        onConfirm={handleDeleteTimeline}
        title="Delete Timeline"
        message="Are you sure you want to delete this timeline? This action cannot be undone."
        confirmLabel="Delete Timeline"
        cancelLabel="Cancel"
      />
    </div>
  );
}
