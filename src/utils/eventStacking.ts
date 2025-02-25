import { TimelineEvent } from '../types/event';
import { Month } from '../types/timeline';

export interface StackedEvent extends TimelineEvent {
  stackIndex: number;
}

interface EventPlacement {
  event: TimelineEvent;
  startColumn: number;
  endColumn: number;
  visualEndColumn: number; // Includes space needed for title
  stackIndex: number;
}

// Constants
const COLUMN_WIDTH = 32; // Width of each month column in pixels
const MIN_EVENT_WIDTH = 120; // Minimum width in pixels for title
const CHARS_PER_COLUMN = 2; // Approximate number of characters that fit in one column

function getEventColumns(event: TimelineEvent, months: Month[]): { start: number; end: number } {
  if (!months?.length) return { start: 0, end: 0 };
  
  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);
  
  const startIndex = months.findIndex(
    m => m.year === startDate.getFullYear() && m.month === startDate.getMonth()
  );
  
  const endIndex = months.findIndex(
    m => m.year === endDate.getFullYear() && m.month === endDate.getMonth()
  );
  
  return {
    start: Math.max(0, startIndex),
    end: Math.min(months.length - 1, endIndex)
  };
}

function calculateTitleWidth(title: string): number {
  // Calculate columns needed for title
  const titleWidth = Math.max(MIN_EVENT_WIDTH, title.length * 8); // 8px per character approximation
  return Math.ceil(titleWidth / COLUMN_WIDTH);
}

function hasCollision(placement: EventPlacement, existingPlacements: EventPlacement[]): boolean {
  return existingPlacements.some(existing => 
    existing.stackIndex === placement.stackIndex && // Same row
    placement.startColumn <= existing.visualEndColumn && // New event starts before existing ends
    existing.startColumn <= placement.visualEndColumn // Existing event starts before new ends
  );
}

export function calculateEventStacks(events: TimelineEvent[], months: Month[] = []): StackedEvent[] {
  if (!events?.length) return [];

  // Sort events by start date, then by duration (shorter events first)
  const sortedEvents = [...events].sort((a, b) => {
    const aStart = new Date(a.startDate).getTime();
    const bStart = new Date(b.startDate).getTime();
    
    if (aStart !== bStart) return aStart - bStart;
    
    const aDuration = new Date(a.endDate).getTime() - aStart;
    const bDuration = new Date(b.endDate).getTime() - bStart;
    return aDuration - bDuration;
  });

  const placements: EventPlacement[] = [];

  // Place each event
  for (const event of sortedEvents) {
    // Calculate columns for date span
    const { start: startColumn, end: endColumn } = getEventColumns(event, months);
    
    // Calculate columns needed for title
    const titleColumns = calculateTitleWidth(event.title);
    
    // Calculate total visual space needed (max of date span and title width)
    const visualEndColumn = Math.max(
      endColumn,
      startColumn + titleColumns - 1
    );

    // Find first available row from top
    let stackIndex = 0;
    let placed = false;

    while (!placed) {
      const placement: EventPlacement = {
        event,
        startColumn,
        endColumn,
        visualEndColumn,
        stackIndex
      };

      if (!hasCollision(placement, placements)) {
        placements.push(placement);
        placed = true;
      } else {
        stackIndex++;
      }
    }
  }

  // Convert placements back to stacked events
  return placements.map(p => ({
    ...p.event,
    stackIndex: p.stackIndex
  }));
}