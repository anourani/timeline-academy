import React from 'react';
import { X } from 'lucide-react';
import { Timeline } from '../Timeline/Timeline';
import { TimelineEvent } from '../../types/event';

interface BigPictureViewProps {
  events: TimelineEvent[];
  onClose: () => void;
}

export function BigPictureView({ events, onClose }: BigPictureViewProps) {
  return (
    <div className="fixed inset-0 bg-black z-50 overflow-hidden">
      <div className="absolute top-4 right-4">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-800 transition-colors"
        >
          <X size={24} />
        </button>
      </div>
      <div className="p-8 h-full">
        <Timeline events={events} isFullScreen />
      </div>
    </div>
  );
}