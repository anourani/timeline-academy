import { SquarePen, SquarePlay } from 'lucide-react'

interface ModeTabsProps {
  mode: 'edit' | 'view'
  onChange: (mode: 'edit' | 'view') => void
}

/**
 * Edit / Present segmented control, living in the dock.
 *
 * Icon-only by design, so each tab carries its own accessible name — the
 * labelled version this replaces lived in the top nav and could lean on its
 * text. Segments are a fixed 54px wide and centre their icon, which is why the
 * spec's asymmetric padding (17/7 selected vs 16/6 unselected) is not
 * transcribed: it exists only to offset the selected tab's 1px border, and the
 * icon lands in the same place without it.
 */
export function ModeTabs({ mode, onChange }: ModeTabsProps) {
  const isEdit = mode === 'edit'
  return (
    <div className="flex h-[42px] items-start rounded-[10px] bg-[#262626] border border-[#262626]">
      <ModeTab
        active={isEdit}
        onClick={() => onChange('edit')}
        icon={<SquarePen size={20} strokeWidth={1} />}
        label="Edit mode"
      />
      <ModeTab
        active={!isEdit}
        onClick={() => onChange('view')}
        icon={<SquarePlay size={20} strokeWidth={1} />}
        label="Present mode"
      />
    </div>
  )
}

interface ModeTabProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function ModeTab({ active, onClick, icon, label }: ModeTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex h-full w-[54px] items-center justify-center transition-colors ${
        active
          ? 'rounded-[8px] border border-white/[0.15] bg-[#0A0A0A] backdrop-blur-[12px] shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.1),0px_8px_16px_0px_rgba(0,0,0,0.4)]'
          : 'rounded-[6px] bg-transparent hover:bg-white/[0.04]'
      }`}
      style={{ color: active ? '#D4D4D4' : '#A3A3A3' }}
    >
      <span className="shrink-0" aria-hidden>
        {icon}
      </span>
    </button>
  )
}
