import type { TimelineEvent, CategoryConfig } from '../types/event'
import { DEFAULT_CATEGORIES } from '../constants/categories'
import { DEFAULT_TIMELINE_TITLE } from '../constants/defaults'
import { PLAN_LIMITS } from '../constants/plans'

export interface LocalDraft {
  id: string
  title: string
  description: string
  events: TimelineEvent[]
  categories: CategoryConfig[]
  scale: 'large' | 'medium' | 'small'
  verticalScale?: 'small' | 'medium'
  groupByCategory?: boolean
  savedAt: string
}

export interface DraftStore {
  /** Event name fired on this store after any successful write. */
  readonly changedEvent: string
  /** null means unlimited. */
  readonly maxDrafts: number | null
  getAllDrafts(): LocalDraft[]
  getDraft(id: string): LocalDraft | null
  getDraftCount(): number
  createDraft(): LocalDraft | null
  /** False when the draft was rejected because the store is at capacity. */
  saveDraft(draft: LocalDraft): boolean
  deleteDraft(id: string): void
  clearAllDrafts(): void
}

interface DraftStoreConfig {
  /**
   * Lazy on purpose. Reading `window.localStorage` *itself* throws in some
   * privacy configurations, so resolving it at module scope would take the whole
   * app down on import rather than degrading to "drafts don't persist".
   */
  storage: () => Storage
  storageKey: string
  maxDrafts: number | null
  changedEvent: string
}

function generateId(): string {
  return crypto.randomUUID()
}

export function createDraftStore(config: DraftStoreConfig): DraftStore {
  const { storage, storageKey, maxDrafts, changedEvent } = config

  function readDrafts(): LocalDraft[] {
    try {
      const raw = storage().getItem(storageKey)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return parsed.drafts || []
    } catch {
      return []
    }
  }

  function writeDrafts(drafts: LocalDraft[]): void {
    try {
      storage().setItem(storageKey, JSON.stringify({ drafts }))
      window.dispatchEvent(new Event(changedEvent))
    } catch {
      // Storage full or disabled — silently ignore
    }
  }

  function atCapacity(count: number): boolean {
    return maxDrafts !== null && count >= maxDrafts
  }

  return {
    changedEvent,
    maxDrafts,

    getAllDrafts(): LocalDraft[] {
      const drafts = readDrafts()
      return drafts.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
    },

    getDraft(id: string): LocalDraft | null {
      return readDrafts().find(d => d.id === id) || null
    },

    getDraftCount(): number {
      return readDrafts().length
    },

    createDraft(): LocalDraft | null {
      const drafts = readDrafts()
      if (atCapacity(drafts.length)) return null

      const existingTitles = new Set(drafts.map(d => d.title))
      let title = DEFAULT_TIMELINE_TITLE
      if (existingTitles.has(title)) {
        let i = 2
        while (existingTitles.has(`${DEFAULT_TIMELINE_TITLE} ${i}`)) {
          i++
        }
        title = `${DEFAULT_TIMELINE_TITLE} ${i}`
      }

      const draft: LocalDraft = {
        id: generateId(),
        title,
        description: '',
        events: [],
        categories: [...DEFAULT_CATEGORIES],
        scale: 'large',
        verticalScale: 'medium',
        groupByCategory: false,
        savedAt: new Date().toISOString(),
      }

      drafts.push(draft)
      writeDrafts(drafts)
      return draft
    },

    saveDraft(draft: LocalDraft): boolean {
      const drafts = readDrafts()
      const index = drafts.findIndex(d => d.id === draft.id)

      if (index >= 0) {
        drafts[index] = draft
      } else {
        // Returned rather than thrown-away silently: migration needs to know it
        // could not find room, so it can keep the source copy instead of
        // clearing it and losing the only copy.
        if (atCapacity(drafts.length)) return false
        drafts.push(draft)
      }

      writeDrafts(drafts)
      return true
    },

    deleteDraft(id: string): void {
      writeDrafts(readDrafts().filter(d => d.id !== id))
    },

    clearAllDrafts(): void {
      try {
        storage().removeItem(storageKey)
        // Fired here too, so a store emptied by migration tells the side panel
        // to re-read. `deleteDraft` already does this via writeDrafts.
        window.dispatchEvent(new Event(changedEvent))
      } catch {
        // Silently ignore
      }
    },
  }
}

/**
 * Fired after any successful write to the byok-anon store, so the side panel
 * can re-read.
 *
 * A `storage` listener would not do: that event fires only in *other* tabs,
 * never the one that wrote. Hanging this off the storage layer rather than the
 * editor means create, save, delete and duplicate are all covered wherever
 * they're called from.
 */
export const DRAFTS_CHANGED_EVENT = 'timeline-academy:drafts-changed'
const TRIAL_CHANGED_EVENT = 'timeline-academy:trial-changed'

// Drafts are byok-anon-tier only by definition — they live in localStorage,
// not the database. Decoupled from the signed-in user timeline cap.
export const MAX_DRAFTS = PLAN_LIMITS['byok-anon'].timelineLimit ?? 3

/**
 * Has an Anthropic key but no account. Survives the tab; capped like a plan.
 */
export const byokAnonDraftStore = createDraftStore({
  storage: () => localStorage,
  storageKey: 'timeline_drafts',
  maxDrafts: MAX_DRAFTS,
  changedEvent: DRAFTS_CHANGED_EVENT,
})

/**
 * No account and no key — the ephemeral trial.
 *
 * sessionStorage, so it survives a refresh but dies with the tab, and a single
 * slot: there is no draft list for this state, just the one thing being tried.
 * Its own event name so writes here don't wake the side panel, which never
 * shows trial content.
 */
export const trialDraftStore = createDraftStore({
  storage: () => sessionStorage,
  storageKey: 'timeline_trial',
  maxDrafts: 1,
  changedEvent: TRIAL_CHANGED_EVENT,
})
