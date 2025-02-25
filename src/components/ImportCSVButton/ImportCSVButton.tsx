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
      console.log('No file selected');
      return;
    }

    // Log file details
    console.log('File selected:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

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
      console.log('Reading file...');
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

      console.log('File content length:', content.length);
      console.log('First 100 characters:', content.substring(0, 100));

      // Parse CSV content
      console.log('Parsing CSV content...');
      const { events, categories: parsedCategories, errors } = parseCSVEvents(content, categories);
      
      console.log('Parse results:', {
        eventCount: events.length,
        categoryCount: parsedCategories.length,
        errorCount: errors.length
      });

      // Handle parsing errors
      if (errors.length > 0) {
        console.log('Parse errors:', errors);
        alert(errors.join('\n'));
        return;
      }

      // Validate event count
      if (events.length === 0) {
        throw new Error('No valid events found in the CSV file');
      }

      // Import events
      console.log('Importing events...');
      onImport(events, parsedCategories);
      console.log('Import successful');

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
        console.error('Error stack:', error.stack);
      } else {
        errorMessage += 'An unexpected error occurred';
        console.error('Unknown error:', error);
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