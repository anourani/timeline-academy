import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FileSpreadsheet, Download, Trash2 } from 'lucide-react';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import type { AddEventsResult } from '../../hooks/useEvents';
import { exportEventsToExcel } from '../../utils/excelExport';
import { ConfirmationModal } from '../Modal/ConfirmationModal';
import { ScaleSelector } from './ScaleSelector';
import { SidePanelActionButton } from '../SidePanel/SidePanelActionButton';
import { DEFAULT_TIMELINE_DESCRIPTION } from '../../constants/defaults';
import { utils, read } from 'xlsx';

interface ExcelRow {
  'Event Title'?: string;
  'Start Date'?: string | number | Date;
  'End Date'?: string | number | Date;
  'Category'?: string;
}

interface TimelineSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  events: TimelineEvent[];
  timelineTitle: string;
  timelineDescription: string;
  onImportEvents: (events: Omit<TimelineEvent, 'id'>[]) => AddEventsResult;
  onClearTimeline: () => void;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  scale: 'large' | 'small';
  onScaleChange: (scale: 'large' | 'small') => void;
  groupByCategory: boolean;
  onGroupByCategoryChange: (value: boolean) => void;
  categories: CategoryConfig[];
  onCategoriesChange?: (categories: CategoryConfig[]) => void;
  onDeleteTimeline: () => Promise<void> | void;
}

export function TimelineSettingsPanel({
  isOpen,
  onClose,
  events,
  timelineTitle,
  timelineDescription,
  onImportEvents,
  onTitleChange,
  onDescriptionChange,
  scale,
  onScaleChange,
  groupByCategory,
  onGroupByCategoryChange,
  categories,
  onDeleteTimeline,
}: TimelineSettingsPanelProps) {
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const maxDescriptionLength = 260;

  useEffect(() => {
    if (isOpen && !timelineDescription) {
      onDescriptionChange(DEFAULT_TIMELINE_DESCRIPTION);
    }
  }, [isOpen, timelineDescription, onDescriptionChange]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const data = await file.arrayBuffer();
        const workbook = read(data, { cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = utils.sheet_to_json<ExcelRow>(worksheet);
        const imported = rows.slice(2).map(row => {
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

        if (imported.length > 0) {
          const result = onImportEvents(imported);
          if (result.added === 0) {
            alert('All events already exist in the timeline');
          }
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

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmDelete = async () => {
    await onDeleteTimeline();
  };

  if (typeof document === 'undefined') return null;

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
      />

      {createPortal(
        <>
          <div
            onClick={onClose}
            className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-out ${
              isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-hidden="true"
          />
          <aside
            className={`fixed inset-y-0 right-0 z-50 w-[320px] pr-[6px] py-[6px] transition-transform duration-300 ease-out ${
              isOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
            aria-hidden={!isOpen}
            aria-label="Settings side panel"
          >
            <div className="h-full w-full bg-[#171717] rounded-[6px] border border-[#262626] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2 border-b border-[#404040] shrink-0">
                <h2 className="header-xsmall text-[#c9ced4] m-0">Settings</h2>
                <button
                  onClick={onClose}
                  className="relative flex items-center justify-center p-1.5 rounded-lg border border-white/15 bg-white/10 backdrop-blur-[12px] text-[#c9ced4] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] hover:bg-white/20 hover:text-[#dadee5] transition-colors"
                  aria-label="Close settings panel"
                >
                  <X size={16} strokeWidth={1.25} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="flex flex-col px-5 pt-6 pb-2 gap-8 min-h-full">
                  {/* Title */}
                  <div>
                    <label htmlFor="timelineTitle" className="label-m-type2 text-[#9B9EA3] mb-1 block">
                      Title
                    </label>
                    <input
                      type="text"
                      id="timelineTitle"
                      value={timelineTitle}
                      onChange={handleTitleChange}
                      className="w-full h-9 bg-[#242526] border border-[#262626] rounded-[8px] px-3 py-[7.5px] body-m text-[#DADEE5] outline-none focus:border-[#404040]"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label htmlFor="timelineDescription" className="label-m-type2 text-[#9B9EA3] mb-1 block">
                      Description <span className="text-muted-foreground">({timelineDescription.length}/{maxDescriptionLength})</span>
                    </label>
                    <textarea
                      id="timelineDescription"
                      value={timelineDescription}
                      onChange={handleDescriptionChange}
                      maxLength={maxDescriptionLength}
                      className="w-full h-[76px] bg-[#262626] border border-[#262626] rounded-[8px] p-2 body-m text-[#DADEE5] outline-none focus:border-[#404040]"
                    />
                  </div>

                  {/* Visual Settings */}
                  <div className="flex flex-col gap-2.5">
                    <span className="label-m-type2 text-[#9B9EA3]">Visual Settings</span>
                    <div className="h-px bg-[#262626] w-full" />

                    {/* Timeline scale row */}
                    <div className="flex flex-row items-center justify-between h-10">
                      <span className="label-m-type2 text-[#9B9EA3]">Timeline scale</span>
                      <ScaleSelector value={scale} onChange={onScaleChange} />
                    </div>

                    <div className="h-px bg-[#262626] w-full" />

                    {/* Group-by-category row */}
                    <div className="flex flex-row items-center justify-between h-6 gap-2">
                      <span className="body-m text-[#9B9EA3]">Group events by category</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={groupByCategory}
                        onClick={() => onGroupByCategoryChange(!groupByCategory)}
                        className={`relative inline-flex shrink-0 w-11 h-6 rounded-[50px] transition-colors ${
                          groupByCategory ? 'bg-[#259E23]' : 'bg-[rgba(37,158,35,0.3)]'
                        }`}
                      >
                        <span
                          className="absolute top-1/2 left-0 w-5 h-5 -translate-y-1/2 rounded-full bg-[#F5F5F5] transition-transform"
                          style={{ transform: `translate(${groupByCategory ? 22 : 2}px, -50%)` }}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Bottom action group */}
                  <div className="flex flex-col p-3 -mx-5">
                    <SidePanelActionButton
                      icon={FileSpreadsheet}
                      label="Import Data"
                      onClick={() => fileInputRef.current?.click()}
                    />
                    <SidePanelActionButton
                      icon={Download}
                      label="Download Timeline Data"
                      onClick={handleExportExcel}
                    />
                    <SidePanelActionButton
                      icon={Trash2}
                      label="Delete Timeline"
                      onClick={() => setShowDeleteConfirmation(true)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </>,
        document.body
      )}

      <ConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Timeline"
        message="Are you sure you want to delete this timeline? This action cannot be undone."
        confirmLabel="Delete Timeline"
        cancelLabel="Cancel"
      />
    </>
  );
}
