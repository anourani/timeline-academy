interface ScaleSelectorProps {
  value: 'large' | 'medium' | 'small';
  onChange: (scale: 'large' | 'medium' | 'small') => void;
}

export function ScaleSelector({ value, onChange }: ScaleSelectorProps) {
  const handleScaleChange = (newScale: 'large' | 'medium' | 'small') => {
    if (onChange) {
      onChange(newScale);
    }
  };

  const tabClass = (active: boolean) =>
    `flex items-center justify-center w-[64px] min-w-[64px] h-8 px-3 py-1.5 rounded-[6px] transition-colors body-m ${
      active
        ? 'bg-[#262626] text-text-secondary'
        : 'bg-transparent text-text-tertiary hover:text-text-secondary'
    }`;

  return (
    <div className="flex flex-row items-start p-1 w-[200px] h-10 bg-surface-secondary border border-[#262626] rounded-[10px]">
      <button
        type="button"
        onClick={() => handleScaleChange('small')}
        className={tabClass(value === 'small')}
      >
        S
      </button>
      <button
        type="button"
        onClick={() => handleScaleChange('medium')}
        className={tabClass(value === 'medium')}
      >
        M
      </button>
      <button
        type="button"
        onClick={() => handleScaleChange('large')}
        className={tabClass(value === 'large')}
      >
        L
      </button>
    </div>
  );
}
