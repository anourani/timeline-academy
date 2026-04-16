import React, { useState, useEffect } from 'react';
import { FileDown, FileUp, Trash2, RotateCcw, Download } from 'lucide-react';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import type { AddEventsResult } from '../../hooks/useEvents';
import { exportEventsToExcel } from '../../utils/excelExport';
import { ConfirmationModal } from '../Modal/ConfirmationModal';
import { ScaleSelector } from './ScaleSelector';
import { DEFAULT_TIMELINE_DESCRIPTION } from '../../constants/defaults';
import { utils, writeFile } from 'xlsx';
import { read } from 'xlsx';

interface ExcelRow {
  'Event Title'?: string;
  'Start Date'?: string | number | Date;
  'End Date'?: string | number | Date;
  'Category'?: string;
}
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

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

  useEffect(() => {
    if (isOpen && !timelineDescription) {
      onDescriptionChange(DEFAULT_TIMELINE_DESCRIPTION);
    }
  }, [isOpen, timelineDescription, onDescriptionChange]);

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
    const wb = utils.book_new();
    const headers = ['Event Title', 'Start Date', 'End Date', 'Category'];
    const instructions = [
      '55 char limit',
      'Format: MM/DD/YYYY',
      'Format: MM/DD/YYYY',
      'Must match a timeline category'
    ];
    const data = [
      headers,
      instructions,
      ['Sample Event 1', '1/15/2024', '1/20/2024', categories[0]?.label || 'Personal Life'],
      ['Sample Event 2', '10/14/2024', '10/16/2024', categories[1]?.label || 'Career']
    ];
    const ws = utils.aoa_to_sheet(data);
    utils.book_append_sheet(wb, ws, 'Timeline Events');
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
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const data = await file.arrayBuffer();
        const workbook = read(data, { cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = utils.sheet_to_json<ExcelRow>(worksheet);
        const events = rows.slice(2).map(row => {
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

        if (events.length > 0) {
          const result = onImportEvents(events);
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

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
      />

      <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent side="right" className="w-[400px] min-w-[360px] p-0">
          <SheetDescription className="sr-only">Timeline settings panel</SheetDescription>
          <div className="h-full flex flex-col">
            <SheetHeader className="px-6 py-4 border-b">
              <SheetTitle className="text-xl font-semibold">Settings</SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              <div>
                <Label htmlFor="timelineTitle">Timeline Title</Label>
                <Input
                  type="text"
                  id="timelineTitle"
                  value={timelineTitle}
                  onChange={handleTitleChange}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="timelineDescription">
                  Description <span className="text-muted-foreground">({timelineDescription.length}/{maxDescriptionLength})</span>
                </Label>
                <textarea
                  id="timelineDescription"
                  value={timelineDescription}
                  onChange={handleDescriptionChange}
                  rows={3}
                  maxLength={maxDescriptionLength}
                  className="mt-1 w-full px-3 py-2 bg-background rounded-md border border-input focus:border-ring focus:ring-1 focus:ring-ring outline-none resize-none text-foreground"
                />
              </div>

              <div className="border-t pt-4">
                <ScaleSelector value={scale} onChange={onScaleChange} />
              </div>

              <div className="border-t pt-4">
                <Label>Import / Export</Label>
                <div className="space-y-2 mt-3">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full justify-between px-4 py-3 h-auto"
                  >
                    <span>Import Data</span>
                    <FileUp size={20} className="text-muted-foreground" />
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleDownloadTemplate}
                    className="w-full justify-between px-4 py-3 h-auto"
                  >
                    <span>Download Template to Import Data</span>
                    <Download size={20} className="text-muted-foreground" />
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleExportExcel}
                    className="w-full justify-between px-4 py-3 h-auto"
                  >
                    <span>Export Data</span>
                    <FileDown size={20} className="text-muted-foreground" />
                  </Button>
                </div>
              </div>

              <div className="border-t pt-4">
                <Label>Danger Zone</Label>
                <div className="space-y-2 mt-3">
                  <Button
                    variant="destructive"
                    onClick={() => setShowClearConfirmation(true)}
                    className="w-full justify-between px-4 py-3 h-auto"
                  >
                    <span>Clear Timeline</span>
                    <Trash2 size={20} />
                  </Button>

                  <Button
                    variant="destructive"
                    onClick={() => setShowResetConfirmation(true)}
                    className="w-full justify-between px-4 py-3 h-auto"
                  >
                    <span>Reset All Data</span>
                    <RotateCcw size={20} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

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
