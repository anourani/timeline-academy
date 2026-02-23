import { Plus } from 'lucide-react';

interface EmptyStateProps {
  variant: 'logged-out' | 'no-timelines';
  onSignInClick?: () => void;
  onSignUpClick?: () => void;
  onCreateClick?: () => void;
}

export function EmptyState({ variant, onSignInClick, onSignUpClick, onCreateClick }: EmptyStateProps) {
  if (variant === 'logged-out') {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-white mb-2">
          Sign in to access your timelines
        </h3>
        <p className="text-gray-400 mb-6">
          Create up to 3 timelines and access them from anywhere
        </p>
        <div className="space-y-2 max-w-xs mx-auto">
          <button
            onClick={onSignInClick}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Sign In
          </button>
          <button
            onClick={onSignUpClick}
            className="w-full py-2 px-4 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors"
          >
            Create Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <h3 className="text-lg font-medium text-white mb-2">
        No timelines yet
      </h3>
      <p className="text-gray-400 mb-6">
        Create your first timeline to get started
      </p>
      <button
        onClick={onCreateClick}
        className="inline-flex items-center gap-2 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        <Plus size={18} />
        Create Your First Timeline
      </button>
    </div>
  );
}
