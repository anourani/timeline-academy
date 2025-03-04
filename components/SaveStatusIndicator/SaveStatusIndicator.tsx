import React from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';

export type SaveStatus = 'saved' | 'saving' | 'error';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  lastSaved?: Date;
}

export function SaveStatusIndicator({ status }: SaveStatusIndicatorProps) {
  return (
    <div className="flex items-center">
      {status === 'saved' && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1E2A1E] text-[#4ADE80] rounded-md">
          <Check size={16} className="flex-shrink-0" />
          <span className="text-sm whitespace-nowrap">Changes saved</span>
        </div>
      )}
      
      {status === 'saving' && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1E242E] text-[#94A3B8] rounded-md">
          <Loader2 size={16} className="flex-shrink-0 animate-spin" />
          <span className="text-sm whitespace-nowrap">Saving changes</span>
        </div>
      )}
      
      {status === 'error' && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#2A1E1E] text-[#F87171] rounded-md">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span className="text-sm whitespace-nowrap">Changes not saved</span>
        </div>
      )}
    </div>
  );
}