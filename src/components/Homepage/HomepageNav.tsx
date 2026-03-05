import { useState } from 'react';
import { LayoutList } from 'lucide-react';
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
      <div className="mx-auto px-8 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <LayoutList size={20} className="text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Timelines</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFeedbackOpen(true)}
          >
            Feedback
          </Button>

          {user ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
            >
              Log Out
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onSignInClick}
              >
                Log In
              </Button>
              <Button size="sm" onClick={onSignUpClick}>
                Sign Up
              </Button>
            </>
          )}
        </div>
      </div>

      <FeedbackPanel open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen} />
    </div>
  );
}
