import type { ReactNode } from 'react'
import { Palette } from 'lucide-react'
import { DockMenu } from '@/components/FloatingToolbar/DockMenu'
import { CountryPicker } from '@/components/FloatingToolbar/CountryPicker'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Switch } from '@/components/ui/Switch'
import { buttonVariants } from '@/components/ui/buttonVariants'
import {
  SCALE_OPTIONS,
  VERTICAL_SCALE_OPTIONS,
  type TimelineScaleValue,
  type VerticalScaleValue,
} from '@/constants/scaleOptions'
import {
  WORLD_EVENT_SOURCES,
  type WorldEventSettings,
  type WorldEventSource,
  type WorldEventsStatus,
} from '@/types/worldEvents'
import { cn } from '@/lib/utils'

export interface WorldEventsControl {
  settings: WorldEventSettings
  onChange: (settings: WorldEventSettings) => void
  status: WorldEventsStatus
  onRetry: () => void
  /** Signed in or holding a key. Without either the switch is disabled. */
  aiAvailable: boolean
}

export interface DockDesignProps {
  scale: TimelineScaleValue
  onScaleChange: (scale: TimelineScaleValue) => void
  verticalScale: VerticalScaleValue
  onVerticalScaleChange: (scale: VerticalScaleValue) => void
  groupByCategory: boolean
  onGroupByCategoryChange: (value: boolean) => void
  worldEvents: WorldEventsControl
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled?: boolean
  /** Below `md` the footer shows icons only. */
  iconOnly?: boolean
  triggerClassName?: string
}

const SOURCE_LABELS: Record<WorldEventSource, string> = {
  country: 'Country',
  world: 'World events',
  science: 'Science & tech',
}

/**
 * The dock's Design menu: every setting that changes how the timeline looks —
 * scale, row height, grouping — and the World Events lane with its sources.
 *
 * Built on `DockMenu`, the Legend's shell: a popover rising from the dock on
 * desktop (centred over its button), a full-screen drawer on a phone. Shown in
 * both modes, like the Legend — these settings persist with the timeline and
 * a presenter may want them mid-talk.
 */
