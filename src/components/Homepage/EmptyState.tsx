interface EmptyStateProps {
  variant: 'logged-out' | 'no-timelines';
  onSignInClick?: () => void;
  onSignUpClick?: () => void;
}

export function EmptyState({ variant, onSignInClick, onSignUpClick }: EmptyStateProps) {
  if (variant === 'logged-out') {
    return (
      <div className="flex flex-col h-[120px] items-center justify-center gap-3 p-4 bg-[#151617] rounded-[20px]">
        <p className="header-xsmall text-[#dadee5] text-center whitespace-nowrap">
          Log in to see your timelines
        </p>
        <div className="inline-flex items-start gap-2">
          <button
            onClick={onSignInClick}
            className="inline-flex min-w-20 items-center justify-center gap-1 px-3 py-1.5 bg-[#ffffff1a] rounded-lg border border-[#ffffff26] hover:bg-[#ffffff26] font-avenir font-medium text-[#c9ced4] text-sm text-center leading-[21px] whitespace-nowrap transition-colors"
          >
            Log in
          </button>
          <button
            onClick={onSignUpClick}
            className="inline-flex min-w-20 items-center justify-center gap-1 px-3 py-1.5 bg-[#ffffff1a] rounded-lg border border-[#ffffff26] hover:bg-[#ffffff26] font-avenir font-medium text-[#c9ced4] text-sm text-center leading-[21px] whitespace-nowrap transition-colors"
          >
            Sign up
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[120px] items-center justify-center gap-3 p-4 bg-[#151617] rounded-[20px]">
      <p className="header-xsmall text-[#dadee5] text-center whitespace-nowrap">
        No Timelines. Start a timeline to see it here.
      </p>
    </div>
  );
}
