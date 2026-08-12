import { useId } from 'react'
import { PROVIDER_META, PROVIDER_ORDER } from '@/constants/byokProviders'
import type { ByokProvider } from '@/types/ai'

interface ByokDefaultProviderPickerProps {
  value: ByokProvider
  onChange: (provider: ByokProvider) => void
}

/**
 * Which saved key gets used when the user has both.
 *
 * Mounted in two places — the key modal and the Settings panel — over one
 * persisted value, so there is a single source of truth and no reconciliation
 * between them. Settings owns it editorially, but the modal must be able to
 * set it too: an anonymous visitor with two keys may never open Settings
 * before their first generation, which is exactly the case this exists for.
 *
 * Real radio inputs rather than styled buttons — there is no segmented-control
 * primitive in this codebase, and hand-rolling `role="radiogroup"` means
 * re-implementing arrow-key navigation for a worse result.
 */
export function ByokDefaultProviderPicker({
  value,
  onChange,
}: ByokDefaultProviderPickerProps) {
  // Both mount points can be in the DOM at once, and radio grouping is by
  // `name` — a fixed string would let one picker steal the other's selection.
  const groupName = useId()

  return (
    <fieldset className="m-0 p-0 border-0">
      <legend className="label-m-type2 text-[#9B9EA3] mb-2 p-0">
        Default provider
      </legend>
      <div className="flex gap-4">
        {PROVIDER_ORDER.map((provider) => (
          <label
            key={provider}
            className="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="radio"
              name={groupName}
              value={provider}
              checked={value === provider}
              onChange={() => onChange(provider)}
              className="accent-[#2563eb]"
            />
            <span className="body-m text-[#c9ced4]">
              {PROVIDER_META[provider].label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
