import { SidePanelBody } from './SidePanelBody'

/**
 * Floating side panel container shell. Renders the outer frame (rounded,
 * bordered, dark surface) around the panel body. The 6px gap on left/top/
 * bottom that makes it float is applied by the parent `GlobalLayout`.
 */
export function GlobalSidePanel() {
  return (
    <div
      className="h-full w-full bg-[#171717] rounded-[6px] border border-[#262626] flex flex-col overflow-hidden"
      aria-label="Timelines side panel"
    >
      <SidePanelBody />
    </div>
  )
}
