import { useEffect, useState } from 'react'

/**
 * Radix dialogs anywhere on the page — the side panel's own key and sign-in
 * modals, account settings, the checklist's sheet, the welcome modal. The
 * onboarding layer steps aside for all of them, not just the ones
 * `AIModePage` owns. The tour's own tip is a `role="dialog"` too, but carries
 * no `data-state`.
 *
 * Any `data-state`, not just `open`: a closing dialog stays in the DOM as
 * `closed` for its exit animation, and the tour appearing under a sheet that
 * is still sliding away is exactly the overlap it is meant to avoid. Radix
 * removes the node when the animation ends, which the observer below sees.
 */
const OPEN_DIALOG =
  '[role="dialog"][data-state], [role="alertdialog"][data-state]'

/** Dialogs plus open menus — the model dropdown claims Esc for itself. */
const OPEN_LAYER = `${OPEN_DIALOG}, [role="menu"][data-state="open"]`

export function isForeignDialogOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector(OPEN_DIALOG) !== null
}

export function isForeignLayerOpen(): boolean {
  return typeof document !== 'undefined' && document.querySelector(OPEN_LAYER) !== null
}

/**
 * Radix portals its layers straight into `<body>`, so watching body's direct
 * children is enough to see one open or close.
 */
export function useForeignDialogOpen(): boolean {
  const [open, setOpen] = useState(isForeignDialogOpen)

  useEffect(() => {
    const check = () => setOpen(isForeignDialogOpen())
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true })
    return () => observer.disconnect()
  }, [])

  return open
}
