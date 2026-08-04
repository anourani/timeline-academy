import React, { useRef } from 'react';
import { FileUp, Download } from 'lucide-react';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import { supabase } from '../../lib/supabase';
import { getCurrentLimits, isOverEventLimit } from '../../lib/limits';
import {
  downloadTemplate,
  isInstructionRow,
  parseSheetRows,
  type SheetCellValue,
} from '../../utils/excelSheet';

async function isAlreadyAtEventLimit(): Promise<{ limited: boolean; message: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { limited: false, message: '' };
  const { data, error } = await supabase.rpc('get_user_event_count');
  if (error) return { limited: false, message: '' };
  const count = typeof data === 'number' ? data : 0;
  if (isOverEventLimit(count)) {
    const { eventLimit } = getCurrentLimits();
    return {
      limited: true,
      message: `You've reached the ${eventLimit}-event limit. Delete events to make room before importing, or upgrade.`,
    };
  }
  return { limited: false, message: '' };
}

interface ImportExcelButtonProps {
  onImport: (events: Omit<TimelineEvent, 'id'>[], categories: CategoryConfig[]) => void;
  categories: CategoryConfig[];
}

const MAX_TITLE_LENGTH = 55;

export function ImportExcelButton({ onImport, categories }: ImportExcelButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const normalizeCategory = (category: string): string => {
    return category.trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s&_-]/g, '') // Remove special chars except &, _, -
      .replace(/\s*&\s*/g, '_and_') // Convert & to _and_
      .replace(/[-\s]+/g, '_'); // Convert spaces and hyphens to underscores
  };

  const findMatchingCategory = (rawCategory: string): CategoryConfig | undefined => {
    const normalizedInput = normalizeCategory(rawCategory);
    return categories.find(cat =>
      normalizeCategory(cat.id) === normalizedInput ||
      normalizeCategory(cat.label) === normalizedInput
    );
  };

  const parseExcelDate = (value: SheetCellValue): string | null => {
    if (value instanceof Date) {
      if (isNaN(value.getTime())) return null;
      return value.toISOString().split('T')[0];
    }
    if (typeof value === 'number') {
      // Handle Excel serial date number
      const date = new Date(Math.round((value - 25569) * 86400 * 1000));
      return date.toISOString().split('T')[0];
    }

    // Convert to string and clean up
    const dateStr = String(value).trim();

    // Handle string date in MM/DD/YYYY format
    const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const [, month, day, year] = match;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (isNaN(date.getTime())) {
        return null;
      }
      return date.toISOString().split('T')[0];
    }

    return null;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];
    if (!validTypes.includes(file.type) &&
        !file.name.match(/\.(xlsx|xls)$/i)) {
      alert('Please select an Excel file (.xlsx or .xls)');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    const preflight = await isAlreadyAtEventLimit();
    if (preflight.limited) {
      alert(preflight.message);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    try {
      // Read Excel file (size-capped) and drop the template's instruction row
      // wherever it appears — files without one keep every data row.
      const allRows = await parseSheetRows(file);
      const rows = allRows.filter((row) => !isInstructionRow(row));

      const events: Omit<TimelineEvent, 'id'>[] = [];
      const errors: string[] = [];
      const categoryMismatches = new Map<string, number[]>();

      // Process each row
      rows.forEach((row, index) => {
        const rowNumber = index + 3; // Account for header rows

        try {
          // Skip empty rows
          if (!row['Event Title'] && !row['Start Date'] && !row['Category']) {
            return;
          }

          // Validate required fields
          const missingFields = [];
          if (!row['Event Title']?.toString().trim()) missingFields.push('Event Title');
          if (!row['Start Date']) missingFields.push('Start Date');
          if (!row['Category']?.toString().trim()) missingFields.push('Category');

          if (missingFields.length > 0) {
            errors.push(`Row ${rowNumber}: Missing ${missingFields.join(', ')}`);
            return;
          }

          const title = row['Event Title'].toString().trim();

          // Validate title length
          if (title.length > MAX_TITLE_LENGTH) {
            errors.push(`Row ${rowNumber}: Title exceeds ${MAX_TITLE_LENGTH} characters`);
            return;
          }

          // Parse dates
          const startDate = parseExcelDate(row['Start Date']);
          if (!startDate) {
            errors.push(`Row ${rowNumber}: Invalid Start Date format (use MM/DD/YYYY)`);
            return;
          }

          let endDate = startDate;
          if (row['End Date']) {
            const parsedEndDate = parseExcelDate(row['End Date']);
            if (!parsedEndDate) {
              errors.push(`Row ${rowNumber}: Invalid End Date format (use MM/DD/YYYY)`);
              return;
            }
            endDate = parsedEndDate;
          }

          // Process category
          const rawCategory = row['Category'].toString().trim();
          const matchingCategory = findMatchingCategory(rawCategory);

          if (!matchingCategory) {
            // Track category mismatches by row
            if (!categoryMismatches.has(rawCategory)) {
              categoryMismatches.set(rawCategory, []);
            }
            categoryMismatches.get(rawCategory)?.push(rowNumber);
            return;
          }

          // Add valid event with matching category ID
          events.push({
            title,
            startDate,
            endDate,
            category: matchingCategory.id
          });

        } catch (error) {
          console.error(`Error processing row ${rowNumber}:`, error);
          errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });

      // Add category mismatch errors
      categoryMismatches.forEach((rows, category) => {
        const rowList = rows.join(', ');
        errors.push(
          `Category "${category}" does not match any timeline categories. ` +
          `Events skipped in rows: ${rowList}`
        );
      });

      // Handle errors
      if (errors.length > 0) {
        alert(errors.join('\n'));
        return;
      }

      // Validate event count
      if (events.length === 0) {
        throw new Error('No valid events found in the Excel file');
      }

      // Import events with existing categories
      onImport(events, categories);

    } catch (error) {
      console.error('Excel import error:', error);
      alert(`Error importing Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExportTemplate = () => {
    void downloadTemplate(MAX_TITLE_LENGTH, [
      categories[0]?.label || 'Personal Life',
      categories[1]?.label || 'Career',
    ]);
  };

  return (
    <div className="flex gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors"
      >
        <FileUp size={20} />
        Import Excel
      </button>
      <button
        onClick={handleExportTemplate}
        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors"
        title="Download template Excel file"
      >
        <Download size={20} />
        Template
      </button>
    </div>
  );
}
