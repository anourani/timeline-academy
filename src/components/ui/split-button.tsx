interface SplitButtonItem {
  label: string
  onClick: () => void
}

interface SplitButtonProps {
  items: SplitButtonItem[]
}

export function SplitButton({ items }: SplitButtonProps) {
  return (
    <div className="inline-flex h-[36px] rounded-[10px] border border-[#3d3e40] bg-[#171717] overflow-hidden">
      {items.map((item, i) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          className={[
            'inline-flex items-center justify-center h-full px-[16px] font-avenir text-sm font-medium text-text-secondary hover:bg-[#1f1f1f] hover:text-text-primary transition-colors',
            i < items.length - 1 ? 'border-r border-[#3d3e40]' : '',
          ].join(' ')}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
