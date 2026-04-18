import { Button } from '@/components/ui/button'
import { SplitButton } from '@/components/ui/split-button'

interface ModeSwitcherProps {
  onStartFresh: () => void
  onImportCSV: () => void
}

export function ModeSwitcher({ onStartFresh, onImportCSV }: ModeSwitcherProps) {
  return (
    <div className="flex items-center gap-[12px]">
      <Button
        variant="primary-sm"
        size="none"
        aria-disabled
        tabIndex={-1}
        className="cursor-default select-none"
        onClick={(e) => e.preventDefault()}
      >
        Build with AI
      </Button>
      <SplitButton
        items={[
          { label: 'Start Fresh', onClick: onStartFresh },
          { label: 'Import CSV', onClick: onImportCSV },
        ]}
      />
    </div>
  )
}
