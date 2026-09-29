import { CategoryConfig, TimelineEvent } from '../types/event';
import { formatDateForCSV } from './dateUtils';
import { downloadWorkbook, TEMPLATE_HEADERS, templateInstructions } from './excelSheet';

const MAX_TITLE_LENGTH = 55;

/**
 * The Category column carries the category's *label*, because that is what
 * both importers match on. Writing the id (`category_1`) round-tripped every
 * event into the first category. An id with no matching config falls back to
 * itself rather than an empty cell, so nothing is lost on the way out.
 */
export function exportEventsToExcel(
  events: TimelineEvent[],
  timelineTitle: string,
  categories: readonly CategoryConfig[],
): void {
  const labelOf = new Map(categories.map(c => [c.id, c.label]));
  const eventRows = events.map(event => [
    event.title,
    formatDateForCSV(event.startDate),
    formatDateForCSV(event.endDate),
    labelOf.get(event.category) ?? event.category
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
