import { Fragment } from 'react'
import { Check, ChevronDown, Lock, Sparkles } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PROVIDER_META } from '@/constants/byokProviders'
import {
  MODEL_GROUP_ORDER,
  getModelAvailability,
  getModelById,
  resolveModelId,
} from '@/constants/models'
import { setPreferredModel, useByokKeys } from '@/services/userApiKey'
import { useAccountTier } from '@/hooks/useAccountTier'
import { cn } from '@/lib/utils'

interface ModelSelectorProps {
  /** Mirrors the quick-search chips: disabled while a generation is in flight. */
  disabled?: boolean
  /**
   * Opens the key modal from the unlock row. Omit it and the row is not
   * rendered — which is what `ApiKeySection` wants, since the key fields are
   * already on screen there.
   */
  onRequestApiKey?: () => void
  /**
   * How the trigger presents itself.
   *
   * `chip` is the glass pill the editor's settings panel mounts. `tab` is the
   * Create page's: small type tucked into the bottom-right of the plate the
   * search field sits on, carrying no fill of its own because the plate
   * already supplies one.
   *
   * A variant rather than a `className` the caller passes, because the two
   * differ in *content* as well as geometry — the tab spells out "Model"
   * where the chip leans on an icon — and because half the tab's classes
   * exist only to cancel `TRIGGER_BASE`, which is not a job to leave to
   * whoever mounts it.
   */
  variant?: 'chip' | 'tab'
  className?: string
}

/**
 * What `SelectTrigger` used to contribute, written out.
 *
 * The variants below were authored as overrides on top of shadcn's
 * `SelectTrigger` base. Moving to `DropdownMenuTrigger`, which styles nothing,
 * took that base away — so the handful of its declarations that were actually
 * reaching the rendered control have to be stated here instead. The rest of
 * that base string was either cancelled by both variants (`h-9 w-full
 * rounded-md px-3 py-2 text-sm shadow-sm bg-transparent border-input`) or
 * inert on a button (`placeholder:`, `ring-offset-background` with no ring
 * offset, `[&>span]:line-clamp-1` under `whitespace-nowrap`).
 *
 * `border` is the one that would have gone unnoticed: the chip sets
 * `border-white/[0.15]`, which is a *colour*. Its 1px width came from here,
 * and without it the glass pill loses its edge. The tab cancels it with
 * `border-0`, as it always did.
 *
 * The focus ring is deliberately `focus:`, not the `focus-visible:` the rest
 * of the app prefers — it is what the control has always done, and this change
 * is about the menu, not the trigger.
 */
const TRIGGER_BASE = cn(
  'flex items-center whitespace-nowrap w-auto h-auto min-w-0 shrink-0 border',
  'focus:outline-none focus:ring-1 focus:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none',
)

const TRIGGER_VARIANTS: Record<'chip' | 'tab', string> = {
  // The `glassButtonClass` geometry. It was written to make this sit in the
  // Create page's quick-search row as a fourth chip; the tab has taken that
  // spot, but the settings panel's own buttons are the same glass, so the
  // recipe is still the right one there. Values come from glassButton.ts
  // rather than being new hex: that file is the one place it is written down.
  //
  // `data-[state=open]` repeats the hover fill so the pill stays lit while its
  // menu is open, which is what `AccountRow` does with the account row.
  chip: cn(
    'gap-[6px] px-[11px] py-[6px] rounded-[10px]',
    'backdrop-blur-[12px] bg-white/10 border-white/[0.15]',
    'shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]',
    "font-['Avenir',sans-serif] font-medium text-[14px] text-text-secondary",
    'hover:bg-white/20 data-[state=open]:bg-white/20 transition-all',
  ),
  // Flat and fill-less on purpose: the plate under the search field is what
  // this reads against, so a border or a shadow here would draw a second box
  // inside the first. `border-0 shadow-none rounded-none` are cancelling
  // `TRIGGER_BASE`, not choices of their own.
  //
  // `group` is for the chevron, which brightens with the whole tab rather than
  // only when the pointer is on its own 12px box.
  tab: cn(
    'group gap-[4px] px-[16px] py-[8px]',
    'border-0 bg-transparent shadow-none rounded-none',
    "font-['Avenir',sans-serif] text-[12px] leading-[18px]",
  ),
}

/**
 * Which model answers this visitor's AI calls.
 *
 * Mounted in two places over one persisted value: the Create page, as a tab
 * tucked into the bottom-right of the search field's plate, and the editor's
 * settings panel, where the removed default-provider picker used to sit.
 * Settings needs it because the chosen model now also writes event
 * descriptions, and the editor has no other way to change that without
 * leaving. The two triggers look nothing alike — see `variant` — but they open
 * the same menu.
 *
 * That menu is built from the same `dropdown-menu` pieces as `AccountMenu`,
 * deliberately. It used to be a shadcn `Select`, which is stock and themed off
 * `--popover` — a blue-tinted slate this product uses nowhere else, as
 * `ui/dropdown-menu.tsx` explains at length. The two menus sat a few hundred
 * pixels apart looking like they came from different applications.
 *
 * The dropdown lists what the visitor's keys can reach and locks the rest in
 * place rather than hiding them — for someone without a key, the locked rows
 * are the clearest statement of what adding one gets them.
 */
