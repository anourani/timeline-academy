import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  variant: 'logged-out' | 'no-timelines';
  onSignInClick?: () => void;
  onSignUpClick?: () => void;
}

export function EmptyState({ variant, onSignInClick, onSignUpClick }: EmptyStateProps) {
  if (variant === 'logged-out') {
    return (
      <div className="bg-surface-secondary rounded-2xl flex flex-col items-center py-12 gap-4">
        <span className="font-avenir text-sm text-text-primary">
          Log in to see your timelines
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSignInClick}
          >
            Log in
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSignUpClick}
          >
            Sign up
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-secondary rounded-2xl flex flex-col items-center py-12">
      <span className="font-avenir text-sm text-text-primary">
        No Timelines. Start a timeline to see it here.
      </span>
    </div>
  );
}
