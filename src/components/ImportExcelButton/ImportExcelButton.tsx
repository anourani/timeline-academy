import React, { useRef } from 'react';
import { FileUp, Download } from 'lucide-react';
import { read, utils, writeFile } from 'xlsx';
import { TimelineEvent, CategoryConfig } from '../../types/event';

interface ImportExcelButtonProps {
  onImport: (events: Omit<TimelineEvent, 'id'>[], categories: CategoryConfig[]) => void;
  categories: CategoryConfig[];
}

interface ExcelRow {
  'Event Title': string;
  'Start Date': string | number;
  'End Date'?: string | number;
  'Category': string;
}

const MAX_TITLE_LENGTH = 55;
const DEFAULT_COLORS = ['#A770EC', '#FF7D05', '#259E23', '#4196E4'];

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

  const parseExcelDate = (value: string | number): string | null => {
    // Log the incoming value for debugging
    console.log('Parsing date value:', value, 'Type:', typeof value);
    
    if (typeof value === 'number') {
      // Handle Excel serial date number
      const date = new Date(Math.round((value - 25569) * 86400 * 1000));
      const result = date.toISOString().split('T')[0];
      console.log('Parsed Excel serial date:', result);
      return result;
    }

    // Convert to string and clean up
    const dateStr = String(value).trim();
    
    // Handle string date in MM/DD/YYYY format
    const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const [_, month, day, year] = match;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      // Ensure date is valid
      if (isNaN(date.getTime())) {
        console.log('Invalid date from string:', dateStr);
        return null;
      }
      const result = date.toISOString().split('T')[0];
      console.log('Parsed string date:', result);
      return result;
    }

    console.log('Failed to parse date:', dateStr);
    return null;
  };

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

    try {
      // Read Excel file
      console.log('Reading Excel file...');
      const data = await file.arrayBuffer();
      const workbook = read(data, { 
        cellDates: true, // Parse dates as Date objects
        dateNF: 'mm/dd/yyyy' // Preferred date format
      });
      
      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON, skipping first two rows
      const allRows = utils.sheet_to_json<ExcelRow>(worksheet, {
        raw: false, // Convert all values to strings
        dateNF: 'mm/dd/yyyy' // Format dates as MM/DD/YYYY
      });
      const rows = allRows.slice(2); // Skip first two rows
      
      console.log(`Processing ${rows.length} rows`);
      
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
          
          // Log row data for debugging
          console.log(`Processing row ${rowNumber}:`, row);
          
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
          const event = {
            title,
            startDate,
            endDate,
            category: matchingCategory.id
          };
          
          // Log successful event creation
          console.log(`Created event from row ${rowNumber}:`, event);
          
          events.push(event);
          
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
      
      console.log('Parse results:', {
        eventCount: events.length,
        errorCount: errors.length,
        events: events
      });
      
      // Handle errors
      if (errors.length > 0) {
        console.log('Parse errors:', errors);
        alert(errors.join('\n'));
        return;
      }
      
      // Validate event count
      if (events.length === 0) {
        throw new Error('No valid events found in the Excel file');
      }
      
      // Import events with existing categories
      console.log('Importing events...');
      onImport(events, categories);
      console.log('Import successful');
      
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
    // Create workbook
    const wb = utils.book_new();
    
    // Create headers and instructions (first two rows)
    const headers = ['Event Title', 'Start Date', 'End Date', 'Category'];
    const instructions = [
      `${MAX_TITLE_LENGTH} char limit`,
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