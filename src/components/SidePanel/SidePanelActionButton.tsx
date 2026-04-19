import type { LucideIcon } from 'lucide-react'

interface SidePanelActionButtonProps {
  icon?: LucideIcon
  label: string
  onClick: () => void
}

export function SidePanelActionButton({
  icon: Icon,
  label,
  onClick,
}: SidePanelActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex flex-row items-center gap-1.5 px-1.5 py-2 h-[38px] rounded-[10px] border border-transparent backdrop-blur-[12px] body-m text-[#9b9ea3] hover:bg-[#262626] hover:text-[#dadee5] transition-colors"
    >
      {Icon && <Icon size={16} strokeWidth={1.25} className="shrink-0" />}
      <span>{label}</span>
    </button>
  )
}
