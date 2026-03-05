import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  variant: 'logged-out' | 'no-timelines';
  onSignInClick?: () => void;
  onSignUpClick?: () => void;
}

export function EmptyState({ variant, onSignInClick, onSignUpClick }: EmptyStateProps) {
  if (variant === 'logged-out') {
    return (
      <div className="bg-[#1A1A1A] rounded-xl px-5 py-6 flex items-center justify-between">
        <span className="font-medium text-base text-white">
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
    <div className="bg-[#1A1A1A] rounded-xl px-5 py-6 text-center">
      <span className="font-medium text-base text-white">
        Start a timeline to see it here
      </span>
    </div>
  );
}
