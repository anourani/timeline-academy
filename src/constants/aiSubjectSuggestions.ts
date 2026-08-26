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

export const SUBJECT_SUGGESTIONS: string[] = [
  // People — Athletes
  'Kobe Bryant',
  'Muhammad Ali',
  'Serena Williams',
  'Michael Jordan',
  'Pelé',
  'Roger Federer',
  'Simone Biles',
  'Usain Bolt',
  // People — Artists & Writers
  'Frida Kahlo',
  'Pablo Picasso',
  'Vincent van Gogh',
  'Leonardo da Vinci',
  'Georgia O\u2019Keeffe',
  'Maya Angelou',
  'Toni Morrison',
  'Ernest Hemingway',
  // People — Scientists
  'Albert Einstein',
  'Marie Curie',
  'Isaac Newton',
  'Charles Darwin',
  'Stephen Hawking',
  'Nikola Tesla',
  'Ada Lovelace',
  'Alan Turing',
  // People — Leaders & Activists
  'Martin Luther King Jr.',
  'Nelson Mandela',
  'Mahatma Gandhi',
  'Abraham Lincoln',
  'Winston Churchill',
  'Malcolm X',
  'Rosa Parks',
  'John F. Kennedy',
  // People — Musicians
  'David Bowie',
  'Prince',
  'Beyoncé',
  'Bob Dylan',
  'The Beatles',
  'Aretha Franklin',
  'Michael Jackson',
  // People — Presidents
  'Barack Obama',
  'Theodore Roosevelt',
  'Franklin D. Roosevelt',
  'George Washington',
  // Events
  'World War II',
  'World War I',
  'The French Revolution',
  'The Cold War',
  'The Apollo 11 Moon Landing',
  'The Fall of the Berlin Wall',
  'The Civil Rights Movement',
  'The American Revolution',
  'The Industrial Revolution',
  // Topics
  'The Renaissance',
  'The Space Race',
  'The History of Jazz',
  'The History of Hip-Hop',
  'The Internet',
  'Climate Change',
  'Artificial Intelligence',
  'Quantum Physics',
  // Organizations
  'Apple Inc.',
  'NASA',
  'Microsoft',
  'Google',
  'Pixar',
  'Nike',
  'The United Nations',
  'SpaceX',
]

/**
 * What one quick-search chip costs the row, in px.
 *
 * `glassButtonClass` gives every chip `min-w-[80px]` and `px-[11px]`, and at
 * its 14px medium type a label measures about 8px per character — checked
 * against the rendered chips rather than assumed. The floor is why a character
 * budget cannot stand in for this one: `NASA` spends four characters and 80px.
 *
 * Deliberately an over-estimate for longer labels (a 17-character name comes
 * out at 158px against a measured 148px), and the measurement came from a wide
 * system sans. Both errors point the same way — a row that fits here fits on
 * the narrower faces phones actually ship.
 */
function estimateChipWidth(subject: string): number {
  return Math.max(80, 22 + subject.length * 8)
}

/**
 * How much width the chip row plans for.
 *
 * The narrowest common phone is 375px, which leaves `375 - 32` of page gutter
 * for the field, less the row's two 8px gaps: 327px across three chips.
 *
 * A preference, not a guarantee — the row is `flex-wrap`, so a draw that
 * overruns on an unusually wide face wraps rather than clipping.
 */
const QUICK_SEARCH_ROW_BUDGET = 327

/**
 * Draw `count` distinct subjects for the quick-search chips under the field.
 *
 * Meant for a `useState` initializer, so the set is fixed for the life of the
 * screen and rotates per visit — chips that reshuffled mid-session would be a
 * target that moves while you reach for it.
 */
export function pickQuickSearches(count = 3): string[] {
  const pool = [...SUBJECT_SUGGESTIONS]
  const picked: string[] = []
  let remaining = QUICK_SEARCH_ROW_BUDGET

  while (picked.length < count && pool.length > 0) {
    // Every chip still to be drawn gets an equal share of what is left, so an
    // early long draw cannot spend the row on itself. The share never falls
    // below a chip's 80px floor, so `eligible` holds for every real draw and
    // the total stays inside the budget by construction.
    const share = remaining / (count - picked.length)
    const eligible = pool.filter((subject) => estimateChipWidth(subject) <= share)
    const source = eligible.length > 0 ? eligible : pool
    const subject = source[Math.floor(Math.random() * source.length)]

    pool.splice(pool.indexOf(subject), 1)
    picked.push(subject)
    remaining -= estimateChipWidth(subject)
  }

  return picked
}
