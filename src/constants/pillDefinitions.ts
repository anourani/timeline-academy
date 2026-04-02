export type SubjectType = 'person' | 'event' | 'topic' | 'organization'

export interface PillDefinition {
  id: 'category_1' | 'category_2' | 'category_3' | 'category_4'
  label: string
  promptSnippet: string
}

export const PILL_DEFINITIONS: Record<SubjectType, PillDefinition[]> = {
  person: [
    { id: 'category_1', label: 'Personal Life', promptSnippet: 'Birth, death, family, marriage, health, upbringing, relationships, hardships, legal issues, relocations' },
    { id: 'category_2', label: 'Career & Education', promptSnippet: 'Professional roles, jobs, promotions, projects, schools, degrees, mentors, training, key professional decisions' },
    { id: 'category_3', label: 'Achievements', promptSnippet: 'Awards, records, honors, firsts, breakthrough moments, critical acclaim, peak performances' },
    { id: 'category_4', label: 'Legacy', promptSnippet: 'Lasting influence, cultural impact, movements inspired, posthumous recognition, how they changed their field' },
  ],
  event: [
    { id: 'category_1', label: 'Key Moments', promptSnippet: 'Turning points, triggering incidents, pivotal decisions, climactic events, defining occurrences' },
    { id: 'category_2', label: 'Human Stories', promptSnippet: 'Individual experiences, heroism, personal sacrifice, civilian impact, eyewitness perspectives' },
    { id: 'category_3', label: 'Political & Social Impact', promptSnippet: 'Policy changes, treaties, legislation, social movements, governance shifts, diplomatic moves' },
    { id: 'category_4', label: 'Aftermath & Legacy', promptSnippet: 'Consequences, lasting changes, reconstruction, cultural memory, long-term effects' },
  ],
  topic: [
    { id: 'category_1', label: 'Origins & Roots', promptSnippet: 'How it started, founding moments, earliest examples, precursors, initial conditions' },
    { id: 'category_2', label: 'Key Figures', promptSnippet: 'Influential people, pioneers, icons, central voices, their defining contributions' },
    { id: 'category_3', label: 'Milestones', promptSnippet: 'Landmark moments, breakthroughs, firsts, defining events, record-setting achievements' },
    { id: 'category_4', label: 'Evolution & Impact', promptSnippet: 'How it changed over time, major shifts, cultural influence, global spread, mainstream adoption' },
  ],
  organization: [
    { id: 'category_1', label: 'Growth & Milestones', promptSnippet: 'Founding, early vision, IPO, acquisitions, new markets, revenue milestones, key expansions' },
    { id: 'category_2', label: 'Products & Innovation', promptSnippet: 'Key releases, inventions, services, R&D breakthroughs, industry influence, flagship offerings' },
    { id: 'category_3', label: 'Leadership', promptSnippet: 'Key people, hires, departures, vision changes, management decisions, board shakeups' },
    { id: 'category_4', label: 'Crises & Controversy', promptSnippet: 'Scandals, lawsuits, near-failures, pivots, layoffs, regulatory battles, restructuring' },
  ],
}

export const SUBJECT_TYPE_SUFFIX: Record<SubjectType, string> = {
  person: "'s life.",
  event: '',
  topic: '',
  organization: '',
}
