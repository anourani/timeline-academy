import type { TimelineEvent, CategoryConfig } from '../types/event'
import { DEFAULT_CATEGORIES } from '../constants/categories'
import { DEFAULT_TIMELINE_TITLE } from '../constants/defaults'

export interface LocalDraft {
  id: string
  title: string
  description: string
  events: TimelineEvent[]
  categories: CategoryConfig[]
  scale: 'large' | 'small'
  savedAt: string
}

const STORAGE_KEY = 'timeline_drafts'
const LEGACY_STORAGE_KEY = 'timeline_draft'
export const MAX_DRAFTS = 3

function generateId(): string {
  return crypto.randomUUID()
}

function readDrafts(): LocalDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return parsed.drafts || []
  } catch {
    return []
  }
}

function writeDrafts(drafts: LocalDraft[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ drafts }))
  } catch {
    // Storage full or disabled — silently ignore
  }
}

/**
 * One-time migration from old timeline_draft key to new format.
 * Only migrates if new key doesn't exist yet. Removes old key after migration.
 */
export function migrateFromLegacy(): void {
  try {
    // Only migrate if new key doesn't exist
    if (localStorage.getItem(STORAGE_KEY)) return

    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return

    const legacy = JSON.parse(raw)
    const draft: LocalDraft = {
      id: generateId(),
      title: legacy.title || DEFAULT_TIMELINE_TITLE,
      description: legacy.description || '',
      events: legacy.events || [],
      categories: legacy.categories || DEFAULT_CATEGORIES,
      scale: legacy.scale || 'large',
      savedAt: legacy.savedAt || new Date().toISOString(),
    }

    writeDrafts([draft])
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Silently ignore migration errors
  }
}

/** Returns all drafts sorted by savedAt descending (most recent first). */
export function getAllDrafts(): LocalDraft[] {
  const drafts = readDrafts()
  return drafts.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
}

/** Returns a single draft by ID. */
export function getDraft(id: string): LocalDraft | null {
  const drafts = readDrafts()
  return drafts.find(d => d.id === id) || null
}

/** Returns current draft count. */
export function getDraftCount(): number {
  return readDrafts().length
}

/**
 * Creates a new empty draft with a UUID, default title, default categories, empty events.
 * Returns null if at the 3-draft limit. Persists immediately.
 */
export function createDraft(): LocalDraft | null {
  const drafts = readDrafts()
  if (drafts.length >= MAX_DRAFTS) return null

  const draft: LocalDraft = {
    id: generateId(),
    title: DEFAULT_TIMELINE_TITLE,
    description: '',
    events: [],
    categories: [...DEFAULT_CATEGORIES],
    scale: 'large',
    savedAt: new Date().toISOString(),
  }

  drafts.push(draft)
  writeDrafts(drafts)
  return draft
}

/** Upserts a draft by ID. If the ID exists, updates it. If not, appends (respecting limit). */
export function saveDraft(draft: LocalDraft): void {
  const drafts = readDrafts()
  const index = drafts.findIndex(d => d.id === draft.id)

  if (index >= 0) {
    drafts[index] = draft
  } else {
    if (drafts.length >= MAX_DRAFTS) return
    drafts.push(draft)
  }

  writeDrafts(drafts)
}

/** Removes a draft by ID. */
export function deleteDraft(id: string): void {
  const drafts = readDrafts()
  writeDrafts(drafts.filter(d => d.id !== id))
}

/** Removes both timeline_drafts and legacy timeline_draft keys. Used after login migration. */
export function clearAllDrafts(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Silently ignore
  }
}
