import React, { useState, useEffect } from 'react';
import { User, LogOut, AlertTriangle } from 'lucide-react';
import { ConfirmationModal } from '../Modal/ConfirmationModal';
import { useAuth } from '../../contexts/AuthContext';
import { useTimelines } from '../../hooks/useTimelines';
import { TimelineList } from '../Timeline/TimelineList';
import { AccountDetailsPanel } from './AccountDetailsPanel';
import { supabase } from '../../lib/supabase';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

type SubPanel = 'main' | 'account';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  timelineId: string | null;
  onTimelineSwitch: (timelineId: string) => void;
  onAuthClick: () => void;
}

export function SidePanel({
  isOpen,
  onClose,
  timelineId,
  onTimelineSwitch,
  onAuthClick
}: SidePanelProps) {
  const [currentPanel, setCurrentPanel] = useState<SubPanel>('main');
  const { user } = useAuth();
  const { timelines, isLoading, error, loadTimelines } = useTimelines();
  const [showSignOutConfirmation, setShowSignOutConfirmation] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [timelineToDelete, setTimelineToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && user) {
      loadTimelines();
    }
  }, [isOpen, user]);

  const handleTimelineSelect = (selectedTimelineId: string) => {
    if (selectedTimelineId !== timelineId) {
      onTimelineSwitch(selectedTimelineId);
      onClose();
    }
  };

  const handleCreateTimeline = () => {
    onTimelineSwitch('new');
    onClose();
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      onClose();
    } catch (error) {
      console.error('Error signing out:', error);
      alert('Failed to sign out. Please try again.');
    }
  };

  const handleAuthClick = () => {
    onAuthClick();
    onClose();
  };

  const handleDeleteTimeline = async () => {
    if (!timelineToDelete) return;
    try {
      const { error: deleteError } = await supabase
        .from('timelines')
        .delete()
        .eq('id', timelineToDelete);
      if (deleteError) throw deleteError;
      if (timelineToDelete === timelineId) {
        const remainingTimeline = timelines.find(t => t.id !== timelineToDelete);
        if (remainingTimeline) {
          onTimelineSwitch(remainingTimeline.id);
        } else {
          onTimelineSwitch('new');
        }
      }
      loadTimelines();
    } catch (error) {
      console.error('Error deleting timeline:', error);
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

  const renderContent = () => {
    if (!user) {
      return (
        <div className="text-center py-8 px-4">
          <h3 className="text-lg font-medium mb-2">
            Sign in to access your timelines
          </h3>
          <p className="text-muted-foreground mb-6">
            Create up to 3 timelines and access them from anywhere
          </p>
          <div className="space-y-2">
            <Button onClick={handleAuthClick} className="w-full">
              Sign In
            </Button>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-8 px-4">
          <div className="flex items-center justify-center gap-2 text-destructive mb-4">
            <AlertTriangle size={24} />
            <p className="text-lg font-medium">Connection Error</p>
          </div>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="secondary" onClick={() => loadTimelines()}>
            Try Again
          </Button>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="text-muted-foreground text-center py-4">Loading timelines...</div>
      );
    }

    return (
      <TimelineList
        timelines={timelines}
        activeTimelineId={timelineId}
        onTimelineSelect={handleTimelineSelect}
        onCreateTimeline={handleCreateTimeline}
        onDeleteTimeline={confirmDeleteTimeline}
      />
    );
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent side="left" className="w-[400px] min-w-[360px] p-0">
          <SheetDescription className="sr-only">Timeline navigation panel</SheetDescription>
          {currentPanel === 'main' ? (
            <div className="h-full flex flex-col">
              <SheetHeader className="px-6 py-4 border-b">
                <SheetTitle className="text-xl font-semibold">Timelines</SheetTitle>
              </SheetHeader>

              <div className="flex-1 overflow-auto p-4">
                {renderContent()}
              </div>

              {user && (
                <div className="p-4 border-t space-y-1">
                  <Button
                    variant="ghost"
                    onClick={() => setCurrentPanel('account')}
                    className="w-full justify-between px-4 py-3 h-auto"
                  >
                    <span>Account Details</span>
                    <User size={20} className="text-muted-foreground" />
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowSignOutConfirmation(true)}
                    className="w-full justify-between px-4 py-3 h-auto"
                  >
                    <span>Sign Out</span>
                    <LogOut size={20} />
                  </Button>
                </div>
              )}
            </div>
          ) : currentPanel === 'account' ? (
            <AccountDetailsPanel onBack={() => setCurrentPanel('main')} />
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmationModal
        isOpen={showSignOutConfirmation}
        onClose={() => setShowSignOutConfirmation(false)}
        onConfirm={handleSignOut}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        cancelLabel="Cancel"
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
    </>
  );
}
