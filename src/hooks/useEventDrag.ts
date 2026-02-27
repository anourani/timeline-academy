import { useState, useRef, useCallback, useEffect } from 'react';
import { TimelineScale } from '../types/timeline';

const DRAG_THRESHOLD = 5;

export interface DragState {
  isDragging: boolean;
  draggedEventId: string | null;
  deltaQuarters: number;
  deltaPixels: number;
}

const INITIAL_STATE: DragState = {
  isDragging: false,
  draggedEventId: null,
  deltaQuarters: 0,
  deltaPixels: 0,
};

export function useEventDrag(
  scale: TimelineScale,
  scrollContainerRef: React.RefObject<HTMLDivElement>,
  onDragEnd: (eventId: string, deltaQuarters: number) => void
) {
  const [dragState, setDragState] = useState<DragState>(INITIAL_STATE);
  const justDraggedRef = useRef(false);

  const dragRef = useRef({
    eventId: '',
    startX: 0,
    startScrollLeft: 0,
    isDragging: false,
    lastDeltaQuarters: 0,
  });

  const reset = useCallback(() => {
    dragRef.current = {
      eventId: '',
      startX: 0,
      startScrollLeft: 0,
      isDragging: false,
      lastDeltaQuarters: 0,
    };
    setDragState(INITIAL_STATE);
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const ref = dragRef.current;
    const scrollDelta = scrollContainerRef.current
      ? scrollContainerRef.current.scrollLeft - ref.startScrollLeft
      : 0;
    const deltaPixels = (e.clientX - ref.startX) + scrollDelta;

    if (!ref.isDragging && Math.abs(deltaPixels) > DRAG_THRESHOLD) {
      ref.isDragging = true;
    }

    if (ref.isDragging) {
      const deltaQuarters = Math.round(deltaPixels / scale.quarterWidth);
      if (deltaQuarters !== ref.lastDeltaQuarters) {
        ref.lastDeltaQuarters = deltaQuarters;
        setDragState({
          isDragging: true,
          draggedEventId: ref.eventId,
          deltaQuarters,
          deltaPixels: deltaQuarters * scale.quarterWidth,
        });
      }
    }
  }, [scale.quarterWidth, scrollContainerRef]);

  const handlePointerUp = useCallback(() => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
    window.removeEventListener('blur', handlePointerUp);

    const ref = dragRef.current;
    if (ref.isDragging) {
      // Flag that a drag just completed so downstream click handlers
      // (e.g. TimelineGrid month click, event click) can suppress themselves.
      justDraggedRef.current = true;
      requestAnimationFrame(() => { justDraggedRef.current = false; });

      if (ref.lastDeltaQuarters !== 0) {
        onDragEnd(ref.eventId, ref.lastDeltaQuarters);
      }
    }

    reset();
  }, [handlePointerMove, onDragEnd, reset]);

  const handlePointerDown = useCallback((eventId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;

    dragRef.current = {
      eventId,
      startX: e.clientX,
      startScrollLeft: scrollContainerRef.current?.scrollLeft ?? 0,
      isDragging: false,
      lastDeltaQuarters: 0,
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('blur', handlePointerUp);
  }, [handlePointerMove, handlePointerUp, scrollContainerRef]);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('blur', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  return { dragState, handlePointerDown, justDraggedRef };
}
