interface EmptyStateProps {
  variant: 'logged-out' | 'no-timelines';
  onSignInClick?: () => void;
}

export function EmptyState({ variant, onSignInClick }: EmptyStateProps) {
  if (variant === 'logged-out') {
    return (
      <div className="flex flex-col h-[120px] items-center justify-center gap-3 p-4 bg-[#151617] rounded-[20px] shadow-[inset_4px_4px_24px_0px_rgba(156,163,175,0.1)]">
        <p className="header-xsmall text-[#dadee5] text-center whitespace-nowrap">
          Log in to see your timelines
        </p>
        <div className="inline-flex items-start gap-2">
          <button
            onClick={onSignInClick}
            className="inline-flex min-w-20 items-center justify-center gap-1 px-3 py-1.5 bg-[#ffffff1a] rounded-lg border border-[#ffffff26] hover:bg-[#ffffff26] font-avenir font-medium text-[#c9ced4] text-sm text-center leading-[21px] whitespace-nowrap transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[120px] items-center justify-center gap-3 p-4 bg-[#151617] rounded-[20px] shadow-[inset_4px_4px_24px_0px_rgba(156,163,175,0.1)]">
      <p className="header-xsmall text-[#dadee5] text-center whitespace-nowrap">
        No Timelines. Start a timeline to see it here.
      </p>
    </div>
  );
}
