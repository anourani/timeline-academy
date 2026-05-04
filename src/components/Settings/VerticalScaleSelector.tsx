interface VerticalScaleSelectorProps {
  value: 'small' | 'medium';
  onChange: (scale: 'small' | 'medium') => void;
}

export function VerticalScaleSelector({ value, onChange }: VerticalScaleSelectorProps) {
  const handleChange = (newScale: 'small' | 'medium') => {
    if (onChange) {
      onChange(newScale);
    }
  };

  const tabClass = (active: boolean) =>
    `flex items-center justify-center w-[60px] min-w-[60px] h-8 px-3 py-1.5 rounded-[6px] transition-colors body-m ${
      active
        ? 'bg-[#262626] text-text-secondary'
        : 'bg-transparent text-text-tertiary hover:text-text-secondary'
    }`;

  return (
    <div className="flex flex-row items-start p-1 w-[136px] h-10 bg-surface-secondary border border-[#262626] rounded-[10px]">
      <button
        type="button"
        onClick={() => handleChange('small')}
        className={tabClass(value === 'small')}
      >
        Small
      </button>
      <button
        type="button"
        onClick={() => handleChange('medium')}
        className={tabClass(value === 'medium')}
      >
        Medium
      </button>
    </div>
  );
}
