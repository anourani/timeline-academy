import React, { useState, useEffect } from 'react';
import { X, FileDown, FileUp, Trash2, RotateCcw, Download } from 'lucide-react';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import { exportEventsToExcel } from '../../utils/excelExport';
import { OptionButton } from '../SidePanel/OptionButton';
import { Modal } from '../Modal/Modal';
import { ConfirmationModal } from '../Modal/ConfirmationModal';
import { ScaleSelector } from './ScaleSelector';
import { lockScroll, unlockScroll } from '../../utils/scrollLock';
import { DEFAULT_TIMELINE_DESCRIPTION } from '../../constants/defaults';
import { utils, writeFile } from 'xlsx';
import { read } from 'xlsx';

interface TimelineSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  events: TimelineEvent[];
  timelineTitle: string;
  timelineDescription: string;
  onImportEvents: (events: Omit<TimelineEvent, 'id'>[]) => void;
  onClearTimeline: () => void;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  scale: 'large' | 'small';
  onScaleChange: (scale: 'large' | 'small') => void;
  categories: CategoryConfig[];
}

export function TimelineSettingsPanel({
  isOpen,
  onClose,
  events,
  timelineTitle,
  timelineDescription,
  onImportEvents,
  onClearTimeline,
  onTitleChange,
  onDescriptionChange,
  scale,
  onScaleChange,
  categories,
}: TimelineSettingsPanelProps) {
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const maxDescriptionLength = 260;

  // Initialize description when panel opens
  useEffect(() => {
    if (isOpen && !timelineDescription) {
      onDescriptionChange(DEFAULT_TIMELINE_DESCRIPTION);
    }
  }, [isOpen, timelineDescription, onDescriptionChange]);

  // Lock/unlock scroll when panel opens/closes
  useEffect(() => {
    if (isOpen) {
      lockScroll();
      return () => unlockScroll();
    }
  }, [isOpen]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onTitleChange(e.target.value);
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newDescription = e.target.value;
    if (newDescription.length <= maxDescriptionLength) {
      onDescriptionChange(newDescription);
    }
  };

  const handleExportExcel = () => {
    exportEventsToExcel(events, timelineTitle);
  };

  const handleDownloadTemplate = () => {
    // Create workbook
    const wb = utils.book_new();
    
    // Create headers and instructions
    const headers = ['Event Title', 'Start Date', 'End Date', 'Category'];
    const instructions = [
      '55 char limit',
      'Format: MM/DD/YYYY',
      'Format: MM/DD/YYYY',
      'Must match a timeline category'
    ];
    
    // Create sample data using existing category labels
    const data = [
      headers,
      instructions,
      ['Sample Event 1', '1/15/2024', '1/20/2024', categories[0]?.label || 'Personal Life'],
      ['Sample Event 2', '10/14/2024', '10/16/2024', categories[1]?.label || 'Career']
    ];
    
    // Create worksheet
    const ws = utils.aoa_to_sheet(data);
    
    // Add worksheet to workbook
    utils.book_append_sheet(wb, ws, 'Timeline Events');
    
    // Save file
    writeFile(wb, 'timeline-template.xlsx');
  };

  const handleResetData = () => {
    onClearTimeline();
    onTitleChange('Timeline');
    onDescriptionChange('');
    setShowResetConfirmation(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Check file type
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // Process Excel file
        const data = await file.arrayBuffer();
        const workbook = read(data, { cellDates: true });
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON, skipping first two rows (headers and instructions)
        const rows = utils.sheet_to_json<any>(worksheet);
        const events = rows.slice(2).map(row => {
          // Format dates properly
          let startDate = '';
          let endDate = '';
          
          if (row['Start Date']) {
            const startDateObj = new Date(row['Start Date']);
            startDate = startDateObj.toISOString().split('T')[0];
          }
          
          if (row['End Date']) {
            const endDateObj = new Date(row['End Date']);
            endDate = endDateObj.toISOString().split('T')[0];
          } else {
            endDate = startDate;
          }
          
          // Find matching category
          const categoryLabel = row['Category'];
          const category = categories.find(c => 
            c.label.toLowerCase() === categoryLabel?.toLowerCase()
          );
          
          return {
            title: row['Event Title'] || '',
            startDate,
            endDate,
            category: category?.id || categories[0]?.id
          };
        }).filter(event => event.title && event.startDate && event.category);
        
        if (events.length > 0) {
          onImportEvents(events);
        } else {
          alert('No valid events found in the file');
        }
      } else {
        alert('Please select an Excel file (.xlsx or .xls)');
      }
    } catch (error) {
      console.error('Error importing file:', error);
      alert('Error importing file. Please check the format and try again.');
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
      />
      <div 
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-250 ease-in-out ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      <div 
        className={`fixed right-0 top-0 h-full w-[400px] min-w-[360px] bg-gray-800 z-50 shadow-xl transform transition-transform duration-250 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-gray-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[calc(100vh-5rem)] overflow-y-auto scrollbar-hide">
          <div>
            <label htmlFor="timelineTitle" className="block text-sm font-medium text-gray-300 mb-1">
              Timeline Title
            </label>
            <input
              type="text"
              id="timelineTitle"
              value={timelineTitle}
              onChange={handleTitleChange}
              className="w-full px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label htmlFor="timelineDescription" className="block text-sm font-medium text-gray-300 mb-1">
              Description <span className="text-gray-400">({timelineDescription.length}/{maxDescriptionLength})</span>
            </label>
            <textarea
              id="timelineDescription"
              value={timelineDescription}
              onChange={handleDescriptionChange}
              rows={3}
              maxLength={maxDescriptionLength}
              className="w-full px-3 py-2 bg-gray-700 rounded-md text-white border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          <div className="border-t border-gray-700 pt-4">
            <ScaleSelector value={scale} onChange={onScaleChange} />
          </div>

          <div className="border-t border-gray-700 pt-4">
            <h3 className="block text-sm font-medium text-gray-300">Import / Export</h3>
            <div className="space-y-2 mt-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
              >
                <span className="text-white">Import Data</span>
                <FileUp size={20} className="text-gray-400" />
              </button>
              
              <button
                onClick={handleDownloadTemplate}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
              >
                <span className="text-white">Download Template to Import Data</span>
                <Download size={20} className="text-gray-400" />
              </button>
              
              <button
                onClick={handleExportExcel}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
              >
                <span className="text-white">Export Data</span>
                <FileDown size={20} className="text-gray-400" />
              </button>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <h3 className="block text-sm font-medium text-gray-300">Danger Zone</h3>
            <div className="space-y-2 mt-3">
              <button
                onClick={() => setShowClearConfirmation(true)}
                className="w-full flex items-center justify-between px-4 py-3 bg-red-950/50 hover:bg-red-900/50 rounded-md transition-colors"
              >
                <span className="text-red-400">Clear Timeline</span>
                <Trash2 size={20} className="text-red-400" />
              </button>
              
              <button
                onClick={() => setShowResetConfirmation(true)}
                className="w-full flex items-center justify-between px-4 py-3 bg-red-950/50 hover:bg-red-900/50 rounded-md transition-colors"
              >
                <span className="text-red-400">Reset All Data</span>
                <RotateCcw size={20} className="text-red-400" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showClearConfirmation}
        onClose={() => setShowClearConfirmation(false)}
        onConfirm={onClearTimeline}
        title="Clear Timeline"
        message="Are you sure you want to clear the timeline? This action cannot be undone."
        confirmLabel="Clear Timeline"
        cancelLabel="Cancel"
      />

      <ConfirmationModal
        isOpen={showResetConfirmation}
        onClose={() => setShowResetConfirmation(false)}
        onConfirm={handleResetData}
        title="Reset All Data"
        message="Are you sure you want to reset all data? This will clear all events and reset the timeline title. This action cannot be undone."
        confirmLabel="Reset All Data"
        cancelLabel="Cancel"
      />
    </>
  );
}