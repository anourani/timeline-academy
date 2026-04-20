import type { TimelineEvent, CategoryConfig } from '../types/event'
import { DEFAULT_CATEGORIES } from '../constants/categories'
import { DEFAULT_TIMELINE_TITLE } from '../constants/defaults'
import { getCurrentLimits } from '../lib/limits'

export interface LocalDraft {
  id: string
  title: string
  description: string
  events: TimelineEvent[]
  categories: CategoryConfig[]
  scale: 'large' | 'small'
  groupByCategory?: boolean
  savedAt: string
}

const STORAGE_KEY = 'timeline_drafts'
export const MAX_DRAFTS = getCurrentLimits().timelineLimit ?? Number.POSITIVE_INFINITY

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
    scale: 'small',
    groupByCategory: false,
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

/** Removes the timeline_drafts key. Used after login migration. */
export function clearAllDrafts(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Silently ignore
  }
}
