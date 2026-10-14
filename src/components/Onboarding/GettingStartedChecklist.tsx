import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { PopupShell } from '@/components/ui/PopupShell'
import type { ChecklistState } from '@/contexts/OnboardingContext'
import { useAccountTier } from '@/hooks/useAccountTier'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useOnboarding } from '@/hooks/useOnboarding'
import { useSidePanel } from '@/hooks/useSidePanel'
import { cn } from '@/lib/utils'
import { focusComposer } from './anchors'

interface GettingStartedChecklistProps {
  /** Opens the Create page's `ApiKeyModal`. */
  onAddKey: () => void
}

interface Item {
  key: keyof ChecklistState
  label: string
  hint: string
}

const ITEMS: Item[] = [
  { key: 'tour', label: 'Take the quick tour', hint: '3 steps' },
  { key: 'ai', label: 'Choose how AI runs', hint: 'Key / sign in' },
  { key: 'first', label: 'Make your first timeline', hint: 'Search' },
]

/**
 * What's left of onboarding once the tour is over: a card in the corner on
 * desktop, a pill that opens a sheet on mobile. Only mounted on `/`, and gone
 * for good once all three items are done or the visitor hides it.
 */
export function GettingStartedChecklist({ onAddKey }: GettingStartedChecklistProps) {
  const { checklist, checklistVisible, hideChecklist, startTour, tourActive } = useOnboarding()
  const tier = useAccountTier()
  const isMobile = useIsMobile()
  const { isOpen: panelOpen } = useSidePanel()
  const [sheetOpen, setSheetOpen] = useState(false)

  if (!checklistVisible) return null

  const doneCount = ITEMS.filter((item) => checklist[item.key]).length
  const pct = (doneCount / ITEMS.length) * 100

  const act = (key: Item['key']) => {
    setSheetOpen(false)
    if (key === 'tour') startTour()
    else if (key === 'ai') onAddKey()
    // Searching as a guest only lands on the key gate, so go straight there.
    else if (tier === 'trial') onAddKey()
    else focusComposer()
  }

  const rows = ITEMS.map((item) => {
    const done = checklist[item.key]
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => act(item.key)}
        // Inert under the tour's dim, like everything else it covers.
        tabIndex={tourActive ? -1 : undefined}
        className={cn(
          'flex items-center text-left outline-none focus-visible:ring-1 focus-visible:ring-white/40',
          isMobile
            ? 'h-[52px] gap-3 border-b border-[#262626] last:border-b-0'
            : 'h-9 gap-2.5 -mx-2 px-2 rounded-[8px] hover:bg-[#262626] transition-colors',
        )}
      >
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full border',
            isMobile ? 'size-5' : 'size-4',
            done ? 'border-[#2563EB] bg-[#2563EB] text-[#DADEE5]' : 'border-[#404040]',
          )}
          aria-hidden
        >
          {done && <Check size={isMobile ? 12 : 10} strokeWidth={3} />}
        </span>
        <span
          className={cn(
            "flex-1 font-['Avenir',sans-serif]",
            isMobile ? 'text-[15px]' : 'text-[13px]',
            done ? 'text-[#6D7073] line-through' : 'text-[#C9CED4]',
          )}
        >
          {item.label}
          {done && <span className="sr-only"> (done)</span>}
        </span>
        {!done && (
          <span className="shrink-0 font-['JetBrains_Mono',monospace] text-[10px] uppercase text-[#6D7073]">
            {item.hint}
          </span>
        )}
      </button>
    )
  })

  const progress = (
    <div className="h-1 overflow-hidden rounded-full bg-[#0A0A0A]" aria-hidden>
      <div
        className="h-full rounded-full bg-[#2563EB] transition-[width] duration-300 motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  )

  if (isMobile) {
    return (
      <>
        {/* The drawer covers the page below `md`; the pill would float on it. */}
        {!panelOpen && (
          <div className="pointer-events-none fixed inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] z-30 flex justify-center">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              tabIndex={tourActive ? -1 : undefined}
              className="pointer-events-auto flex h-11 items-center gap-2.5 rounded-full border border-[#262626] bg-[rgba(23,23,23,0.92)] pl-3 pr-4 backdrop-blur-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.4)] outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            >
              <span
                className="flex size-5 items-center justify-center rounded-full"
                style={{ background: `conic-gradient(#2563EB ${pct * 3.6}deg, #262626 0)` }}
                aria-hidden
              >
                <span className="size-3.5 rounded-full bg-[#171717]" />
              </span>
              <span className="font-['Avenir',sans-serif] font-medium text-[14px] text-[#C9CED4]">
                Getting started
              </span>
              <span className="font-['JetBrains_Mono',monospace] text-[11px] text-[#6D7073]">
                {doneCount}/{ITEMS.length}
              </span>
            </button>
          </div>
        )}
        <PopupShell open={sheetOpen} onOpenChange={setSheetOpen} title="Getting started">
          {progress}
          <div className="flex flex-col">{rows}</div>
          <button
            type="button"
            onClick={() => {
              setSheetOpen(false)
              hideChecklist()
            }}
            className="h-11 rounded-[12px] font-['Avenir',sans-serif] font-medium text-[14px] text-[#6D7073] hover:text-[#C9CED4] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          >
            Hide checklist
          </button>
        </PopupShell>
      </>
    )
  }

  return (
    <section
      aria-label="Getting started"
      className="fixed bottom-6 right-6 z-30 flex w-[288px] flex-col gap-3 rounded-[16px] border border-[#262626] bg-[rgba(23,23,23,0.92)] p-4 backdrop-blur-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
    >
      <div className="flex items-center gap-3">
        <h2 className="m-0 flex-1 font-['Aleo',serif] font-normal text-[14px] leading-[140%] text-[#C9CED4]">
          Getting started
        </h2>
        <span className="font-['JetBrains_Mono',monospace] text-[11px] text-[#6D7073]">
          {doneCount}/{ITEMS.length}
        </span>
        <button
          type="button"
          onClick={hideChecklist}
          aria-label="Hide checklist"
          tabIndex={tourActive ? -1 : undefined}
          className="-mr-1 rounded p-0.5 text-[#6D7073] hover:text-[#C9CED4] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
      {progress}
      <div className="flex flex-col">{rows}</div>
    </section>
  )
}
