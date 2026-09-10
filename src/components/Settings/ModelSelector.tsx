import { Lock, Sparkles } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

/**
 * The value of the unlock row.
 *
 * The row is an action, not a model, so it must never become the selection —
 * `onValueChange` intercepts this id and opens the key modal instead of
 * storing it, and `value` still points at the real model, so the trigger
 * never changes. It is a `SelectItem` rather than a plain button because
 * Radix's Select owns focus inside its content: a bare button there is
 * unreachable by arrow keys, which would leave the only unlock affordance
 * mouse-only.
 */
const UNLOCK_VALUE = '__add_api_key__'

interface ModelSelectorProps {
  /** Mirrors the quick-search chips: disabled while a generation is in flight. */
  disabled?: boolean
  /**
   * Opens the key modal from the unlock row. Omit it and the row is not
   * rendered — which is what `ApiKeySection` wants, since the key fields are
   * already on screen there.
   */
  onRequestApiKey?: () => void
  className?: string
}

/**
 * Which model answers this visitor's AI calls.
 *
 * Mounted in two places over one persisted value: the Create page, beside the
 * quick-search chips, and the editor's settings panel, where the removed
 * default-provider picker used to sit. Settings needs it because the chosen
 * model now also writes event descriptions, and the editor has no other way
 * to change that without leaving.
 *
 * The dropdown lists what the visitor's keys can reach and locks the rest in
 * place rather than hiding them — for someone without a key, the locked rows
 * are the clearest statement of what adding one gets them.
 */
export function ModelSelector({
  disabled = false,
  onRequestApiKey,
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

  const handleChange = (value: string) => {
    if (value === UNLOCK_VALUE) {
      onRequestApiKey?.()
      return
    }
    setPreferredModel(value)
  }

  return (
    <Select
      value={selectedId}
      onValueChange={handleChange}
      // `loading` is not a tier to answer for: `useAccountTier` reports it
      // while the session lookup is still out, and a dropdown rendered from
      // it would show a signed-in user their signed-out options for a frame.
      disabled={disabled || tier === 'loading'}
    >
      <SelectTrigger
        aria-label="Model"
        className={cn(
          // The quick-search chips' geometry, so this sits in their row as one
          // of them. Values come from glassButton.ts rather than being new
          // hex: that file is the one place the glass recipe is written down.
          'w-auto h-auto min-w-0 shrink-0 gap-[6px] whitespace-nowrap',
          'px-[11px] py-[6px] rounded-[10px]',
          'backdrop-blur-[12px] bg-white/10 border-white/[0.15]',
          'shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]',
          "font-['Avenir',sans-serif] font-medium text-[14px] text-text-secondary",
          'hover:bg-white/20 transition-all',
          'disabled:opacity-50 disabled:pointer-events-none',
          className,
        )}
      >
        <Sparkles className="size-4 shrink-0" aria-hidden="true" />
        <SelectValue>{selected?.label}</SelectValue>
      </SelectTrigger>

      <SelectContent className="min-w-[240px]">
        {MODEL_GROUP_ORDER.map((provider, groupIndex) => (
          <SelectGroup key={provider}>
            {groupIndex > 0 && <SelectSeparator />}
            {/* Provider naming comes from the same table the key modal reads,
                so the two surfaces cannot drift. Note the group ORDER does
                differ from the key screens on purpose — see
                MODEL_GROUP_ORDER. */}
            <SelectLabel className="text-text-tertiary text-[12px] font-medium">
              {PROVIDER_META[provider].label}
            </SelectLabel>

            {availability
              .filter((a) => a.model.provider === provider)
              .map(({ model, locked }) => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  disabled={locked}
                  className="gap-4 pr-8"
                >
                  <span className="flex w-full items-center justify-between gap-4">
                    <span className="text-text-secondary">{model.label}</span>
                    {locked ? (
                      <Lock
                        className="size-3.5 shrink-0 text-text-tertiary"
                        aria-label="Locked"
                      />
                    ) : (
                      <span className="text-text-tertiary text-[12px]">
                        {model.descriptor}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
          </SelectGroup>
        ))}

        {showUnlockRow && (
          <>
            <SelectSeparator />
            {/* One copy for every locked state. Signing in moves trial → free,
                which is still Sonnet-only, so adding a key is the only thing
                that unlocks anything — and the modal this opens offers sign-in
                as its secondary link anyway. */}
            <SelectItem
              value={UNLOCK_VALUE}
              className="pr-2 text-text-tertiary text-[12px]"
            >
              Add an API key to unlock more models
            </SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  )
}
