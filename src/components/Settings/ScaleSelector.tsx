import React from 'react';

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

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-300">Timeline Scale</label>
      <div className="flex bg-gray-700 rounded-lg p-1">
        <button
          type="button"
          onClick={() => handleScaleChange('large')}
          className={`flex-1 px-4 py-2 text-base rounded-md transition-all duration-200 ${
            value === 'large'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          Large
        </button>
        <button
          type="button"
          onClick={() => handleScaleChange('small')}
          className={`flex-1 px-4 py-2 text-base rounded-md transition-all duration-200 ${
            value === 'small'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-300 hover:text-white'
          }`}
        >
          Small
        </button>
      </div>
    </div>
  );
}