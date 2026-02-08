import { TimelineEvent, CategoryConfig } from '../types/event';
import { normalizeDate, isValidDateFormat } from './dateUtils';

interface CSVParseResult {
  events: Omit<TimelineEvent, 'id'>[];
  categories: CategoryConfig[];
  errors: string[];
}

const DEFAULT_COLORS = ['#A770EC', '#FF7D05', '#259E23', '#4196E4'];
const MAX_TITLE_LENGTH = 55;

function isEmptyRow(values: string[]): boolean {
  return values.every(value => !value.trim());
}

function normalizeCategory(category: string): string {
  return category.trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s&_-]/g, '') // Remove special chars except &, _, -
    .replace(/\s*&\s*/g, '_and_') // Convert & to _and_
    .replace(/[-\s]+/g, '_'); // Convert spaces and hyphens to underscores
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let insideQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        // Handle escaped quotes
        currentValue += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // End of field
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  
  // Add the last value
  values.push(currentValue.trim());
  return values;
}

export function parseCSVEvents(csvContent: string, existingCategories: CategoryConfig[]): CSVParseResult {
  // Normalize line endings
  const normalizedContent = csvContent.replace(/\r\n?/g, '\n');
  const lines = normalizedContent.split('\n');
  const events: Omit<TimelineEvent, 'id'>[] = [];
  const errors: string[] = [];
  const categoryMismatches = new Map<string, number[]>(); // category -> row numbers
  
  // Create map of valid categories for quick lookup
  const validCategories = new Set(
    existingCategories.map(cat => normalizeCategory(cat.id))
  );
  
  // Skip header rows and filter out empty lines
  const dataLines = lines
    .slice(2) // Skip first two header rows
    .filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.toLowerCase().includes('character limit');
    });
  
  // Process each data line
  dataLines.forEach((line, index) => {
    const rowNumber = index + 3; // Account for header rows
    
    try {
      // Parse the line
      const values = parseCSVLine(line);
      
      // Skip empty rows silently
      if (isEmptyRow(values)) {
        return;
      }
      
      // Extract fields
      const [title = '', startDate = '', endDate = '', category = ''] = values;
      
      // Only validate non-empty rows
      const missingFields = [];
      if (!title.trim()) missingFields.push('title');
      if (!startDate.trim()) missingFields.push('start date');
      if (!category.trim()) missingFields.push('category');

      if (missingFields.length > 0) {
        errors.push(`Row ${rowNumber}: Missing ${missingFields.join(', ')} for event "${title || 'Untitled'}"`);
        return;
      }

      if (title.length > MAX_TITLE_LENGTH) {
        errors.push(`Row ${rowNumber}: Title "${title}" exceeds ${MAX_TITLE_LENGTH} characters`);
        return;
      }
      
      // Normalize dates
      const normalizedStartDate = normalizeDate(startDate);
      if (!normalizedStartDate || !isValidDateFormat(normalizedStartDate)) {
        errors.push(`Row ${rowNumber}: Invalid start date "${startDate}" - must be in MM/DD/YYYY format`);
        return;
      }

      let normalizedEndDate = normalizedStartDate;
      if (endDate.trim()) {
        normalizedEndDate = normalizeDate(endDate);
        if (!normalizedEndDate || !isValidDateFormat(normalizedEndDate)) {
          errors.push(`Row ${rowNumber}: Invalid end date "${endDate}" - must be in MM/DD/YYYY format`);
          return;
        }
      }
      
      // Normalize and validate category
      const normalizedCategory = normalizeCategory(category);
      
      if (!validCategories.has(normalizedCategory)) {
        // Track category mismatches by row
        if (!categoryMismatches.has(category)) {
          categoryMismatches.set(category, []);
        }
        categoryMismatches.get(category)?.push(rowNumber);
        return; // Skip this event
      }
      
      // Create event with matching category
      events.push({
        title: title.trim(),
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        category: normalizedCategory as any
      });
      
    } catch (error) {
      errors.push(`Row ${rowNumber}: Failed to parse line - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Add category mismatch errors
  categoryMismatches.forEach((rows, category) => {
    const rowList = rows.join(', ');
    errors.push(
      `Category "${category}" in CSV does not match any timeline categories. ` +
      `Events with this category will not be displayed (rows: ${rowList})`
    );
  });

  return { 
    events, 
    categories: existingCategories, // Return existing categories unchanged
    errors 
  };
}

// Create template CSV content
export function getTemplateCSV(): string {
  return `Event Title,Start Date,End Date,Category
Character limit of ${MAX_TITLE_LENGTH},Format: MM/DD/YYYY,Format: MM/DD/YYYY,Must match timeline categories
"Sample Event 1","1/15/2024","1/20/2024","test"
"Sample Event 2","10/14/2024","10/16/2024","test"`;
}