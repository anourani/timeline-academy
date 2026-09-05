import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

/**
 * Concept 3a — the hover affordance for timeline events.
 *
 * While the pointer is anywhere inside an event's box the native cursor is
 * hidden and this disc is drawn in its place: a category-coloured circle with a
 * plus, trailing three damped dots so a fast move leaves a comet and a slow one
 * reads as calm.
 *
 * Nothing here goes through React state per pointer move. A move writes into a
 * ref and one rAF flushes it to the DOM, so crossing a dense timeline never
 * re-renders `TimelineEvent` (which is `memo`'d) or `Timeline` itself. Only the
 * transform and opacity are ever written — no layout properties — and the
 * coordinates are relative to the scroll content, so horizontal scroll needs no
 * recalculation.
 */

export interface EventHoverCursorHandle {
  /** Show or move the cursor. Coordinates are relative to the scroll content. */
  move: (x: number, y: number, color: string) => void;
  /** Hide the cursor and release any press state. */
  hide: () => void;
  /** Press feedback: the disc dips while the button is held. */
  setPressed: (pressed: boolean) => void;
  /** Coarse-pointer launch feedback — one 44px bloom at the tap point. */
  bloom: (x: number, y: number, color: string) => void;
}

const DISC_SIZE = 36;
/** Coarse-pointer bloom is 44px (PRD §6), expressed as a scale of the disc so
 *  the whole cursor animates on `transform` alone — no layout writes. */
const BLOOM_SCALE = 44 / DISC_SIZE;
const ICON_SIZE = 14;
const ICON_STROKE = 2;
const ICON_COLOR = '#FAFAFA';

const EASE = 'cubic-bezier(.2,.9,.2,1)';
const DISC_FOLLOW_MS = 130;
const ENTER_MS = 160;
const EXIT_TRAIL_DELAY_MS = 50;
const PRESS_MS = 90;
const PRESS_SCALE = 0.88;
const HIDDEN_SCALE = 0.5;
const BLOOM_HOLD_MS = 260;

/** size / resting opacity / follow duration / breathe stagger — PRD §3. */
const TRAIL = [
  { size: 14, opacity: 0.55, followMs: 260, breatheDelayMs: 0 },
  { size: 11, opacity: 0.42, followMs: 380, breatheDelayMs: 160 },
  { size: 8, opacity: 0.3, followMs: 500, breatheDelayMs: 320 },
];

