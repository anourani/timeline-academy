import React from 'react';
import { Save } from 'lucide-react';

interface SaveButtonProps {
  hasChanges: boolean;
  onSave: () => void;
}

export function SaveButton({ hasChanges, onSave }: SaveButtonProps) {
  return (
    <button
      onClick={onSave}
      disabled={!hasChanges}
      className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200 ${
        hasChanges 
          ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer' 
          : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
      }`}
      title={hasChanges ? 'Save changes' : 'No changes to save'}
    >
      <Save size={20} />
      Save
    </button>
  );
}