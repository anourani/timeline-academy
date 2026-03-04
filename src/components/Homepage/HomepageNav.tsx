import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Button } from '@/components/ui/button';
import { FeedbackPanel } from '@/components/FeedbackPanel/FeedbackPanel';

interface HomepageNavProps {
  onSignInClick: () => void;
  onSignUpClick: () => void;
}

export function HomepageNav({ onSignInClick, onSignUpClick }: HomepageNavProps) {
  const { user } = useAuth();
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="bg-background">
      <div className="mx-auto px-8 py-2 flex justify-between items-center">
        <span className="text-muted-foreground text-sm">Timelines</span>

        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => setIsFeedbackOpen(true)}
            className="text-muted-foreground hover:text-foreground text-sm h-auto px-2 py-1"
          >
            Feedback
          </Button>

          {user ? (
            <Button
              variant="ghost"
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-foreground text-sm h-auto px-2 py-1"
            >
              Sign Out
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={onSignInClick}
                className="text-muted-foreground hover:text-foreground text-sm h-auto px-2 py-1"
              >
                Sign In
              </Button>
              <Button onClick={onSignUpClick} className="text-sm h-auto px-4 py-1.5">
                Create Account
              </Button>
            </>
          )}
        </div>
      </div>

      <FeedbackPanel open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen} />
    </div>
  );
}
