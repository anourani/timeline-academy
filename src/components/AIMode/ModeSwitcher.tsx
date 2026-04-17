import { Sparkles, FilePlus, FileUp } from 'lucide-react'

interface ModeSwitcherProps {
  onStartFresh: () => void
  onImportCSV: () => void
}

export function ModeSwitcher({ onStartFresh, onImportCSV }: ModeSwitcherProps) {
  return (
    <div className="flex flex-wrap items-center gap-[8px]">
      <div
        role="button"
        aria-disabled="true"
        tabIndex={-1}
        className="inline-flex items-center gap-[6px] h-[36px] px-[12px] rounded-[10px] bg-[#2563eb] text-white font-avenir text-sm font-medium shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.15)] cursor-default select-none"
      >
        <Sparkles className="h-4 w-4" />
        <span>Build with AI</span>
      </div>
      <button
        type="button"
        onClick={onStartFresh}
        className="inline-flex items-center gap-[6px] h-[36px] px-[12px] rounded-[10px] border border-[#3d3e40] bg-[#171717] text-text-secondary font-avenir text-sm font-medium hover:bg-[#1f1f1f] hover:text-text-primary transition-colors"
      >
        <FilePlus className="h-4 w-4" />
        <span>Start Fresh</span>
      </button>
      <button
        type="button"
        onClick={onImportCSV}
        className="inline-flex items-center gap-[6px] h-[36px] px-[12px] rounded-[10px] border border-[#3d3e40] bg-[#171717] text-text-secondary font-avenir text-sm font-medium hover:bg-[#1f1f1f] hover:text-text-primary transition-colors"
      >
        <FileUp className="h-4 w-4" />
        <span>Import CSV</span>
      </button>
    </div>
  )
}
