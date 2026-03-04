import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

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
      <Label>Timeline Scale</Label>
      <div className="flex bg-secondary rounded-lg p-1">
        <Button
          type="button"
          variant={value === 'large' ? 'default' : 'ghost'}
          onClick={() => handleScaleChange('large')}
          className="flex-1"
        >
          Large
        </Button>
        <Button
          type="button"
          variant={value === 'small' ? 'default' : 'ghost'}
          onClick={() => handleScaleChange('small')}
          className="flex-1"
        >
          Small
        </Button>
      </div>
    </div>
  );
}
