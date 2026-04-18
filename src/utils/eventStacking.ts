import { TimelineEvent } from '../types/event';
import { Month } from '../types/timeline';
import { EVENT_MIN_WIDTH } from '../constants/timeline';

export interface StackedEvent extends TimelineEvent {
  stackIndex: number;
}

interface EventPlacement {
  event: TimelineEvent;
  startColumn: number;
  endColumn: number;
  visualEndColumn: number; // Includes space needed for title + trailing buffer
  stackIndex: number;
}

// Pixel chrome inside the event row preceding/following the title text:
// outer p-0.5 (2px) + inner 2px + color bar 8px + pl-1 (4px) before the text,
// plus inner 2px + outer 2px after.
const TITLE_CHROME_WIDTH = 20;
// Empty horizontal space reserved after each event so adjacent same-row
// events don't visually touch.
const TRAILING_BUFFER_PX = 24;
// Font matches the .body-lg class applied to the event title in TimelineEvent.tsx.
const TITLE_FONT = '400 16px Avenir, sans-serif';

let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

function measureTextWidth(text: string): number {
  if (typeof document === 'undefined') {
    // SSR / non-browser fallback: approximate at ~8px per character.
    return text.length * 8;
  }
  if (!measureCtx) {
    measureCanvas = document.createElement('canvas');
    measureCtx = measureCanvas.getContext('2d');
    if (measureCtx) measureCtx.font = TITLE_FONT;
  }
  if (!measureCtx) return text.length * 8;
  return measureCtx.measureText(text).width;
}

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

function calculateRequiredColumns(title: string, monthWidth: number): number {
  const textPx = measureTextWidth(title);
  const displayPx = Math.max(EVENT_MIN_WIDTH, textPx + TITLE_CHROME_WIDTH);
  const requiredPx = displayPx + TRAILING_BUFFER_PX;
  return Math.ceil(requiredPx / monthWidth);
}

function hasCollision(placement: EventPlacement, existingPlacements: EventPlacement[]): boolean {
  return existingPlacements.some(existing =>
    existing.stackIndex === placement.stackIndex && // Same row
    placement.startColumn <= existing.visualEndColumn && // New event starts before existing ends
    existing.startColumn <= placement.visualEndColumn // Existing event starts before new ends
  );
}

export function calculateEventStacks(events: TimelineEvent[], months: Month[] = [], monthWidth: number = 28): StackedEvent[] {
  if (!events?.length) return [];

  // Sort events by start date only — earlier events get the top rows.
  // Stable sort preserves array order for equal start dates.
  const sortedEvents = [...events].sort((a, b) => {
    const aStart = new Date(a.startDate).getTime();
    const bStart = new Date(b.startDate).getTime();
    return aStart - bStart;
  });

  const placements: EventPlacement[] = [];

  // Place each event
  for (const event of sortedEvents) {
    // Calculate columns for date span
    const { start: startColumn, end: endColumn } = getEventColumns(event, months);

    // Total visual span the event occupies (title + chrome + trailing buffer).
    const requiredColumns = calculateRequiredColumns(event.title, monthWidth);

    // Use the larger of the date span or the title-driven span.
    const visualEndColumn = Math.max(
      endColumn,
      startColumn + requiredColumns - 1
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
