import { useEffect, useState } from 'react'
import { PopupShell } from '@/components/ui/PopupShell'
import { glassButtonClass, primaryGlassButtonClass } from '@/components/ui/glassButton'
import { PROVIDER_META, PROVIDER_ORDER } from '@/constants/byokProviders'
import { useAccountTier } from '@/hooks/useAccountTier'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'
import {
  hasAnyKey,
  maskKey,
  setKey,
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
   *  this modal and open AuthModal. Only offered while no one is signed in —
   *  a signed-in user opening this modal just wants to add a key. */
  onRequestSignIn?: () => void
}

type DraftMap = Record<ByokProvider, string>
type FieldErrors = Partial<Record<ByokProvider | 'form', string>>

const EMPTY_DRAFTS: DraftMap = { openai: '', anthropic: '' }
const NOT_EDITING: Record<ByokProvider, boolean> = {
  openai: false,
  anthropic: false,
}

// The sign-in card's field: a dark well that takes the brand ring on focus.
const fieldClass = `
  flex items-center gap-2 bg-[#0A0A0A] border border-[#404040] transition-colors
  focus-within:border-[rgba(37,99,235,0.8)] focus-within:ring-1 focus-within:ring-[rgba(37,99,235,0.8)]
`

export function ApiKeyModal({
  isOpen,
  onClose,
  onKeySaved,
  onRequestSignIn,
}: ApiKeyModalProps) {
  const stored = useByokKeys()
  const isMobile = useIsMobile()
  // Two audiences share this modal. Signed out, it is the gate on the Create
  // page: "sign in or bring a key". Signed in, it is reached from the side
  // panel's "Add API Key" link and the model dropdown's unlock row, where a
  // sign-in offer is noise — the user already has an account and only wants
  // the key fields. `loading` deliberately lands in the signed-out branch: an
  // extra sign-in link is harmless, a missing one is not.
  const tier = useAccountTier()
  const signedIn = tier === 'free' || tier === 'byok'
  const [drafts, setDrafts] = useState<DraftMap>(EMPTY_DRAFTS)
  // A field with a saved key shows the masked value until the user chooses to
  // replace it — we never prefill an input with a secret, but the modal
  // shouldn't pretend the key isn't there either.
  const [editing, setEditing] =
    useState<Record<ByokProvider, boolean>>(NOT_EDITING)
  const [errors, setErrors] = useState<FieldErrors>({})

  // Reset state every time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setDrafts(EMPTY_DRAFTS)
      setEditing(NOT_EDITING)
      setErrors({})
    }
  }, [isOpen])

  // This modal is a gate, not a settings screen: it takes keys and gets out of
  // the way. Which model those keys run is decided by the dropdown on the
  // Create page behind it (and by the one in editor settings), so there is
  // nothing to choose here — whichever provider's key is saved, the default
  // model for it applies.
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const entries = PROVIDER_ORDER.map(
      (provider) => [provider, drafts[provider].trim()] as const,
    ).filter(([, value]) => value !== '')

    if (entries.length === 0) {
      // Nothing typed. A user who already has a key is simply continuing past
      // the gate; anyone else has submitted an empty form.
      if (hasAnyKey()) {
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

    // Fire-and-forget on purpose. This modal is the gate standing between a
    // visitor and the generation they asked for, so its job is to get out of
    // the way: setKey() writes the cache synchronously, which is everything
    // the generation needs, and the push to the account settles behind it.
    // A push that fails here is picked up by the next sign-in sync.
    for (const [provider, value] of entries) {
      setKey(provider, value).catch((err) => {
        console.warn('BYOK key push to account failed:', err)
      })
    }

    // No model is written here. With no stored preference, the resolver falls
    // back to the provider's default — Terra for an OpenAI-only key, Sonnet
    // otherwise — which is exactly what the dropdown will show.
    onKeySaved()
  }

  // Focus the first field the user actually has to fill in.
  const firstEmpty = PROVIDER_ORDER.find((provider) => !stored[provider])

  const fieldSize = isMobile
    ? 'h-[52px] rounded-[12px] px-3.5'
    : 'h-11 rounded-[10px] pl-3.5 pr-1'
  const actionSize = isMobile
    ? 'w-full h-[52px] rounded-[12px] text-[16px]'
    : 'flex-1 h-[38px] py-0'

  const fields = PROVIDER_ORDER.map((provider) => {
    const meta = PROVIDER_META[provider]
    const savedKey = stored[provider]
    const showInput = !savedKey || editing[provider]

    return (
      <div key={provider} className="flex flex-col gap-1.5">
        <label
          htmlFor={`byok-${provider}`}
          className="text-[13px] leading-[18px] text-[#9B9EA3]"
        >
          {meta.label}
        </label>

        {showInput ? (
          <div className={cn(fieldClass, fieldSize)}>
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
              autoFocus={firstEmpty === provider}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={Boolean(errors[provider])}
              className={cn(
                "min-w-0 flex-1 bg-transparent outline-none font-['JetBrains_Mono',monospace] text-[#DADEE5] placeholder:text-[#6D7073]",
                // 16px keeps iOS from zooming the page on focus.
                isMobile ? 'text-[16px]' : 'text-[13px]',
              )}
            />
          </div>
        ) : (
          <div className={cn(fieldClass, fieldSize, 'justify-between', isMobile && 'pr-1.5')}>
            <code className="min-w-0 truncate font-['JetBrains_Mono',monospace] text-[13px] text-[#9B9EA3]">
              {maskKey(savedKey)}
            </code>
            <button
              type="button"
              onClick={() =>
                setEditing((prev) => ({ ...prev, [provider]: true }))
              }
              className={cn(
                glassButtonClass,
                'min-w-0 shrink-0 rounded-[8px] px-3 py-0 outline-none focus-visible:ring-1 focus-visible:ring-white/40',
                isMobile ? 'h-10' : 'h-[34px]',
              )}
            >
              Replace
            </button>
          </div>
        )}

        {errors[provider] && (
          <p className="m-0 text-[13px] leading-[18px] text-[#E06A6A]" role="alert">
            {errors[provider]}
          </p>
        )}
      </div>
    )
  })

  const help = (
    <p className={cn('m-0 text-[12px] leading-[18px] text-[#6D7073]', isMobile && 'text-center')}>
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
      .{' '}
      {signedIn
        ? 'Saved to your account, encrypted, so it works on every device you sign in on.'
        : 'Kept only in this browser until you sign in.'}
    </p>
  )

  const submit = (
    <button
      type="submit"
      className={cn(
        primaryGlassButtonClass,
        actionSize,
        'outline-none focus-visible:ring-1 focus-visible:ring-white/40',
      )}
    >
      {signedIn ? 'Save' : 'Save & continue'}
    </button>
  )

  const signIn = !signedIn && onRequestSignIn && (
    <button
      type="button"
      onClick={onRequestSignIn}
      className={cn(
        glassButtonClass,
        actionSize,
        'outline-none focus-visible:ring-1 focus-visible:ring-white/40',
      )}
    >
      Sign in instead
    </button>
  )

  return (
    <PopupShell
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose() }}
      tall
      title={signedIn ? 'Add API Key' : 'Generate with AI'}
      description={signedIn
        ? 'Unlock higher limits and more models with your own OpenAI or Anthropic key. Usage is billed to that provider, not to us.'
        : 'Add your own OpenAI or Anthropic key to generate without an account — usage is billed to that provider, not to us. Or sign in to use ours.'}
      topSlot={
        <span className="font-['JetBrains_Mono',monospace] text-[11px] uppercase text-[#6D7073]">
          Bring your own key
        </span>
      }
    >
      {/* A form so Enter in either field saves, the way it sends the code on
          the sign-in card. */}
      <form onSubmit={save} className={cn('flex flex-col gap-3', isMobile && 'flex-1')} noValidate>
        {fields}

        {errors.form && (
          <p className="m-0 text-[13px] leading-[18px] text-[#E06A6A]" role="alert" aria-live="polite">
            {errors.form}
          </p>
        )}

        {!isMobile && help}

        {isMobile ? (
          <>
            <div className="min-h-6 flex-1" aria-hidden />
            <div className="flex flex-col gap-2">
              {submit}
              {signIn}
            </div>
            <div className="mt-1">{help}</div>
          </>
        ) : (
          <div className="mt-1 flex gap-2">
            {signIn}
            {submit}
          </div>
        )}
      </form>
    </PopupShell>
  )
}