/** Category colours are authored as hex (`src/constants/categories.ts`). Anything
 *  else is returned untouched rather than mangled into an invalid colour. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace(/^#/, '');
  const full =
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return color;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

// Propless and driven entirely through the ref, so `memo` makes it inert to
// the parent's renders — the timeline can re-render freely without disturbing
// the styles this component writes to the DOM itself.
export const EventHoverCursor = memo(
  forwardRef<EventHoverCursorHandle>(function EventHoverCursor(_props, ref) {
    const reducedMotion = usePrefersReducedMotion();

    const discPosRef = useRef<HTMLDivElement | null>(null);
    const discRef = useRef<HTMLDivElement | null>(null);
    const trailRefs = useRef<(HTMLDivElement | null)[]>([]);

    const stateRef = useRef({
      x: 0,
      y: 0,
      color: '',
      visible: false,
      pressed: false,
      blooming: false,
    });
    const rafRef = useRef<number | null>(null);
    const bloomTimerRef = useRef<number | null>(null);
    /** Last value painted, so the disc's transition duration can distinguish a
     *  press (90ms) from an enter/exit (160ms). */
    const paintedPressRef = useRef(false);
    // Read inside the rAF, which is not re-created when the media query flips.
    const reducedRef = useRef(reducedMotion);
    reducedRef.current = reducedMotion;

    // Every value `paint` touches lives in a ref, so it never needs rebuilding
    // — which is what keeps the imperative handle below stable too.
    const paint = useCallback(() => {
      rafRef.current = null;
      const st = stateRef.current;
      const reduced = reducedRef.current;

      const pos = discPosRef.current;
      if (pos) {
        pos.style.transform = `translate3d(${st.x}px, ${st.y}px, 0)`;
        pos.style.opacity = st.visible ? '1' : '0';
      }

      const disc = discRef.current;
      if (disc) {
        const scale = !st.visible
          ? HIDDEN_SCALE
          : st.blooming
            ? BLOOM_SCALE
            : !reduced && st.pressed
              ? PRESS_SCALE
              : 1;
        const isPressChange = st.pressed !== paintedPressRef.current;
        paintedPressRef.current = st.pressed;
        disc.style.transitionDuration = reduced
          ? '0ms'
          : `${isPressChange ? PRESS_MS : ENTER_MS}ms`;
        disc.style.transform = `scale(${scale})`;
        if (st.color) {
          disc.style.backgroundColor = st.color;
          disc.style.boxShadow = `0 10px 26px ${withAlpha(st.color, 0.4)}`;
        }
      }

      trailRefs.current.forEach((dot, i) => {
        if (!dot) return;
        const spec = TRAIL[i];
        // The breathe animates opacity, so it has to be off while the dot fades
        // out or it would fight the exit transition.
        dot.style.animation =
          st.visible && !reduced
            ? `timeline-cursor-breathe 1.4s ease-in-out ${spec.breatheDelayMs}ms infinite`
            : 'none';
        dot.style.transform = `translate3d(${st.x}px, ${st.y}px, 0) scale(${
          st.visible ? 1 : 0.4
        })`;
        dot.style.opacity = st.visible ? String(spec.opacity) : '0';
        if (st.color) dot.style.backgroundColor = st.color;
      });
    }, []);

    const schedule = useCallback(() => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(paint);
    }, [paint]);

    const clearBloomTimer = useCallback(() => {
      if (bloomTimerRef.current !== null) {
        window.clearTimeout(bloomTimerRef.current);
        bloomTimerRef.current = null;
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        move: (x, y, color) => {
          clearBloomTimer();
          const st = stateRef.current;
          st.x = x;
          st.y = y;
          st.color = color;
          st.visible = true;
          st.blooming = false;
          schedule();
        },
        hide: () => {
          clearBloomTimer();
          const st = stateRef.current;
          if (!st.visible && !st.pressed) return;
          st.visible = false;
          st.pressed = false;
          st.blooming = false;
          schedule();
        },
        setPressed: (pressed) => {
          const st = stateRef.current;
          if (st.pressed === pressed) return;
          st.pressed = pressed;
          schedule();
        },
        bloom: (x, y, color) => {
          clearBloomTimer();
          const st = stateRef.current;
          st.x = x;
          st.y = y;
          st.color = color;
          st.visible = true;
          st.pressed = false;
          st.blooming = true;
          schedule();
          bloomTimerRef.current = window.setTimeout(() => {
            bloomTimerRef.current = null;
            const s = stateRef.current;
            s.visible = false;
            s.blooming = false;
            schedule();
          }, BLOOM_HOLD_MS);
        },
      }),
      [schedule, clearBloomTimer],
    );

    useEffect(() => {
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        if (bloomTimerRef.current !== null)
          window.clearTimeout(bloomTimerRef.current);
      };
    }, []);

    // Reduced motion collapses every transition to 0ms and drops the trail
    // entirely — the disc simply appears and follows.
    const enterMs = reducedMotion ? 0 : ENTER_MS;
    const followMs = reducedMotion ? 0 : DISC_FOLLOW_MS;

    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 900 }}
        aria-hidden="true"
      >
        {!reducedMotion &&
          TRAIL.map((spec, i) => (
            <div
              key={spec.size}
              ref={(node) => {
                trailRefs.current[i] = node;
              }}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: spec.size,
                height: spec.size,
                margin: `${-spec.size / 2}px 0 0 ${-spec.size / 2}px`,
                borderRadius: '50%',
                opacity: 0,
                pointerEvents: 'none',
                willChange: 'transform, opacity',
                // Exit lags the disc so the comet reads as it leaves.
                transition: `transform ${spec.followMs}ms ${EASE}, opacity 180ms linear ${EXIT_TRAIL_DELAY_MS}ms`,
                ['--dot-opacity' as string]: String(spec.opacity),
              }}
            />
          ))}

        <div
          ref={discPosRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            opacity: 0,
            pointerEvents: 'none',
            willChange: 'transform, opacity',
            transition: `transform ${followMs}ms ${EASE}, opacity ${enterMs}ms linear`,
          }}
        >
          <div
            ref={discRef}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: DISC_SIZE,
              height: DISC_SIZE,
              // Centred on the pointer, so aim is unaffected.
              margin: `${-DISC_SIZE / 2}px 0 0 ${-DISC_SIZE / 2}px`,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `scale(${HIDDEN_SCALE})`,
              // Duration is rewritten per paint — ENTER_MS normally, PRESS_MS
              // on the frame a press starts or releases.
              transition: `transform ${enterMs}ms ${EASE}`,
            }}
          >
            <span
              style={{
                position: 'relative',
                display: 'block',
                width: ICON_SIZE,
                height: ICON_SIZE,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: (ICON_SIZE - ICON_STROKE) / 2,
                  width: ICON_SIZE,
                  height: ICON_STROKE,
                  borderRadius: ICON_STROKE / 2,
                  background: ICON_COLOR,
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: (ICON_SIZE - ICON_STROKE) / 2,
                  top: 0,
                  width: ICON_STROKE,
                  height: ICON_SIZE,
                  borderRadius: ICON_STROKE / 2,
                  background: ICON_COLOR,
                }}
              />
            </span>
          </div>
        </div>
      </div>
    );
  }),
);
