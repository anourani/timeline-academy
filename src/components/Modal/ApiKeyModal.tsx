import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { ByokDefaultProviderPicker } from '@/components/Settings/ByokDefaultProviderPicker'
import { PROVIDER_META, PROVIDER_ORDER } from '@/constants/byokProviders'
import {
  getPreferredProvider,
  hasAnyKey,
  maskKey,
  setKey,
  setPreferredProvider,
  useByokKeys,
  validateKeyFormat,
} from '@/services/userApiKey'
import type { ByokProvider } from '@/types/ai'

interface ApiKeyModalProps {
  isOpen: boolean
  onClose: () => void
  /** Called after the user successfully saves a key. The caller can then
   *  resume whatever AI generation triggered the modal. */
  onKeySaved: () => void
  /** Called when the user picks "Sign in instead". The parent should close
   *  this modal and open AuthModal. */
  onRequestSignIn: () => void
}

type DraftMap = Record<ByokProvider, string>
type FieldErrors = Partial<Record<ByokProvider | 'form', string>>

const EMPTY_DRAFTS: DraftMap = { openai: '', anthropic: '' }
const NOT_EDITING: Record<ByokProvider, boolean> = {
  openai: false,
  anthropic: false,
}

export function ApiKeyModal({
  isOpen,
  onClose,
  onKeySaved,
  onRequestSignIn,
}: ApiKeyModalProps) {
  const stored = useByokKeys()
  const [drafts, setDrafts] = useState<DraftMap>(EMPTY_DRAFTS)
  // A field with a saved key shows the masked value until the user chooses to
  // replace it — we never prefill an input with a secret, but the modal
  // shouldn't pretend the key isn't there either.
  const [editing, setEditing] =
    useState<Record<ByokProvider, boolean>>(NOT_EDITING)
  const [preferred, setPreferred] = useState<ByokProvider>('anthropic')
  const [errors, setErrors] = useState<FieldErrors>({})

  // Reset state every time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setDrafts(EMPTY_DRAFTS)
      setEditing(NOT_EDITING)
      setErrors({})
      setPreferred(getPreferredProvider() ?? 'anthropic')
    }
  }, [isOpen])

  /** Would this provider have a key after a save? Reacts to drafts as well as
   *  stored state, so the picker appears as the second key is typed rather
   *  than only after a save. */
  const willHaveKey = (provider: ByokProvider) =>
    Boolean(drafts[provider].trim()) || Boolean(stored[provider])

  const showPicker = willHaveKey('openai') && willHaveKey('anthropic')

  const save = () => {
    const entries = PROVIDER_ORDER.map(
      (provider) => [provider, drafts[provider].trim()] as const,
    ).filter(([, value]) => value !== '')

    if (entries.length === 0) {
      // Nothing typed. If keys are already saved this is a preference-only
      // commit — the only way a two-key user can change their default from
      // here — otherwise it's an empty submit.
      if (hasAnyKey()) {
        if (showPicker) setPreferredProvider(preferred)
        onKeySaved()
        return
      }
      setErrors({ form: 'Paste at least one key.' })
      return
    }

    // Validate every field before persisting any of them. Validating and
    // saving per field would leave someone who pasted one good key and one
    // typo with the good key silently stored behind an error message.
    const nextErrors: FieldErrors = {}
    for (const [provider, value] of entries) {
      const message = validateKeyFormat(provider, value)
      if (message) nextErrors[provider] = message
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    for (const [provider, value] of entries) setKey(provider, value)

    // Keep the stored preference honest even with one key, so the Settings
    // picker is already correct the moment a second key appears.
    const present = PROVIDER_ORDER.filter(willHaveKey)
    setPreferredProvider(present.length > 1 ? preferred : present[0])

    onKeySaved()
  }

  // Focus the first field the user actually has to fill in.
  const firstEmpty = PROVIDER_ORDER.find((provider) => !stored[provider])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generate with AI">
      <div className="space-y-4">
        <p className="body-m text-[#c9ced4] m-0">
          Timeline Academy uses AI to generate event details and timelines. Add
          your own OpenAI or Anthropic key to generate without an account —
          usage is billed to that provider account, not to us. Or sign in to
          use ours.
        </p>

        {PROVIDER_ORDER.map((provider) => {
          const meta = PROVIDER_META[provider]
          const savedKey = stored[provider]
          const showInput = !savedKey || editing[provider]

          return (
            <div key={provider} className="flex flex-col gap-1">
              <label
                htmlFor={`byok-${provider}`}
                className="label-m-type2 text-[#9B9EA3]"
              >
                {meta.label}
              </label>

              {showInput ? (
                <input
                  id={`byok-${provider}`}
                  type="password"
                  placeholder={meta.placeholder}
                  value={drafts[provider]}
                  onChange={(e) => {
                    setDrafts((prev) => ({
                      ...prev,
                      [provider]: e.target.value,
                    }))
                    // Clear this field's complaint as soon as it is being
                    // addressed — otherwise a corrected field keeps showing
                    // the old error until the next save attempt, which reads
                    // as "still wrong". The form-level error goes too, since
                    // it only ever means "nothing typed".
                    setErrors((prev) =>
                      prev[provider] || prev.form
                        ? { ...prev, [provider]: undefined, form: undefined }
                        : prev,
                    )
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') save()
                  }}
                  autoFocus={firstEmpty === provider}
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full h-9 bg-[#242526] border border-[#262626] rounded-[8px] px-3 py-[7.5px] outline-none focus:border-[#404040] font-['JetBrains_Mono',monospace] text-[12px] text-[#DADEE5]"
                />
              ) : (
                <div className="flex items-center justify-between gap-2 h-9 px-3">
                  <code className="font-['JetBrains_Mono',monospace] text-[12px] text-[#9B9EA3]">
                    {maskKey(savedKey)}
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing((prev) => ({ ...prev, [provider]: true }))
                    }
                    className="font-['Avenir',sans-serif] text-[12px] text-[#9B9EA3] underline hover:text-[#DADEE5]"
                  >
                    Replace
                  </button>
                </div>
              )}

              {errors[provider] && (
                <p className="body-m text-destructive m-0">
                  {errors[provider]}
                </p>
              )}
            </div>
          )
        })}

        {showPicker && (
          <ByokDefaultProviderPicker
            value={preferred}
            onChange={setPreferred}
          />
        )}

        {errors.form && (
          <p className="body-m text-destructive m-0">{errors.form}</p>
        )}

        <p className="font-['Avenir',sans-serif] text-[12px] leading-[16px] text-[#6b6e73] m-0">
          Get a key at{' '}
          {PROVIDER_ORDER.map((provider, i) => (
            <span key={provider}>
              {i > 0 && ' or '}
              <a
                href={PROVIDER_META[provider].consoleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[#9B9EA3]"
              >
                {PROVIDER_META[provider].consoleLabel}
              </a>
            </span>
          ))}
          . Stored only in this browser.
        </p>

        <div className="flex flex-col gap-2">
          <button onClick={save} className={glassPrimary}>
            Save &amp; continue
          </button>
          <button
            onClick={onRequestSignIn}
            className="self-center font-['Avenir',sans-serif] text-[14px] leading-[20px] text-[#9B9EA3] underline hover:text-[#DADEE5] transition-colors"
          >
            Sign in instead
          </button>
        </div>
      </div>
    </Modal>
  )
}

const glassPrimary = `
  relative px-[16px] py-[8px] rounded-[10px]
  backdrop-blur-[12px] bg-[rgba(37,99,235,0.8)] border border-white/[0.15]
  shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
  font-['Avenir',sans-serif] font-medium text-[14px] text-[#dadee5]
  hover:bg-[rgba(37,99,235,0.9)] transition-all
`
