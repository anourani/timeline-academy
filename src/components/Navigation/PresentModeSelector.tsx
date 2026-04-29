import { SquarePen, SquarePlay } from 'lucide-react'
import type { ViewMode } from '@/hooks/useViewMode'

interface PresentModeSelectorProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
}

export function PresentModeSelector({ value, onChange }: PresentModeSelectorProps) {
  const tabClass = (active: boolean) =>
    `flex items-center justify-center gap-1.5 min-w-[80px] h-8 px-3 py-1.5 rounded-[6px] transition-colors body-m ${
      active
        ? 'bg-[#262626] text-[#C9CED4]'
        : 'bg-transparent text-[#9B9EA3] hover:text-[#C9CED4]'
    }`

  return (
    <div
      className="flex flex-row items-start p-1 h-10 bg-[#171717] border border-[#262626] rounded-[10px]"
      role="tablist"
      aria-label="View mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'edit'}
        onClick={() => onChange('edit')}
        className={tabClass(value === 'edit')}
      >
        <SquarePen size={16} strokeWidth={1.5} />
        Edit
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'present'}
        onClick={() => onChange('present')}
        className={tabClass(value === 'present')}
      >
        <SquarePlay size={16} strokeWidth={1.5} />
        Present
      </button>
    </div>
  )
}
