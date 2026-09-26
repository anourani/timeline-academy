export interface SubjectSuggestion {
  title: string
  description?: string
}

/**
 * Shortest query that earns a suggestion request — and the same threshold the
 * dropdown opens at, so the panel can never appear holding nothing useful. One
 * character matches thousands of Wikipedia titles and none of them usefully.
 *
 * Read by `useSubjectSuggestions` and by the dropdown's visibility gate. They
 * have to agree, which is why the number lives here rather than in either.
 */
export const MIN_SUGGESTION_QUERY_LENGTH = 2

export type MomentKind = 'person' | 'era' | 'event'

export interface Moment {
  /** Sent to generation, exactly as the chips sent their subject. */
  title: string
  /** Display label where space is tight (desktop pills). */
  short: string
  /** Display year, e.g. '1955' or 'c. 1450'. */
  year: string
  /** Numeric year used for sorting. */
  sortYear: number
  kind: MomentKind
}

/** Dot colours. Literals, same reasoning as ModelSelector's label colour:
 *  the category palette is user data and can be rethemed; this is chrome. */
export const MOMENT_KIND_COLOR: Record<MomentKind, string> = {
  person: '#4196E4',
  era: '#A770EC',
  event: '#FF7D05',
}

export const MOMENTS: Moment[] = [
  // People
  { kind: 'person', title: 'Rosa Parks', short: 'Rosa Parks', year: '1955', sortYear: 1955 },
  { kind: 'person', title: 'Usain Bolt', short: 'Usain Bolt', year: '2008', sortYear: 2008 },
  { kind: 'person', title: 'Frida Kahlo', short: 'Frida Kahlo', year: '1907', sortYear: 1907 },
  { kind: 'person', title: 'Marie Curie', short: 'Marie Curie', year: '1903', sortYear: 1903 },
  { kind: 'person', title: 'Nelson Mandela', short: 'Nelson Mandela', year: '1994', sortYear: 1994 },
  { kind: 'person', title: 'Ada Lovelace', short: 'Ada Lovelace', year: '1843', sortYear: 1843 },
  { kind: 'person', title: 'Muhammad Ali', short: 'Muhammad Ali', year: '1964', sortYear: 1964 },
  { kind: 'person', title: 'Nikola Tesla', short: 'Nikola Tesla', year: '1891', sortYear: 1891 },
  { kind: 'person', title: 'Serena Williams', short: 'Serena Williams', year: '1999', sortYear: 1999 },
  // Eras
  { kind: 'era', title: 'The Renaissance', short: 'The Renaissance', year: 'c. 1450', sortYear: 1450 },
  { kind: 'era', title: 'The Industrial Revolution', short: 'Industrial Revolution', year: '1760', sortYear: 1760 },
  { kind: 'era', title: 'The Cold War', short: 'The Cold War', year: '1947', sortYear: 1947 },
  { kind: 'era', title: 'The Space Race', short: 'The Space Race', year: '1957', sortYear: 1957 },
  { kind: 'era', title: 'The History of Jazz', short: 'History of Jazz', year: '1917', sortYear: 1917 },
  { kind: 'era', title: 'The History of Hip-Hop', short: 'History of Hip-Hop', year: '1973', sortYear: 1973 },
  // Events
  { kind: 'event', title: 'The Apollo 11 Moon Landing', short: 'Apollo 11', year: '1969', sortYear: 1969 },
  { kind: 'event', title: 'The Fall of the Berlin Wall', short: 'Fall of the Berlin Wall', year: '1989', sortYear: 1989 },
  { kind: 'event', title: 'The French Revolution', short: 'French Revolution', year: '1789', sortYear: 1789 },
  { kind: 'event', title: 'World War I', short: 'World War I', year: '1914', sortYear: 1914 },
  { kind: 'event', title: 'The American Revolution', short: 'American Revolution', year: '1775', sortYear: 1775 },
  { kind: 'event', title: 'World War II', short: 'World War II', year: '1939', sortYear: 1939 },
]

const KIND_ORDER: MomentKind[] = ['person', 'era', 'event']

/**
 * One moment of each kind, sorted by year.
 *
 * Always sorted: the axis tells the user the row is chronological, so an
 * out-of-order draw reads as a bug. If a "recommended" pick is ever needed,
 * mark it visually and keep it in date order.
 *
 * Pass the previous draw as `exclude` when shuffling, so a shuffle never hands
 * back a subject that was just on screen.
 */
export function pickMoments(exclude: Moment[] = []): Moment[] {
  const excluded = new Set(exclude.map((m) => m.title))
  return KIND_ORDER.map((kind) => {
    const pool = MOMENTS.filter((m) => m.kind === kind)
    const fresh = pool.filter((m) => !excluded.has(m.title))
    const source = fresh.length > 0 ? fresh : pool
    return source[Math.floor(Math.random() * source.length)]
  }).sort((a, b) => a.sortYear - b.sortYear)
}
