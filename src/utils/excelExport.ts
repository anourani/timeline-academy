import { utils, writeFile } from 'xlsx';
import { TimelineEvent } from '../types/event';

export function exportEventsToExcel(events: TimelineEvent[], timelineTitle: string): void {
  // Create workbook
  const wb = utils.book_new();
  
  // Create headers and instructions (first two rows)
  const headers = ['Event Title', 'Start Date', 'End Date', 'Category'];
  const instructions = [
    '55 char limit',
    'Format: MM/DD/YYYY',
    'Format: MM/DD/YYYY',
    'Must match a timeline category'
  ];
  
  // Format dates as MM/DD/YYYY
  const formatDate = (isoDate: string) => {
    const date = new Date(isoDate);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };
  
  // Convert events to rows
  const eventRows = events.map(event => [
    event.title,
    formatDate(event.startDate),
    formatDate(event.endDate),
    event.category
  ]);
  
  // Combine all rows
  const data = [
    headers,
    instructions,
    ...eventRows
  ];
  
  // Create worksheet
  const ws = utils.aoa_to_sheet(data);
  
  // Add worksheet to workbook
  utils.book_append_sheet(wb, ws, 'Timeline Events');
  
  // Generate filename with date
  const date = new Date().toISOString().split('T')[0];
  const filename = `${timelineTitle.toLowerCase().replace(/\s+/g, '-')}-${date}.xlsx`;
  
  // Save file
  writeFile(wb, filename);
}