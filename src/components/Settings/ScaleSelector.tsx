interface ScaleSelectorProps {
  value: 'large' | 'small';
  onChange: (scale: 'large' | 'small') => void;
}

export function ScaleSelector({ value, onChange }: ScaleSelectorProps) {
  const handleScaleChange = (newScale: 'large' | 'small') => {
    if (onChange) {
      onChange(newScale);
    }
  };

  const tabClass = (active: boolean) =>
    `flex items-center justify-center w-[60px] min-w-[60px] h-8 px-3 py-1.5 rounded-[6px] transition-colors body-m ${
      active
        ? 'bg-[#262626] text-[#C9CED4]'
        : 'bg-transparent text-[#9B9EA3] hover:text-[#C9CED4]'
    }`;

  return (
    <div className="flex flex-row items-start p-1 w-[128px] h-10 bg-[#171717] border border-[#262626] rounded-[10px]">
      <button
        type="button"
        onClick={() => handleScaleChange('small')}
        className={tabClass(value === 'small')}
      >
        Small
      </button>
      <button
        type="button"
        onClick={() => handleScaleChange('large')}
        className={tabClass(value === 'large')}
      >
        Large
      </button>
    </div>
  );
}