export function DockDesign({
  scale,
  onScaleChange,
  verticalScale,
  onVerticalScaleChange,
  groupByCategory,
  onGroupByCategoryChange,
  worldEvents,
  open,
  onOpenChange,
  disabled = false,
  iconOnly = false,
  triggerClassName,
}: DockDesignProps) {
  const { settings, onChange, status, onRetry, aiAvailable } = worldEvents
  const showSources = settings.showWorldEvents && aiAvailable
  const showCountry = showSources && settings.worldEventSources.includes('country')

  const toggleSource = (source: WorldEventSource) => {
    const on = settings.worldEventSources.includes(source)
    // The last chip stays on while the lane is on — an empty selection has
    // nothing to show, and the switch is the way to turn the lane off.
    if (on && settings.worldEventSources.length === 1) return
    const next = on
      ? settings.worldEventSources.filter(s => s !== source)
      : WORLD_EVENT_SOURCES.filter(s => s === source || settings.worldEventSources.includes(s))
    onChange({ ...settings, worldEventSources: next })
  }

  // The plain <button>, not <Button>: Radix needs a forwarded ref to anchor
  // the popover to. See `CategoryLegend`.
  const trigger = (
    <button
      type="button"
      aria-label="Design"
      title={iconOnly ? 'Design' : undefined}
      data-active={open}
      disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      className={cn(
        buttonVariants({ variant: 'glass', size: 'none' }),
        disabled && 'opacity-50 pointer-events-none',
        triggerClassName,
      )}
    >
      <Palette size={20} />
      {!iconOnly && 'Design'}
    </button>
  )

  let subtitle: ReactNode = 'What else was happening'
  if (!aiAvailable) {
    subtitle = 'Add a key or log in to use world events'
  } else if (settings.showWorldEvents && status === 'error') {
    subtitle = (
      <span className="text-destructive">
        Couldn't load world events —{' '}
        <button
          type="button"
          onClick={onRetry}
          className="underline underline-offset-2 outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded-sm"
        >
          try again
        </button>
      </span>
    )
  }

  return (
    <DockMenu
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title="Design"
      label="Design"
      widthClass="w-[296px]"
      align="center"
    >
      {/* Only the first pair of each row's sizing applies inside the drawer,
          only the `md:` pair inside the popover — each tree lives on one side
          of `md`, as in the Legend's rows. */}
      <div className="flex min-h-[56px] items-center justify-between gap-3 px-[10px] py-1 md:min-h-0">
        <span className="body-m text-[#9B9EA3]">Scale</span>
        <SegmentedControl label="Scale" options={SCALE_OPTIONS} value={scale} onChange={onScaleChange} />
      </div>
      <div className="flex min-h-[56px] items-center justify-between gap-3 px-[10px] py-1 md:min-h-0">
        <span className="body-m text-[#9B9EA3]">Row height</span>
        <SegmentedControl
          label="Row height"
          options={VERTICAL_SCALE_OPTIONS}
          value={verticalScale}
          onChange={onVerticalScaleChange}
        />
      </div>

      <div className="my-[6px] h-px bg-[#262626]" />

      <div className="flex min-h-[44px] items-center justify-between gap-2 px-[10px] py-3 md:min-h-0 md:py-[6px]">
        <span className="body-m text-[#9B9EA3]">Group events by category</span>
        <Switch
          checked={groupByCategory}
          onCheckedChange={onGroupByCategoryChange}
          aria-label="Group events by category"
        />
      </div>

      <div className="my-[6px] h-px bg-[#262626]" />

      <div className="flex min-h-[44px] items-center justify-between gap-2 px-[10px] py-3 md:min-h-0 md:py-[6px]">
        <div className="flex flex-col gap-[2px]">
          <span className="body-m text-[#9B9EA3]">Show world events</span>
          <span className="text-[12px] leading-[16px] text-[#6b6e73]" aria-live="polite">
            {subtitle}
          </span>
        </div>
        <Switch
          checked={settings.showWorldEvents && aiAvailable}
          onCheckedChange={(checked) => onChange({ ...settings, showWorldEvents: checked })}
          disabled={!aiAvailable}
          aria-label="Show world events"
        />
      </div>

      <Collapse open={showSources}>
        <div className="flex flex-wrap gap-1.5 px-[10px] pt-1 pb-1.5">
          {WORLD_EVENT_SOURCES.map((source) => {
            const on = settings.worldEventSources.includes(source)
            const isLastOn = on && settings.worldEventSources.length === 1
            return (
              <button
                key={source}
                type="button"
                aria-pressed={on}
                // `aria-disabled` rather than `disabled`, as in the Legend: a
                // disabled button can't take focus, which would punch a hole
                // in keyboard navigation.
                aria-disabled={isLastOn || undefined}
                tabIndex={showSources ? undefined : -1}
                onClick={() => toggleSource(source)}
                className={cn(
                  'h-11 px-4 md:h-8 md:px-3 rounded-[10px] border text-[14px] font-medium',
                  'transition-[background-color,color,border-color] duration-150',
                  'outline-none focus-visible:ring-1 focus-visible:ring-white/40',
                  on
                    ? 'bg-[rgba(37,99,235,0.4)] border-transparent text-[#dadee5]'
                    : 'bg-transparent border-white/[0.15] text-[#9B9EA3] hover:text-[#C9CED4]',
                  isLastOn && 'cursor-default',
                )}
              >
                {SOURCE_LABELS[source]}
              </button>
            )
          })}
        </div>

        <Collapse open={showCountry}>
          <div className="px-[10px] pt-1 pb-1.5">
            <CountryPicker
              value={settings.worldEventCountry}
              onChange={(code) => onChange({ ...settings, worldEventCountry: code })}
              tabIndex={showCountry ? undefined : -1}
              className="h-11 md:h-9"
            />
          </div>
        </Collapse>
      </Collapse>
    </DockMenu>
  )
}

/**
 * Grows and shrinks its content's height without a jump.
 *
 * The menu rises from the dock, so a section popping in or out would yank the
 * whole surface; this keeps the content mounted and animates a grid row
 * between `0fr` and `1fr` instead. React 18 has no `inert`, so collapsed
 * content is hidden from assistive tech here and its controls take
 * `tabIndex={-1}` at the call site.
 */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity] motion-reduce:transition-none"
      // Duration and easing inline: arbitrary `duration-` and `ease-` values
      // are ambiguous to Tailwind here (tailwindcss-animate shares both
      // namespaces), and it drops ambiguous classes. Only the property list
      // stays a class, so `motion-reduce:transition-none` still beats it.
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        transitionDuration: '240ms',
        transitionTimingFunction: 'var(--ease-enter)',
      }}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
