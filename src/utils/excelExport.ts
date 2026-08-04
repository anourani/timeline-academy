import { TimelineEvent } from '../types/event';
import { formatDateForCSV } from './dateUtils';
import { downloadWorkbook, TEMPLATE_HEADERS, templateInstructions } from './excelSheet';

const MAX_TITLE_LENGTH = 55;

export function exportEventsToExcel(events: TimelineEvent[], timelineTitle: string): void {
  const eventRows = events.map(event => [
    event.title,
    formatDateForCSV(event.startDate),
    formatDateForCSV(event.endDate),
    event.category
  ]);

  const data = [
    TEMPLATE_HEADERS,
    templateInstructions(MAX_TITLE_LENGTH),
    ...eventRows
  ];

  const date = new Date().toISOString().split('T')[0];
  const filename = `${timelineTitle.toLowerCase().replace(/\s+/g, '-')}-${date}.xlsx`;

  void downloadWorkbook(data, filename);
}
