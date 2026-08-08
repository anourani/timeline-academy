import { Modal } from './Modal'

interface TrialGateModalProps {
  isOpen: boolean
  /** Event count of the timeline currently occupying the trial slot. */
  eventCount: number
  onClose: () => void
  onDiscard: () => void
  onExport: () => void
  onKeep: () => void
}

/**
 * Shown when a visitor with no account and no API key starts something new
 * while the single trial slot is already holding work.
 *
 * This is the one moment their content is genuinely at risk: it lives in
 * sessionStorage, so there is nowhere else it could be. Everything else in the
 * editor autosaves continuously, which is why this is the only gate — leaving
 * the page, switching timelines and refreshing are all already safe.
 */
export function TrialGateModal({
  isOpen,
  eventCount,
  onClose,
  onDiscard,
  onExport,
  onKeep,
}: TrialGateModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Keep this timeline?">
      <div className="space-y-4">
        <p className="body-m text-[#c9ced4] m-0">
          You're trying this out, so nothing has been saved yet — your timeline
          {eventCount > 0 ? ` and its ${eventCount} event${eventCount === 1 ? '' : 's'} live` : ' lives'}{' '}
          only in this tab. Starting something new replaces it.
        </p>

        <div className="flex flex-col gap-2">
          <button onClick={onKeep} className={glassPrimary}>
            Keep it — sign in or add a key
          </button>
          <button onClick={onExport} className={glassSecondary}>
            Download it as a spreadsheet
          </button>
          <button onClick={onDiscard} className={glassDestructive}>
            Discard and start fresh
          </button>
        </div>
      </div>
    </Modal>
  )
}

const glassPrimary = `
  relative px-[16px] py-[8px] rounded-[10px]
  backdrop-blur-[12px] bg-[rgba(37,99,235,0.8)] border border-white/[0.15]
  shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
  font-['Avenir',sans-serif] font-medium text-[14px] text-[#dadee5]
  hover:bg-[rgba(37,99,235,0.9)] transition-all
`

const glassSecondary = `
  relative px-[16px] py-[8px] rounded-[10px]
  backdrop-blur-[12px] bg-white/10 border border-white/[0.15]
  shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
  font-['Avenir',sans-serif] font-medium text-[14px] text-[#c9ced4]
  hover:bg-white/20 hover:text-[#dadee5] transition-all
`

const glassDestructive = `
  relative px-[16px] py-[8px] rounded-[10px]
  backdrop-blur-[12px] bg-white/5 border border-white/[0.1]
  font-['Avenir',sans-serif] font-medium text-[14px] text-destructive
  hover:bg-white/10 transition-all
`
