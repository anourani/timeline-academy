import { useEventUsage } from '@/hooks/useEventUsage'

export function EventCounter() {
  const { eventCount, eventLimit } = useEventUsage()

  const isUnlimited = eventLimit === null
  const ratio = isUnlimited ? 0 : Math.min(eventCount / eventLimit, 1)
  const percent = Math.round(ratio * 100)

  // TODO: wire Upgrade to the billing flow once it exists.
  const handleUpgrade = () => {
    // Placeholder while billing is out of scope.
    console.log('Upgrade clicked')
  }

  return (
    <div className="flex flex-col gap-2 rounded-[12px] bg-[#0f0f0f] border border-[#262626] p-3">
      <div
        className="w-full h-1 rounded-full bg-[#262626] overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={isUnlimited ? undefined : eventLimit}
        aria-valuenow={isUnlimited ? undefined : eventCount}
        aria-label="Events used"
      >
        {!isUnlimited && (
          <div
            className="h-full bg-[#4196E4] transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="font-['Avenir',sans-serif] text-[13px] leading-[18px] text-[#9b9ea3]">
          {isUnlimited ? `${eventCount} events` : `${eventCount} / ${eventLimit} events`}
        </p>
        <button
          type="button"
          onClick={handleUpgrade}
          className="font-['Avenir',sans-serif] text-[13px] leading-[18px] text-[#4196E4] underline hover:text-[#6aaff0] transition-colors"
        >
          Upgrade
        </button>
      </div>
    </div>
  )
}
