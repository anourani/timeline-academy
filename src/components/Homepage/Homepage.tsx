import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTimelines } from '../../hooks/useTimelines';
import { useTimelineMetadata } from '../../hooks/useTimelineMetadata';
import { supabase } from '../../lib/supabase';
import { AuthModal } from '../Auth/AuthModal';
import { ConfirmationModal } from '../Modal/ConfirmationModal';
import { HomepageNav } from './HomepageNav';
import { TimelineTile } from './TimelineTile';
import { EmptyState } from './EmptyState';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { utils, writeFile } from 'xlsx';

export function Homepage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { timelines, isLoading, error, loadTimelines } = useTimelines();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [timelineToDelete, setTimelineToDelete] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  const timelineIds = useMemo(
    () => timelines.map(t => t.id),
    [timelines]
  );
  const metadata = useTimelineMetadata(timelineIds);

  const handleTileClick = (timelineId: string) => {
    navigate('/', { state: { timelineId } });
  };

  const handleGetStarted = () => {
    navigate('/', { state: { timelineId: 'new' } });
  };

  const handleAuthClick = (signUp: boolean) => {
    setIsSignUp(signUp);
    setShowAuthModal(true);
  };

  const handleDownloadTemplate = () => {
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
    setShowDeleteConfirmation(true);
  };

  const renderTimelines = () => {
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
    <div className="min-h-screen bg-black text-white">
      <HomepageNav
        onSignInClick={() => handleAuthClick(false)}
        onSignUpClick={() => handleAuthClick(true)}
      />
      <main className="max-w-3xl mx-auto px-8 pt-16 pb-20">
        {/* Select A Path Forward */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold text-center text-white mb-6">
            Select A Path Forward
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-[#1A1A1A] border-gray-800 text-white flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">Build From Scratch</CardTitle>
                <CardDescription className="text-gray-400 text-sm leading-relaxed">
                  Build a timeline from scratch or import a pre-filled excel file in the format of our{' '}
                  <button
                    onClick={handleDownloadTemplate}
                    className="underline underline-offset-2 hover:text-white transition-colors"
                  >
                    template
                  </button>
                  .
                </CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGetStarted}
                >
                  Get Started
                </Button>
              </CardFooter>
            </Card>

            <Card className="bg-[#1A1A1A] border-gray-800 text-white flex flex-col">
              <CardHeader>
                <CardTitle className="text-lg">Build with AI</CardTitle>
                <CardDescription className="text-gray-400 text-sm leading-relaxed">
                  Consider this a jump start. Type any name or event and we will build a timeline of that individual or event.
                </CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto">
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                >
                  Coming Soon
                </Button>
              </CardFooter>
            </Card>
          </div>
        </section>

        {/* Your Timelines */}
        <section>
          <h2 className="text-xl font-semibold text-center text-white mb-6">
            Your Timelines
          </h2>
          {renderTimelines()}
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