export function ModelSelector({
  disabled = false,
  onRequestApiKey,
  variant = 'chip',
  className,
}: ModelSelectorProps) {
  const tier = useAccountTier()
  const stored = useByokKeys()

  const keys = {
    anthropic: Boolean(stored.anthropic),
    openai: Boolean(stored.openai),
  }

  // The resolved id, not the raw stored one: the trigger must name the model
  // that would actually run. A user who saved Opus and then removed their
  // Anthropic key sees Terra here, which is what their next generation will
  // use — and their Opus preference survives untouched for when the key
  // comes back.
  const selectedId = resolveModelId(stored.model, keys)
  const selected = getModelById(selectedId)

  // One availability pass feeds both groups and the unlock row, so a model
  // cannot read as locked in one place and open in another.
  const availability = getModelAvailability(tier, keys)
  const showUnlockRow =
    Boolean(onRequestApiKey) && availability.some((a) => a.locked)

  const isTab = variant === 'tab'

  return (
    /*
      `modal={false}`, as `AccountMenu` is — but for a weaker reason than the
      one it documents, so don't read its comment as applying wholesale here.

      Its failure mode is a second *Radix* layer restoring the stale
      `pointer-events: none` that modal mode writes onto <body>. The only layer
      this menu opens is the key modal, and `Modal.tsx` is a hand-rolled
      `createPortal` that never snapshots body styles — so that permanent trap
      does not fire here.

      What does happen, measured by sampling `document.body.style` every 16ms
      across the unlock row's click: under `modal={true}` the key modal mounts
      while the menu still owns <body>, so it opens into a dead window of
      ~16-47ms before the menu's layer tears down and hands pointer events
      back. Under `modal={false}` that window does not exist at all. A modal
      whose first click can be swallowed is a bad enough trade on its own for
      inerting the page behind a model picker.

      The second reason is standing rather than measured: `Modal.tsx` drives
      `lockScroll()`, which writes `position`/`top`/`paddingRight` to the same
      `document.body.style` that Radix's modal mode writes `overflow` and
      `pointer-events` to. Two uncoordinated owners of one object.
    */
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        asChild
        // `loading` is not a tier to answer for: `useAccountTier` reports it
        // while the session lookup is still out, and a menu rendered from it
        // would show a signed-in user their signed-out options for a frame.
        // Lives on the trigger now — `DropdownMenu` has no `disabled`, where
        // `Select` did.
        disabled={disabled || tier === 'loading'}
      >
        {/*
          `type="button"` is load bearing, not boilerplate. The tab is mounted
          inside the Create page's <form>, where a button with no type defaults
          to `submit` — so opening this menu would fire a generation. Radix's
          trigger does set it, but through `asChild` that arrives by Slot prop
          merging, which is a detail of a library internal rather than
          something this file should rest a runaway generation on.
        */}
        <button
          type="button"
          // The chip needs a label — all it shows is the model name, and the
          // "Model" heading `ApiKeySection` puts above it is not associated
          // with it — but the label has to *carry* that name rather than
          // replace it. As a `Select` this was a combobox, whose value is
          // announced separately from its name, so a bare "Model" was enough.
          // A menu button has no value, so a bare "Model" would be the whole
          // announcement and the chosen model would vanish from it.
          //
          // The tab takes no label at all: its visible text already reads
          // "Model <name>", and an `aria-label` overrides contents (WCAG
          // 2.5.3).
          aria-label={isTab ? undefined : `Model: ${selected?.label ?? ''}`}
          className={cn(TRIGGER_BASE, TRIGGER_VARIANTS[variant], className)}
        >
          {isTab ? (
            // The tab names the setting because nothing around it does: it
            // sits alone on the field's plate, where the chip had the settings
            // panel's own section heading directly above it.
            <span className="text-text-tertiary">Model</span>
          ) : (
            <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          )}

          {/* A literal, not `CATEGORIES[0].color`, which is the same hex. The
              category palette is user-facing data that can be rethemed; the
              model label is chrome. Coupling them would drag one into the
              other's redesign. */}
          <span className={isTab ? 'text-[#A770EC]' : undefined}>
            {selected?.label}
          </span>

          {/* `SelectTrigger` appended this; `DropdownMenuTrigger` styles
              nothing, so it is ours to draw. The chip's copy reproduces what
              the old base rendered — 16px at half opacity. The tab's is 12px
              and solid, sitting on the same optical weight as the type beside
              it rather than reading as a heavier second control. */}
          <ChevronDown
            aria-hidden="true"
            className={
              isTab
                ? 'size-3 text-text-tertiary transition-colors group-hover:text-text-secondary'
                : 'h-4 w-4 opacity-50'
            }
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        // The tab hangs off the field's right edge, so the menu hangs from the
        // same edge. Left-aligning a 240px menu off a ~164px trigger sitting
        // there leaves the overflow to collision detection at every width;
        // this gives the same answer at all of them.
        align={isTab ? 'end' : 'start'}
        // The default is 0, which lets a tall menu sit flush against the top
        // or bottom of the window on a short viewport.
        collisionPadding={8}
        // `min-w`, not the account menu's trigger-derived width: that exists
        // because its trigger is a panel row resizable from 300 to 400, and
        // copying it here would size a six-model list off a 164px tab.
        //
        // The height cap is this menu's own, deliberately not pushed into
        // `dropdown-menu.tsx`. Nine rows is tall enough to overrun a short
        // landscape window, where the surface offers no scroll of its own;
        // the account menu is four rows and has never needed one. It has to
        // beat the surface's `overflow-hidden`, which is what clips rows to
        // the rounded corners.
        className="min-w-[240px] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto"
      >
        {MODEL_GROUP_ORDER.map((provider, groupIndex) => (
          <Fragment key={provider}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            {/* `aria-labelledby` by hand: `SelectGroup` generated an id for its
                `SelectLabel` and wired the two together itself, and the
                dropdown's group and label are bare Radix re-exports that do
                not. Without it the provider name is read as a loose row rather
                than as the name of the group under it. */}
            <DropdownMenuGroup aria-labelledby={`model-group-${provider}`}>
              {/* Provider naming comes from the same table the key modal
                  reads, so the two surfaces cannot drift. Note the group ORDER
                  does differ from the key screens on purpose — see
                  MODEL_GROUP_ORDER. */}
              <DropdownMenuLabel id={`model-group-${provider}`}>
                {PROVIDER_META[provider].label}
              </DropdownMenuLabel>

              {availability
                .filter((a) => a.model.provider === provider)
                .map(({ model, locked }) => {
                  const isSelected = model.id === selectedId
                  return (
                    /*
                      `role`/`aria-checked` rather than a `DropdownMenuRadioItem`:
                      this file's `dropdown-menu.tsx` is a trimmed shadcn that
                      does not export one, and adding it would change the shared
                      component to gain a left indicator gutter the account menu
                      does not want. Radix sets `role="menuitem"` ahead of its
                      prop spread, so these override it, and a `menuitemradio` is
                      a valid child of the `menu` role — which keeps the
                      one-of-many relationship `Select`'s options carried.
                    */
                    <DropdownMenuItem
                      key={model.id}
                      role="menuitemradio"
                      aria-checked={isSelected}
                      disabled={locked}
                      // Without this, Radix's typeahead falls back to the
                      // row's textContent, which here is the label with the
                      // descriptor run onto it — "Claude SonnetFastest". Its
                      // matching is prefix-based, so in practice that rarely
                      // changes which row you land on; the point is that the
                      // row's searchable name should be the model, not the
                      // model plus an annotation about it.
                      textValue={model.label}
                      onSelect={() => setPreferredModel(model.id)}
                    >
                      {model.label}

                      {/* `ml-auto` is the account menu's trailing-slot idiom.
                          The descriptor stays a size below the row's own type
                          so it reads as an annotation rather than a second
                          label. */}
                      {locked ? (
                        <Lock
                          size={14}
                          className="ml-auto shrink-0 text-[#6b6e73]"
                          aria-label="Locked"
                        />
                      ) : (
                        <span className="ml-auto shrink-0 text-[12px] text-[#6b6e73]">
                          {model.descriptor}
                        </span>
                      )}

                      {/* Kept in the layout when unselected rather than
                          rendered conditionally, so the descriptor column does
                          not shuffle sideways as the selection moves. */}
                      <Check
                        size={14}
                        aria-hidden="true"
                        className={cn('shrink-0', !isSelected && 'invisible')}
                      />
                    </DropdownMenuItem>
                  )
                })}
            </DropdownMenuGroup>
          </Fragment>
        ))}

        {showUnlockRow && (
          <>
            <DropdownMenuSeparator />
            {/* One copy for every locked state. Signing in moves trial → free,
                which is still Sonnet-only, so adding a key is the only thing
                that unlocks anything — and the modal this opens offers sign-in
                as its secondary link anyway.

                An ordinary item. Under `Select` this had to masquerade as a
                selectable value, because that primitive owns focus inside its
                content and a plain button there was unreachable by arrow keys;
                a menu hosts actions natively, so the sentinel value and the
                interception it needed are both gone. */}
            <DropdownMenuItem onSelect={() => onRequestApiKey?.()}>
              Add an API key to unlock more models
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
