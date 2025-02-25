import { TimelineEvent } from '../types/event';
import { formatDateForCSV } from './dateUtils';

export function exportEventsToCSV(events: TimelineEvent[], timelineTitle: string): void {
  // Create CSV header
  const header = 'Event Title,Start Date,End Date,Category\n';
  const formatInfo = 'Character limit of 30,Format: MM/YY or MM/DD/YY,Format: MM/YY or MM/DD/YY,Category must match timeline settings\n';
  
  // Format event data
  const eventRows = events.map(event => {
    const title = `"${event.title}"`; // Wrap title in quotes to handle commas
    const startDate = formatDateForCSV(event.startDate);
    const endDate = formatDateForCSV(event.endDate);
    const category = event.category;
    return `${title},${startDate},${endDate},${category}`;
  }).join('\n');
  
  const csvContent = header + formatInfo + eventRows;
  
  // Create and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const date = new Date().toISOString().split('T')[0];
  const filename = `${timelineTitle.toLowerCase().replace(/\s+/g, '-')}-${date}.csv`;
  
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}