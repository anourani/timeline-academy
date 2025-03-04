import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Timeline } from '../Timeline/Timeline';
import { lockScroll, unlockScroll } from '../../utils/scrollLock';
import { DEFAULT_CATEGORIES } from '../../constants/categories';
import { SCALES } from '../../constants/scales';

interface SampleTimelineViewProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SampleTimelineView({ isOpen, onClose }: SampleTimelineViewProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      lockScroll();
      window.addEventListener('keydown', handleEscape);
      return () => {
        unlockScroll();
        window.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, onClose]);

  return (
    <div 
      className={`fixed inset-0 bg-black z-50 transition-transform duration-500 ease-in-out overflow-auto ${
        isOpen ? 'translate-y-0' : 'translate-y-full'
      }`}
      aria-hidden={!isOpen}
    >
      <div className="bg-black border-b border-gray-800">
        <div className="mx-auto px-8 py-2 flex justify-between items-center">
          <div className="text-sm text-gray-400">Sample Timeline</div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div 
        className={`pl-[120px] pr-8 pb-16 pt-12 transition-all duration-500 delay-100 ease-in-out ${
          isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <div className="pb-8">
          <h1 className="text-[48px] font-bold font-avenir">
            Sample Timeline
          </h1>
          <p className="text-base text-gray-300">
            This is an example of what you can create with our timeline tool.
          </p>
        </div>
      </div>

      <main 
        className={`timeline-container relative mt-16 mb-16 transition-all duration-500 delay-200 ease-in-out ${
          isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        <Timeline 
          events={[]} // Will be populated with your CSV data later
          categories={DEFAULT_CATEGORIES}
          scale={SCALES.large} // Use large scale for sample timeline
        />
      </main>
    </div>
  );
}