import {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { classifySubject, streamTimeline } from '@/services/aiTimeline'
import { getKey } from '@/services/userApiKey'
import { supabase } from '@/lib/supabase'
import {
  getCurrentLimits,
  isOverEventLimit,
  isOverTimelineLimit,
} from '@/lib/limits'
import { DEFAULT_CATEGORIES } from '@/constants/categories'
import { PILL_DEFINITIONS, type SubjectType } from '@/constants/pillDefinitions'
import { trialDraftStore } from '@/utils/draftStorage'
import type { CategoryConfig, TimelineEvent } from '@/types/event'
import type {
  ByokProvider,
  StreamChapter,
  StreamMeta,
  TimelineStreamHandlers,
} from '@/types/ai'

export type GenerationStatus =
  | 'idle'
  | 'classifying'
  | 'streaming'
  | 'done'
  | 'error'
  | 'cancelled'

export interface GenerationState {
  /** One per Enter. The editor latches on this so a second generation
   *  re-seeds rather than being mistaken for the one already showing. */
  id: string
  subject: string
  status: GenerationStatus
  subjectType: SubjectType | null
  categories: CategoryConfig[]
  meta: StreamMeta | null
  chapters: StreamChapter[]
  events: TimelineEvent[]
  error: string | null
  /** Set when the failure came from a specific BYOK provider, so the search
   *  page can offer a retry against the other one. */
  errorProvider: ByokProvider | null
}

export interface GenerationContextValue extends GenerationState {
  /** True while the editor should render this store rather than its own state. */
  active: boolean
  start: (subject: string, providerOverride?: ByokProvider) => Promise<void>
  cancel: () => void
  reset: () => void
  /** The other provider, offered only when the user has a key for it. */
  retryProvider: ByokProvider | null
}

const IDLE: GenerationState = {
  id: '',
  subject: '',
  status: 'idle',
  subjectType: null,
  categories: [],
  meta: null,
  chapters: [],
  events: [],
  error: null,
  errorProvider: null,
}

export const GenerationContext = createContext<GenerationContextValue | null>(
  null,
)

/**
 * The in-flight AI generation, hoisted above the router.
 *
 * It lives here because the search page and the editor are different routes.
 * Generation starts on `/` and finishes on `/editor`, so a store owned by
 * either one would be torn down mid-stream — `AIModePage` unmounts the moment
 * we navigate, and callbacks would be firing at a component that no longer
 * exists.
 *
 * The editor renders straight off this store while a generation is running
 * and commits to its own state exactly once, at `done`. That is what keeps a
 * half-built timeline from ever reaching a store: autosave fingerprints
 * `events`, the guest draft write is gated on `activeDraftId`, and the trial
 * unload warning on `events.length` — none of which this store touches.
 */
export function GenerationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GenerationState>(IDLE)
  const abortRef = useRef<AbortController | null>(null)
  // The run this callback belongs to. A cancel followed immediately by a new
  // Enter would otherwise let the old stream's in-flight frames append to the
  // new run's events.
  const runIdRef = useRef<string>('')

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    runIdRef.current = ''
    setState(IDLE)
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    runIdRef.current = ''
    setState((prev) =>
      prev.status === 'classifying' || prev.status === 'streaming'
        ? { ...prev, status: 'cancelled' }
        : prev,
    )
  }, [])

  const start = useCallback(
    async (subject: string, providerOverride?: ByokProvider) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const runId = crypto.randomUUID()
      runIdRef.current = runId
      const isCurrent = () => runIdRef.current === runId && !controller.signal.aborted

      setState({
        ...IDLE,
        id: runId,
        subject,
        status: 'classifying',
      })

      const fail = (message: string, provider: ByokProvider | null = null) => {
        if (!isCurrent()) return
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: message,
          errorProvider: provider,
        }))
      }

      // Capacity, before a single token is spent.
      //
      // The trial slot is checked synchronously by the caller before it
      // navigates — see AIModePage. These are the signed-in limits, which are
      // network round trips and so cannot gate a navigation that has to feel
      // instant. They still run before classify, so hitting a limit costs
      // nothing; the editor bounces back to the search page with the message.
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!isCurrent()) return

        if (user) {
          const [eventsResult, timelinesResult] = await Promise.all([
            supabase.rpc('get_user_event_count'),
            supabase
              .from('timelines')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id),
          ])
          if (!isCurrent()) return

          const { eventLimit, timelineLimit } = getCurrentLimits()
          const eventCount =
            typeof eventsResult.data === 'number' ? eventsResult.data : 0
          const timelineCount = timelinesResult.count ?? 0

          if (isOverTimelineLimit(timelineCount)) {
            fail(
              `You've reached the ${timelineLimit}-timeline limit. Delete a timeline to create a new one, or upgrade.`,
            )
            return
          }
          if (isOverEventLimit(eventCount)) {
            fail(
              `You've reached the ${eventLimit}-event limit. Delete events to make room, or upgrade.`,
            )
            return
          }
        }
      } catch (err) {
        fail((err as Error).message || 'Could not check your plan limits')
        return
      }

      // Classification. Cheap, and it resolves the category lenses the
      // generation prompt needs — so it stays a separate blocking step rather
      // than folding into the stream.
      let type: SubjectType
      try {
        const result = await classifySubject(subject, providerOverride)
        if (!isCurrent()) return
        type = result.type
      } catch (err) {
        const provider =
          (err as { provider?: ByokProvider }).provider ?? providerOverride ?? null
        fail((err as Error).message || 'Failed to classify subject', provider)
        return
      }

      const pills = PILL_DEFINITIONS[type]
      const categories: CategoryConfig[] = DEFAULT_CATEGORIES.map(
        (defaultCat, i) => ({
          ...defaultCat,
          label: pills[i]?.label ?? defaultCat.label,
        }),
      )

      setState((prev) =>
        prev.id === runId
          ? { ...prev, status: 'streaming', subjectType: type, categories }
          : prev,
      )

      const handlers: TimelineStreamHandlers = {
        onMeta: (meta) => {
          if (!isCurrent()) return
          setState((prev) => {
            if (prev.id !== runId) return prev
            // categoryMapping is the model's own labelling of the lenses it
            // was given, so it wins over the generic pill labels once it
            // arrives. Absent, the pill labels stand.
            const mapped = meta.categoryMapping
              ? prev.categories.map((cat, i) => ({
                  ...cat,
                  label: meta.categoryMapping?.[`category_${i + 1}`] || cat.label,
                }))
              : prev.categories
            return { ...prev, meta, categories: mapped }
          })
        },
        onChapter: (chapter) => {
          if (!isCurrent()) return
          setState((prev) =>
            prev.id === runId
              ? { ...prev, chapters: [...prev.chapters, chapter] }
              : prev,
          )
        },
        onEvent: (event) => {
          if (!isCurrent()) return
          setState((prev) =>
            prev.id === runId
              ? {
                  ...prev,
                  events: [...prev.events, { ...event, id: crypto.randomUUID() }],
                }
              : prev,
          )
        },
        onDone: () => {
          if (!isCurrent()) return
          setState((prev) =>
            prev.id === runId ? { ...prev, status: 'done' } : prev,
          )
        },
        onError: (message, provider) => fail(message, provider ?? null),
      }

      await streamTimeline(subject, type, pills, handlers, {
        signal: controller.signal,
        providerOverride,
      })
    },
    [],
  )

  const retryProvider = useMemo<ByokProvider | null>(() => {
    if (!state.errorProvider) return null
    const other: ByokProvider =
      state.errorProvider === 'openai' ? 'anthropic' : 'openai'
    return getKey(other) ? other : null
  }, [state.errorProvider])

  const value = useMemo<GenerationContextValue>(
    () => ({
      ...state,
      active: state.status === 'classifying' || state.status === 'streaming',
      start,
      cancel,
      reset,
      retryProvider,
    }),
    [state, start, cancel, reset, retryProvider],
  )

  return (
    <GenerationContext.Provider value={value}>
      {children}
    </GenerationContext.Provider>
  )
}

/**
 * True when the trial's single slot is already occupied.
 *
 * Synchronous on purpose: it is the one capacity check that has to happen
 * before the editor is entered, and a sessionStorage read costs nothing.
 * Discovering this from `createDraft()` returning null — which is where it
 * used to surface — would now mean telling someone their timeline has
 * nowhere to go after they watched it generate.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function isTrialSlotFull(): boolean {
  return trialDraftStore.getDraftCount() >= 1
}
