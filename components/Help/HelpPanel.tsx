import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

export function HelpPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Help Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors shadow-lg"
      >
        <HelpCircle size={20} />
        <span>What is this?</span>
      </button>

      {/* Help Panel Modal */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-250 ease-in-out ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsOpen(false)}
      />
      
      <div 
        className={`fixed right-0 top-0 h-full w-[400px] min-w-[360px] bg-gray-800 z-50 shadow-xl transform transition-transform duration-250 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">About Timeline</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-gray-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 text-gray-300 space-y-4">
          <p>
            Welcome to Timeline.academy! This interactive tool helps you visualize and organize events across different categories over time. Whether you're tracking personal milestones, career achievements, or just want an interactive way to see events plotted over time, our intuitive interface makes it easy to create beautiful, interactive timelines.
          </p>
          
          <p>
            You can add, edit, or remove events easily, and even import or export your timeline data using CSV files. The timeline automatically adjusts to show your events in the best possible layout, preventing overlaps and ensuring readability. Each event can be categorized and color-coded, making it simple to distinguish between different aspects of your journey.
          </p>

          <p>
            To get started, select anywhere on the timeline to add your first event. To view or edit more than one event at a time, select the "Manage Events" button in the header. Create an account to save your timelines and access them from anywhere, with support for up to three different timelines per account.
          </p>
        </div>
      </div>
    </>
  );
}