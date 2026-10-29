import React, { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { TimelineHeader } from './TimelineHeader';
import { StreamingSkeleton } from './StreamingSkeleton';
import { TimelineGrid } from './TimelineGrid';
import { TimelineVerticalLines } from './TimelineVerticalLines';
import { TimelineEvent } from './TimelineEvent';
import { EventHoverCursor, EventHoverCursorHandle } from './EventHoverCursor';
import { TimelineEvent as ITimelineEvent, CategoryConfig } from '../../types/event';
import type { WorldEvent, WorldEventsStatus } from '../../types/worldEvents';
import { ScrollTarget, TimelineScale, TimelineVerticalScale } from '../../types/timeline';
import { useRevealQueue } from '../../hooks/useRevealQueue';
import { findMonthIndex, formatYMD, getTimelineRange, shiftEventDates } from '../../utils/dateUtils';
import type { TimelineYearRange } from '../../utils/dateUtils';
import { calculateEventStacks, StackedEvent } from '../../utils/eventStacking';
import { useTimelineScroll } from '../../hooks/useTimelineScroll';
import { useEventDrag } from '../../hooks/useEventDrag';
import { CATEGORY_PADDING, LANE_MIN_HEIGHT, HEADER_HEIGHT, SCROLL_LEAD_IN_MONTHS, WHEEL_SUPPRESS_MS } from '../../constants/timeline';
import { EventForm } from '../EventForm/EventForm';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface TimelineProps {
  events: ITimelineEvent[];
  categories: CategoryConfig[];
  isFullScreen?: boolean;
  onAddEvent?: (event: Omit<ITimelineEvent, 'id'>) => ITimelineEvent | void;
  onUpdateEvent?: (event: ITimelineEvent) => void;
  /** Called whenever an event is clicked, in either mode — it opens the detail
   *  side panel. There is no longer an actions menu on the click path. */
  onOpenDetails?: (event: ITimelineEvent) => void;
  scale: TimelineScale;
  verticalScale: TimelineVerticalScale;
  /**
   * Fixes the axis span instead of deriving it from `events`.
   *
   * Set while a generation is streaming, from its `meta` line. Without it the
   * span grows as events arrive, and because placement is by month index that
   * shifts every column already drawn. `App` must pass the identical override
   * to its own `getTimelineRange` call for the chapters strip, or the chips
   * and the canvas disagree.
   */
  rangeOverride?: TimelineYearRange | null;
  /**
   * Plays the axis-assembly animation: lines drop in from alternating edges,
   * then the month cells fade, then the years lift into place.
   *
   * True only for the mount that follows an AI generation starting, and only
   * until the intro's own timer clears it. Purely decorative — the axis it
   * animates is already correct underneath.
   */
  intro?: boolean;
  /**
   * A generation is filling this canvas.
   *
   * Paces arrivals through a reveal queue, plays each event's entrance, and
   * shows placeholder rows that recede ahead of the fill. Editing is already
   * off by this point — App withholds the handlers — so this is presentation
   * only.
   */
  streaming?: boolean;
  pendingScrollTarget?: ScrollTarget | null;
  onScrollComplete?: () => void;
  /** Id of an event the page wants edited — set by the detail panel's Edit
   *  action, which lives outside this subtree but needs the EventForm dialog
   *  this component owns. Cleared via `onEditRequestHandled`, mirroring the
   *  `pendingScrollTarget` / `onScrollComplete` pair above. */
  pendingEditEventId?: string | null;
  onEditRequestHandled?: () => void;
  /** Left-most visible month, reported on every scroll. The chapters strip
   *  lives above this component and needs the scroll position this component
   *  privately owns — same shape as the two callbacks above, so nothing has to
   *  lift `scrollContainerRef` out. */
  onVisibleMonthChange?: (monthIndex: number) => void;
  /**
   * Edit/View mode. In view mode, edit affordances (drag-to-reschedule,
   * hover-to-add cursor, click-to-edit) are suppressed.
   */
  mode?: 'edit' | 'view';
  /**
   * The World Events lane: read-only context events drawn in their own lane
   * below everything else. Kept apart from `events` on purpose, so they never
   * reach counts, legends, export, autosave or the axis range.
   */
  worldEvents?: WorldEvent[];
  /** 'loading' shows placeholder bars; 'idle' and 'error' hide the lane. */
  worldEventsStatus?: WorldEventsStatus;
  onOpenWorldEventDetails?: (event: WorldEvent) => void;
}

/** The lane's neutral palette — context, so it never competes with a category. */
const WORLD_EVENT_BAR = '#6D7073';
const WORLD_EVENT_FILL = 'rgba(155,158,163,0.12)';
const WORLD_EVENT_TITLE = '#9B9EA3';
/** The lane's tint — carried on through the empty grid below it, so the
 *  context area reads as one region down to the bottom of the canvas. */
const WORLD_EVENT_LANE_BG = 'rgba(255,255,255,0.015)';
/** How long the lane takes to rise into place when it appears. */
const WORLD_LANE_RISE_MS = 600;
/** Room the stacker reserves for the source tag: a 6px gap plus five 10px
 *  JetBrains Mono capitals ("WORLD"). */
const WORLD_EVENT_TAG_PX = 44;

function worldEventTag(event: WorldEvent): string {
  return event.source === 'country' ? event.country ?? '' : 'WORLD';
}

interface LayoutData {
  events: StackedEvent[];
  height: number;
}

export function Timeline({
  events,
  categories,
  isFullScreen,
  onAddEvent,
  onUpdateEvent,
  onOpenDetails,
  scale,
  verticalScale,
  rangeOverride,
  intro = false,
  streaming = false,
  pendingScrollTarget,
  onScrollComplete,
  pendingEditEventId,
  onEditRequestHandled,
  onVisibleMonthChange,
  mode = 'edit',
  worldEvents,
  worldEventsStatus = 'idle',
  onOpenWorldEventDetails,
}: TimelineProps) {
  const isEditing = mode === 'edit';
  // Filter visible categories and their events. Memoized because `months` and
  // `layout` below key off these arrays: rebuilding them every render meant the
  // `layout` memo never hit, so the whole stacking pass — including canvas text
  // measurement per event — re-ran on every render. That is affordable for a
  // 96-month range and is not for the ~3,700 months a 17th-century timeline
  // legitimately spans.
  const visibleCategories = useMemo(
    () => categories.filter(cat => cat.visible),
    [categories]
  );
  // Paced before anything else reads it: stacking, the month range and the
  // bands must all agree on which events exist right now, and the queue is
  // the only thing that decides that during a stream.
  const pacedEvents = useRevealQueue(events, streaming);

  const visibleEvents = useMemo(
    () => pacedEvents.filter(event =>
      visibleCategories.some(cat => cat.id === event.category)
    ),
    [pacedEvents, visibleCategories]
  );

  const { months } = useMemo(
    () => getTimelineRange(visibleEvents, rangeOverride ?? undefined),
    [visibleEvents, rangeOverride],
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<ITimelineEvent | null>(null);
  const [pendingScrollEventId, setPendingScrollEventId] = useState<string | null>(null);
  // Only flips when the pointer enters or leaves an event, never per move, so
  // the hover cursor costs at most two renders per event crossed.
  const [isOverEvent, setIsOverEvent] = useState(false);

  const gridContentRef = useRef<HTMLDivElement>(null);
  const hoverCursorRef = useRef<EventHoverCursorHandle>(null);
  const hoveredEventIdRef = useRef<string | null>(null);

  // The wheel lerp's state, held in refs rather than as locals of the effect
  // that uses them, so `scrollToTarget` can reach in and stop the loop.
  // Assigning `scrollLeft` aborts an in-flight smooth scroll — so a lerp still
  // running from a recent wheel tick used to overwrite a chapter jump frame by
  // frame and haul the canvas back to its own stale target. That reads as a
  // dead chip, and only ever after you had just scrolled.
  const wheelTargetRef = useRef(0);
  const wheelRafRef = useRef<number | null>(null);
  // Deadline until which wheel events are swallowed, so the tail of a trackpad
  // flick can't cancel the jump the click after it asked for.
  const wheelSuppressUntilRef = useRef(0);
  // The last `pendingScrollTarget` already acted on, so a re-render mid-scroll
  // doesn't re-issue a jump that is already under way.
  const handledScrollTargetRef = useRef<ScrollTarget | null>(null);

  const { scrollLeft } = useTimelineScroll(scrollContainerRef, months.length * 4);

  // Straight from `scrollLeft` against the month width the grid is actually
  // laid out with, rather than via `visibleRange`. That counts quarter-columns
  // sized from the container's measured `scrollWidth`, which runs a pixel wider
  // than the grid's own `minWidth` — enough, once floored to a quarter and
  // floored again to a month, to report the left edge a whole month early at a
  // boundary. The chapters strip reads this to decide which chip is active, so
  // that month came straight off the lead in `findActiveChapter`.
  //
  // Reported through an effect rather than from the scroll handler so
  // subscribers only hear about it once per settled render, whatever the wheel
  // lerp is doing.
  const visibleMonthIndex = Math.max(0, Math.floor(scrollLeft / scale.monthWidth));
  useEffect(() => {
    onVisibleMonthChange?.(visibleMonthIndex);
  }, [visibleMonthIndex, onVisibleMonthChange]);

  // Translate vertical wheel into smooth horizontal scroll. A rAF loop lerps
  // scrollLeft toward an accumulated target so fast ticks glide instead of
  // jumping. Scoped to the container ref so wheel events inside side panels
  // and dialogs (rendered outside this subtree) keep their native vertical scroll.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    wheelTargetRef.current = el.scrollLeft;

    const step = () => {
      const current = el.scrollLeft;
      const diff = wheelTargetRef.current - current;
      if (Math.abs(diff) < 0.5) {
        el.scrollLeft = wheelTargetRef.current;
        wheelRafRef.current = null;
        return;
      }
      el.scrollLeft = current + diff * 0.18;
      wheelRafRef.current = requestAnimationFrame(step);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;

      // A jump was kicked off moments ago. A trackpad keeps delivering inertial
      // wheel events for a second or more after the fingers lift, and any one of
      // them would abort the smooth scroll — so the click would lose to the
      // gesture that preceded it. Swallow them, rolling the deadline forward
      // while the stream stays unbroken: that continuity is what marks it as
      // inertia. A deliberate scroll arrives after a pause and gets through.
      const now = performance.now();
      if (now < wheelSuppressUntilRef.current) {
        // Without this the browser scrolls the container natively, which aborts
        // the jump just as surely as the lerp would.
        e.preventDefault();
        wheelSuppressUntilRef.current = now + WHEEL_SUPPRESS_MS;
        return;
      }

      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.deltaY === 0) return;

      e.preventDefault();

      // Normalize line/page delta modes to pixels.
      const delta =
        e.deltaMode === 1 ? e.deltaY * 16
        : e.deltaMode === 2 ? e.deltaY * el.clientHeight
        : e.deltaY;

      const maxScroll = el.scrollWidth - el.clientWidth;
      // Resyncing whenever the loop is idle is also what lets a wheel interrupt
      // a jump: `scrollToTarget` leaves the ref null, so this picks up the live
      // mid-flight position rather than wherever the last wheel was headed.
      if (wheelRafRef.current === null) wheelTargetRef.current = el.scrollLeft;
      wheelTargetRef.current = Math.max(0, Math.min(maxScroll, wheelTargetRef.current + delta));

      if (wheelRafRef.current === null) wheelRafRef.current = requestAnimationFrame(step);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (wheelRafRef.current !== null) {
        cancelAnimationFrame(wheelRafRef.current);
        wheelRafRef.current = null;
      }
    };
  }, []);

  const scrollToTarget = useCallback((target: ScrollTarget) => {
    const el = scrollContainerRef.current;
    if (!months.length || !el) return;

    // `findMonthIndex` rather than an exact match: it clamps a date outside
    // the rendered range to the nearest edge. Chapter boundaries sit near the
    // padded ends of that range, and an exact lookup silently no-ops there —
    // which reads as a dead chip.
    const monthIndex = findMonthIndex(months, typeof target === 'string' ? target : target.date);
    if (monthIndex === -1) return;

    const pixelOffset = monthIndex * scale.monthWidth;
    const targetLeft = typeof target === 'string'
      // Centre the month, which is what a single-date jump has always meant.
      ? pixelOffset - (el.clientWidth / 2) + (scale.monthWidth / 2)
      // Park it at the left edge, so the whole chapter sits ahead of you
      // rather than behind. The lead-in keeps a sliver of the previous
      // chapter on screen, so the boundary reads as a boundary.
      : pixelOffset - (SCROLL_LEAD_IN_MONTHS * scale.monthWidth);

    // One scroll authority at a time. The wheel lerp writes `scrollLeft`
    // directly, which aborts an in-flight smooth scroll, so a jump issued
    // within a second of a wheel tick would be overwritten frame by frame and
    // dragged back to the wheel's target. Deliberately not resyncing
    // `wheelTargetRef` here: leaving the loop idle is what lets the next wheel
    // tick pick up the live position and interrupt this jump cleanly.
    if (wheelRafRef.current !== null) {
      cancelAnimationFrame(wheelRafRef.current);
      wheelRafRef.current = null;
    }
    wheelSuppressUntilRef.current = performance.now() + WHEEL_SUPPRESS_MS;

    // The browser clamps to `scrollWidth - clientWidth` on its own, so a
    // chapter near the end of the canvas lands as far left as the canvas
    // allows rather than flush. Floor at 0 for the same reason at the start.
    // Native rather than the lerp above, which would have to clamp by hand
    // against a width that is still animating after a scale change, has no
    // ease-in over a long jump, and ignores `prefers-reduced-motion`.
    el.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
  }, [months, scale.monthWidth]);

  // Drag-and-drop event repositioning
  const handleDragEnd = useCallback((eventId: string, deltaQuarters: number) => {
    const event = events.find(e => e.id === eventId);
    if (!event || deltaQuarters === 0 || !onUpdateEvent) return;

    const { startDate: newStart, endDate: newEnd } = shiftEventDates(event, deltaQuarters);
    if (newStart === event.startDate && newEnd === event.endDate) return;

    onUpdateEvent({ ...event, startDate: newStart, endDate: newEnd });
  }, [events, onUpdateEvent]);

  const { dragState, handlePointerDown, justDraggedRef } = useEventDrag(scale, scrollContainerRef, handleDragEnd);

  // Handle a scroll target from outside this subtree — bulk-add in
  // EventTableEditor, the first-event jump after a generation, or a chapter chip.
  // `onScrollComplete` is an inline arrow in both hosts and this component is
  // not memoised, so while a target is set this re-runs on every render — and
  // renders arrive every frame while anything is scrolling. Deduping on the
  // target's identity keeps that to one `scrollToTarget` per request. A
  // cleanup that cancelled the pending frame instead would be worse than the
  // duplicates: each render would cancel and reschedule, so a jump requested
  // mid-scroll could be starved of the frame it needs indefinitely.
  useEffect(() => {
    if (!pendingScrollTarget) return;
    if (handledScrollTargetRef.current === pendingScrollTarget) return;
    handledScrollTargetRef.current = pendingScrollTarget;
    requestAnimationFrame(() => {
      scrollToTarget(pendingScrollTarget);
      onScrollComplete?.();
    });
  }, [pendingScrollTarget, scrollToTarget, onScrollComplete]);

  // Compute layout: either one band per visible category (grouped mode)
  // or a single band containing all visible events (default).
  /**
   * Where the viewport sits when the intro begins, in grid coordinates.
   *
   * The assembly is keyed to what the user can see — "line 0" is the
   * leftmost visible one, not the far-off start of a grid that may be three
   * thousand months wide. Measured once: recomputing on scroll would restart
   * delays for cells mid-flight.
   */
  const introAnchor = React.useMemo(() => {
    if (!intro) return { first: 0, firstYear: null as number | null };
    const el = scrollContainerRef.current;
    const first = Math.floor((el?.scrollLeft ?? 0) / scale.monthWidth);
    return { first, firstYear: months[first]?.year ?? months[0]?.year ?? null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro]);

  /**
   * The right edge of the fill so far, in viewport pixels.
   *
   * The skeleton retires a bar once a real event reaches it. Events arrive
   * in ascending date order, so the last one placed is the furthest right —
   * no need to scan them all. Converted out of grid space and past the
   * current scroll so it lines up with bars positioned in viewport pixels.
   */
  const revealedThroughX = React.useMemo(() => {
    if (!streaming || visibleEvents.length === 0) return null;
    const last = visibleEvents[visibleEvents.length - 1];
    const monthIndex = findMonthIndex(months, last.startDate);
    if (monthIndex === -1) return null;
    const scrollLeft = scrollContainerRef.current?.scrollLeft ?? 0;
    return monthIndex * scale.monthWidth - scrollLeft;
  }, [streaming, visibleEvents, months, scale.monthWidth]);

  const rowHeight = verticalScale.eventRowHeight;

  // Every visible event shares one band, stacked in a single pass; colour is
  // what tells the categories apart.
  const layout = React.useMemo<LayoutData>(() => {
    const events = calculateEventStacks(visibleEvents, months, scale.monthWidth);
    const maxStack = Math.max(...events.map(event => event.stackIndex), 0);
    const height = events.length === 0
      ? rowHeight
      : (maxStack + 1) * rowHeight + CATEGORY_PADDING;
    return { events, height };
  }, [visibleEvents, months, scale.monthWidth, rowHeight]);

  /**
   * The World Events lane. Never shown mid-stream — the timeline it gives
   * context to isn't settled yet — and hidden outright on error (the Design
   * menu says what went wrong).
   *
   * Only events inside the axis the user's own content already set are
   * drawn: the lane adds context to a span, it never widens it.
   */
  const worldLane = React.useMemo(() => {
    const visible = !streaming && (worldEventsStatus === 'loading' || worldEventsStatus === 'ready');
    if (!visible || months.length === 0) return null;
    const first = months[0];
    const last = months[months.length - 1];
    const min = formatYMD(first.year, 0, 1);
    const max = formatYMD(last.year, 11, 31);
    const inRange = (worldEvents ?? []).filter(e => e.startDate >= min && e.endDate <= max);
    const stacked = worldEventsStatus === 'ready'
      ? calculateEventStacks(inRange, months, scale.monthWidth, WORLD_EVENT_TAG_PX)
      : [];
    const maxStack = Math.max(...stacked.map(e => e.stackIndex), 0);
    const height = Math.max(
      (maxStack + 1) * rowHeight + CATEGORY_PADDING,
      LANE_MIN_HEIGHT,
    );
    return { events: stacked, height, loading: worldEventsStatus === 'loading' };
  }, [streaming, worldEventsStatus, worldEvents, months, scale.monthWidth, rowHeight]);

  /**
   * The lane rises into place from the bottom edge of the screen whenever it
   * appears — switched on, or arriving once a timeline settles — rather than
   * popping in. Its label lives outside the scrolling canvas, so both nodes
   * play the same animation.
   *
   * Web Animations rather than a CSS keyframe, because the distance is the
   * gap between the lane's resting place and the bottom of the viewport,
   * which is only known once the lane is laid out. A layout effect measures
   * and starts it before the first paint, so the lane is never seen resting
   * in place first. Reduced motion gets a short fade instead of the travel.
   */
  const worldLaneRef = useRef<HTMLDivElement>(null);
  const worldLaneLabelRef = useRef<HTMLDivElement>(null);
  const worldLaneShown = worldLane !== null;
  useLayoutEffect(() => {
    if (!worldLaneShown) return;
    const lane = worldLaneRef.current;
    if (!lane || typeof lane.animate !== 'function') return;
    const nodes = [lane, worldLaneLabelRef.current].filter((n): n is HTMLDivElement => n !== null);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const distance = Math.max(0, window.innerHeight - lane.getBoundingClientRect().top);
    const animations = nodes.map((node) =>
      reduce
        ? node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'linear' })
        : node.animate(
            [
              { transform: `translateY(${distance}px)`, opacity: 0 },
              { transform: 'translateY(0)', opacity: 1 },
            ],
            { duration: WORLD_LANE_RISE_MS, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' },
          ),
    );
    return () => animations.forEach((a) => a.cancel());
  }, [worldLaneShown]);

  const handleMonthClick = useCallback((monthIndex: number) => {
    if (!isEditing || !onAddEvent || justDraggedRef.current) return;

    const clickedMonth = months[monthIndex];
    if (clickedMonth) {
      // Built from the parts directly: `new Date(y, m, 1).toISOString()` shifts
      // to the previous day west of UTC, and coerces a year below 100 into
      // 19xx.
      setSelectedDate(formatYMD(clickedMonth.year, clickedMonth.month, 1));
      setEditingEvent(null);
      setShowEventModal(true);
    }
  }, [months, onAddEvent, justDraggedRef, isEditing]);

  // One click, one outcome, in both modes: open the detail panel. The panel
  // itself handles cached content vs. fresh generation. Edit and Delete now
  // live in the panel's header rather than on the click path.
  const handleEventClick = useCallback(
    (eventId: string) => {
      if (justDraggedRef.current) return;
      const event = events.find(e => e.id === eventId);
      if (event) onOpenDetails?.(event);
    },
    [events, justDraggedRef, onOpenDetails],
  );

  const handleWorldEventClick = useCallback(
    (eventId: string) => {
      const event = worldEvents?.find(e => e.id === eventId);
      if (event) onOpenWorldEventDetails?.(event);
    },
    [worldEvents, onOpenWorldEventDetails],
  );

  // The detail panel's Edit action reaches the EventForm dialog through here —
  // the panel is mounted by the page, outside this subtree.
  useEffect(() => {
    if (!pendingEditEventId) return;
    const target = events.find(e => e.id === pendingEditEventId);
    if (target) {
      setEditingEvent(target);
      setSelectedDate(null);
      setShowEventModal(true);
    }
    onEditRequestHandled?.();
  }, [pendingEditEventId, events, onEditRequestHandled]);

  const handleSubmit = useCallback((eventData: Omit<ITimelineEvent, 'id'>) => {
    let newEventId: string | null = null;
    if (editingEvent) {
      onUpdateEvent?.({ ...eventData, id: editingEvent.id });
    } else {
      const newEvent = onAddEvent?.(eventData);
      if (newEvent && typeof newEvent === 'object' && 'id' in newEvent) {
        newEventId = newEvent.id;
      }
    }
    setShowEventModal(false);
    setEditingEvent(null);
    setSelectedDate(null);

    requestAnimationFrame(() => {
      scrollToTarget(eventData.startDate);
    });

    if (newEventId) {
      // Defer until after the next layout pass so the event has a stackIndex
      // and rendered DOM node we can scroll to.
      setPendingScrollEventId(newEventId);
    }
  }, [editingEvent, onAddEvent, onUpdateEvent, scrollToTarget]);

  // --- Hover cursor (concept 3a) -----------------------------------------
  // One delegated listener on the grid container regardless of event count.
  // `closest('[data-event-id]')` resolves the hovered event; the cursor is
  // then driven imperatively, so a move never re-renders anything.

  const clearHoverCursor = useCallback(() => {
    hoverCursorRef.current?.hide();
    if (hoveredEventIdRef.current !== null) {
      hoveredEventIdRef.current = null;
      setIsOverEvent(false);
    }
  }, []);

  const handleGridPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Touch and pen get no custom cursor — there is no hover to express.
      if (e.pointerType !== 'mouse') return;
      // During a drag the native `cursor: grabbing` is the affordance.
      if (dragState.isDragging) {
        clearHoverCursor();
        return;
      }

      const target = e.target as Element | null;
      const eventEl = target?.closest?.('[data-event-id]') as HTMLElement | null;
      if (!eventEl) {
        clearHoverCursor();
        return;
      }

      const content = gridContentRef.current;
      if (!content) return;
      const rect = content.getBoundingClientRect();
      hoverCursorRef.current?.move(
        e.clientX - rect.left,
        e.clientY - rect.top,
        eventEl.dataset.eventColor || '#666',
      );

      const id = eventEl.dataset.eventId ?? null;
      if (hoveredEventIdRef.current !== id) {
        hoveredEventIdRef.current = id;
        setIsOverEvent(true);
      }
    },
    [dragState.isDragging, clearHoverCursor],
  );

  const handleGridPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const target = e.target as Element | null;
    if (!target?.closest?.('[data-event-id]')) return;
    hoverCursorRef.current?.setPressed(true);
  }, []);

  const handleGridPointerUp = useCallback(() => {
    hoverCursorRef.current?.setPressed(false);
  }, []);

  // Coarse pointers get one 44px bloom at the tap point as launch feedback
  // instead of a cursor that follows nothing.
  const handleGridPointerDownCoarse = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse') return;
      const target = e.target as Element | null;
      const eventEl = target?.closest?.('[data-event-id]') as HTMLElement | null;
      const content = gridContentRef.current;
      if (!eventEl || !content) return;
      const rect = content.getBoundingClientRect();
      hoverCursorRef.current?.bloom(
        e.clientX - rect.left,
        e.clientY - rect.top,
        eventEl.dataset.eventColor || '#666',
      );
    },
    [],
  );

  // A drag starting under the cursor must take it away immediately, not on the
  // next move — otherwise the plus disc rides along with the grabbed event.
  useEffect(() => {
    if (dragState.isDragging) clearHoverCursor();
  }, [dragState.isDragging, clearHoverCursor]);

  const handleEventMounted = useCallback((eventId: string, node: HTMLDivElement | null) => {
    if (!node) return;
    if (eventId === pendingScrollEventId) {
      // scrollIntoView handles vertical scroll on the page; horizontal scroll
      // is handled separately by scrollToTarget.
      node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      setPendingScrollEventId(null);
    }
  }, [pendingScrollEventId]);

  return (
    <div className={isFullScreen ? 'h-[calc(100vh-6rem)] relative' : 'flex-1 min-h-0 flex flex-col relative'}>
      {/* The World Events lane's label: a pill in a neutral tint, sitting
          against the lane's top-left corner. */}
      {worldLane && (
        <div
          ref={worldLaneLabelRef}
          className="absolute left-0 z-10 pointer-events-none"
          style={{
            top: HEADER_HEIGHT + layout.height,
            height: worldLane.height,
            transition: 'top 220ms ease, height 220ms ease',
          }}
        >
          <div className="flex items-start pt-2 pl-6">
            <div
              className="rounded-[4px] p-2 backdrop-blur-[2px] leading-none"
              style={{ backgroundColor: 'rgba(155,158,163,0.18)' }}
            >
              <span className="label-small-allcaps whitespace-nowrap">World Events</span>
            </div>
          </div>
        </div>
      )}

      <div className="relative flex-1 min-h-0 flex flex-col">
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-auto scrollbar-hide"
        >
          <div
            ref={gridContentRef}
            className="relative timeline-grid transition-[min-width] duration-200 ease-in-out flex flex-col"
            style={{
              minWidth: `${months.length * scale.monthWidth}px`,
              minHeight: '100%',
              cursor: isEditing && onAddEvent ? 'pointer' : 'default'
            }}
            onPointerMove={handleGridPointerMove}
            onPointerLeave={clearHoverCursor}
            onPointerDown={(e) => {
              handleGridPointerDown(e);
              handleGridPointerDownCoarse(e);
            }}
            onPointerUp={handleGridPointerUp}
            onPointerCancel={handleGridPointerUp}
          >
            <TimelineHeader
              months={months}
              scale={scale}
              intro={intro}
              introFirstVisible={introAnchor.first}
              introFirstVisibleYear={introAnchor.firstYear}
            />
            <div className="relative flex-1 min-h-0 flex flex-col">
              <TimelineVerticalLines
                months={months}
                scale={scale}
                scrollContainerRef={scrollContainerRef}
                intro={intro}
              />
              <div
                className="relative shrink-0"
                style={{
                  height: layout.height,
                  // The seam above the World Events lane: dashed, so it
                  // reads as "below here is context" rather than more of
                  // the timeline. Drawn inside the band's height (border-box).
                  borderBottom: worldLane ? '1px dashed #262626' : undefined,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${months.length * 4}, ${scale.quarterWidth}px)`,
                  ['--event-row-height' as string]: `${rowHeight}px`,
                  gridAutoRows: 'var(--event-row-height)',
                  gap: 0,
                  transition: 'height 220ms ease, --event-row-height 220ms ease',
                }}
              >
                <TimelineGrid
                  months={months}
                  height={layout.height}
                  onMonthHover={setHoveredMonth}
                  onMonthClick={handleMonthClick}
                  scale={scale}
                />
                {layout.events.map((event) => {
                  // Same in both modes now — a click always opens details.
                  const canHandleClick = !!onOpenDetails;
                  return (
                    <TimelineEvent
                      key={event.id}
                      event={event}
                      months={months}
                      categoryColor={visibleCategories.find(c => c.id === event.category)?.color}
                      onEventClick={canHandleClick ? handleEventClick : undefined}
                      scale={scale}
                      isDragging={dragState.isDragging && dragState.draggedEventId === event.id}
                      dragDeltaPixels={dragState.draggedEventId === event.id ? dragState.deltaPixels : 0}
                      onPointerDown={isEditing && onUpdateEvent ? handlePointerDown : undefined}
                      rowHeight={rowHeight}
                      onMounted={handleEventMounted}
                      revealOnMount={streaming}
                      suppressStackAnimation={streaming}
                    />
                  );
                })}
              </div>

              {worldLane && (
                <div
                  ref={worldLaneRef}
                  className="relative shrink-0"
                  style={{
                    height: worldLane.height,
                    backgroundColor: WORLD_EVENT_LANE_BG,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${months.length * 4}, ${scale.quarterWidth}px)`,
                    ['--event-row-height' as string]: `${rowHeight}px`,
                    gridAutoRows: 'var(--event-row-height)',
                    gap: 0,
                    transition: 'height 220ms ease, --event-row-height 220ms ease',
                  }}
                >
                  <TimelineGrid
                    months={months}
                    height={worldLane.height}
                    onMonthHover={setHoveredMonth}
                    onMonthClick={handleMonthClick}
                    scale={scale}
                  />
                  {worldLane.loading && (
                    // The skeleton draws in viewport pixels, so it rides a
                    // sticky, viewport-wide strip to stay in view however far
                    // the canvas is scrolled.
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <div className="sticky left-0 h-full w-screen">
                        <StreamingSkeleton rowHeight={rowHeight} revealedThroughX={null} />
                      </div>
                    </div>
                  )}
                  {worldLane.events.map((event) => (
                    // Read-only context: no drag handle, and a click opens the
                    // detail panel in its read-only form. Each entry fades in
                    // with the same reveal a streamed event plays.
                    <TimelineEvent
                      key={event.id}
                      event={event}
                      months={months}
                      categoryColor={WORLD_EVENT_BAR}
                      rangeFill={WORLD_EVENT_FILL}
                      titleColor={WORLD_EVENT_TITLE}
                      tag={worldEventTag(event)}
                      onEventClick={onOpenWorldEventDetails ? handleWorldEventClick : undefined}
                      scale={scale}
                      rowHeight={rowHeight}
                      revealOnMount
                    />
                  ))}
                </div>
              )}

              {/* Placeholder rows, in the same coordinate space as the
                  events that replace them. Absolute over the bands rather
                  than inside one, because the pattern spans rows and must
                  not be re-laid-out as band heights grow with the fill. */}
              {streaming && (
                <StreamingSkeleton
                  rowHeight={rowHeight}
                  revealedThroughX={revealedThroughX}
                />
              )}

              {/* Filler: extends the body through remaining vertical space.
                  flex-1 lets it fill the scroll container when events are short,
                  and the whole grid scrolls vertically when they aren't. */}
              <div
                className="relative flex-1 min-h-0"
                // The tint fades in as the lane rises above it, rather than
                // the empty grid turning grey before the lane gets there.
                style={{
                  backgroundColor: worldLane ? WORLD_EVENT_LANE_BG : 'transparent',
                  transition: `background-color ${WORLD_LANE_RISE_MS}ms var(--ease-enter)`,
                }}
              >
                <TimelineGrid
                  months={months}
                  onMonthHover={setHoveredMonth}
                  onMonthClick={handleMonthClick}
                  scale={scale}
                />
              </div>
            </div>

            {/* Add Event Cursor — hidden during drag, in view mode, and while
                the pointer is over an event, so the "add here" band and the
                "open this" cursor never appear at the same time. */}
            {hoveredMonth !== null && isEditing && onAddEvent && !dragState.isDragging && !isOverEvent && (
              <div
                className="absolute top-[64px] bottom-0 bg-[#FBFBFB]/25 pointer-events-none transition-transform duration-75 ease-out"
                style={{
                  transform: `translateX(${hoveredMonth * scale.monthWidth}px)`,
                  width: `${scale.monthWidth}px`,
                }}
              />
            )}

            {/* Event hover cursor — last child so it paints above the grid and
                every event. Every part is pointer-events: none. */}
            <EventHoverCursor ref={hoverCursorRef} />
          </div>
        </div>
      </div>

      {/* Event Dialog */}
      <Dialog
        open={showEventModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowEventModal(false);
            setEditingEvent(null);
            setSelectedDate(null);
          }
        }}
      >
        <DialogContent className="bg-surface-secondary border-[rgba(210,210,210,0.15)] max-w-[360px] rounded-[20px] px-5 py-6">
          <DialogHeader>
            <DialogTitle className="header-small text-[#c9ced4] text-center">
              {editingEvent ? 'Edit Event' : 'Add Event'}
            </DialogTitle>
          </DialogHeader>
          <EventForm
            onSubmit={handleSubmit}
            categories={visibleCategories}
            initialStartDate={selectedDate}
            initialEvent={editingEvent}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
