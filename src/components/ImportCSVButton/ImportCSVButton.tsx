import React, { useRef } from 'react';
import { FileUp } from 'lucide-react';
import { parseCSVEvents } from '../../utils/csvParser';
import { TimelineEvent, CategoryConfig } from '../../types/event';

interface ImportCSVButtonProps {
  onImport: (events: Omit<TimelineEvent, 'id'>[], categories: CategoryConfig[]) => void;
  categories: CategoryConfig[];
}

export function ImportCSVButton({ onImport, categories }: ImportCSVButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Please select a CSV file');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    try {
      // Read file content
      let content: string;
      try {
        content = await file.text();
      } catch (readError) {
        console.error('Error reading file:', readError);
        throw new Error(
          `Failed to read file: ${readError instanceof Error ? readError.message : 'Unknown error'}`
        );
      }

      // Validate content
      if (!content.trim()) {
        throw new Error('CSV file is empty');
      }

      // Parse CSV content
      const { events, categories: parsedCategories, errors } = parseCSVEvents(content, categories);

      // Handle parsing errors
      if (errors.length > 0) {
        alert(errors.join('\n'));
        return;
      }

      // Validate event count
      if (events.length === 0) {
        throw new Error('No valid events found in the CSV file');
      }

      // Import events
      onImport(events, parsedCategories);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('CSV import error:', error);

      // Construct user-friendly error message
      let errorMessage = 'Error importing CSV file:\n';
      if (error instanceof Error) {
        errorMessage += error.message;
      } else {
        errorMessage += 'An unexpected error occurred';
      }

      alert(errorMessage);

      // Reset file input on error
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors"
      >
        <FileUp size={20} />
        Import CSV
      </button>
    </>
  );
}
