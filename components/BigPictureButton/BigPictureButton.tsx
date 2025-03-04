import React from 'react';
import { Maximize2 } from 'lucide-react';

interface BigPictureButtonProps {
  onClick: () => void;
}

export function BigPictureButton({ onClick }: BigPictureButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors"
    >
      <Maximize2 size={20} />
      Big Picture
    </button>
  );
}