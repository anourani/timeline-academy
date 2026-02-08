import React, { useState, useEffect } from 'react';
import { X, User, KeyRound, LogOut, AlertTriangle } from 'lucide-react';
import { OptionButton } from './OptionButton';
import { ConfirmationModal } from '../Modal/ConfirmationModal';
import { useAuth } from '../../contexts/AuthContext';
import { useTimelines } from '../../hooks/useTimelines';
import { TimelineList } from '../Timeline/TimelineList';
import { AccountDetailsPanel } from './AccountDetailsPanel';
import { ChangePasswordPanel } from './ChangePasswordPanel';
import { lockScroll, unlockScroll } from '../../utils/scrollLock';
import { supabase } from '../../lib/supabase';

type SubPanel = 'main' | 'account' | 'password';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  timelineId: string | null;
  onTimelineSwitch: (timelineId: string) => void;
  onAuthClick: (isSignUp: boolean) => void;
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

  // Only refresh timelines when panel opens
  useEffect(() => {
    if (isOpen && user) {
      loadTimelines();
    }
  }, [isOpen, user]); // Only depend on isOpen and user, not loadTimelines

  useEffect(() => {
    if (isOpen) {
      lockScroll();
      return () => unlockScroll();
    }
  }, [isOpen]);

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

  const handleAuthClick = (signUp: boolean) => {
    onAuthClick(signUp);
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

      // If we're deleting the active timeline, switch to another one or create new
      if (timelineToDelete === timelineId) {
        const remainingTimeline = timelines.find(t => t.id !== timelineToDelete);
        if (remainingTimeline) {
          onTimelineSwitch(remainingTimeline.id);
        } else {
          onTimelineSwitch('new');
        }
      }

      // Refresh the timelines list
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
          <h3 className="text-lg font-medium text-white mb-2">
            Sign in to access your timelines
          </h3>
          <p className="text-gray-400 mb-6">
            Create up to 3 timelines and access them from anywhere
          </p>
          <div className="space-y-2">
            <button
              onClick={() => handleAuthClick(false)}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => handleAuthClick(true)}
              className="w-full py-2 px-4 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
            >
              Create Account
            </button>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center py-8 px-4">
          <div className="flex items-center justify-center gap-2 text-red-400 mb-4">
            <AlertTriangle size={24} />
            <p className="text-lg font-medium">Connection Error</p>
          </div>
          <p className="text-gray-300 mb-4">{error}</p>
          <button
            onClick={() => loadTimelines()}
            className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div className="text-gray-400 text-center py-4">Loading timelines...</div>
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
      <div 
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-250 ease-in-out ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      <div 
        className={`fixed left-0 top-0 h-full w-[400px] min-w-[360px] bg-gray-800 z-50 shadow-xl transform transition-transform duration-250 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {currentPanel === 'main' ? (
          <div className="h-full flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-700">
              <h2 className="text-xl font-semibold text-white">
                Timelines
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {renderContent()}
            </div>

            {user && (
              <div className="p-4 border-t border-gray-700">
                <div className="space-y-2">
                  <OptionButton
                    label="Account Details"
                    onClick={() => setCurrentPanel('account')}
                    icon={<User size={20} />}
                  />
                  <OptionButton
                    label="Change Password"
                    onClick={() => setCurrentPanel('password')}
                    icon={<KeyRound size={20} />}
                  />
                  <OptionButton
                    label="Sign Out"
                    onClick={() => setShowSignOutConfirmation(true)}
                    icon={<LogOut size={20} />}
                    variant="danger"
                  />
                </div>
              </div>
            )}
          </div>
        ) : currentPanel === 'account' ? (
          <AccountDetailsPanel onBack={() => setCurrentPanel('main')} />
        ) : currentPanel === 'password' ? (
          <ChangePasswordPanel onBack={() => setCurrentPanel('main')} />
        ) : null}
      </div>

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