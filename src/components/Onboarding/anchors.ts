/**
 * Puts the cursor in the Create page's search field, found through the same
 * `data-onboarding` anchor the tour spotlights. Shared by the checklist's
 * "Make your first timeline" row and the welcome modal's Skip.
 */
export function focusComposer() {
  document
    .querySelector<HTMLInputElement>('[data-onboarding="composer"] input')
    ?.focus()
}
