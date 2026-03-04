import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';
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
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Timelines</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

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
              Sign Out
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onSignInClick}
              >
                Sign In
              </Button>
              <Button size="sm" onClick={onSignUpClick}>
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
