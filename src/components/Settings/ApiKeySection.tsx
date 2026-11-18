import { useState } from 'react'
import { ModelSelector } from './ModelSelector'
import { PROVIDER_META, PROVIDER_ORDER } from '@/constants/byokProviders'
import {
  clearKey,
  setKey,
  useByokCredential,
  useByokKeys,
  validateKeyFormat,
} from '@/services/userApiKey'
import { useAuth } from '@/hooks/useAuth'
import type { ByokProvider } from '@/types/ai'
import { cn } from '@/lib/utils'

/**
 * The body of the dock's API Keys menu: a status badge, one quiet row per
 * provider, and the model picker.
 *
 * Deliberately sparse. It used to live in the Settings panel as a stack of
 * labelled fields, which read as a form with ten inputs. Now no text field
 * exists until someone presses Add, and then exactly one does.
 *
 * Sizing comes in pairs: the unprefixed size is for the phone drawer (44px
 * touch targets), the `md:` one for the desktop popover — the same split
 * `DockDesign` uses, since `DockMenu` renders one or the other.
 */
export function ApiKeySection() {
  const stored = useByokKeys()
  const active = useByokCredential()
  const { user } = useAuth()

  const [editing, setEditing] = useState<ByokProvider | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<{
    provider: ByokProvider
    message: string
  } | null>(null)

  const status: 'byok' | 'server' | 'none' = active
    ? 'byok'
    : user
      ? 'server'
      : 'none'

  const startEdit = (provider: ByokProvider) => {
    setDraft('')
    setError(null)
    setEditing(provider)
  }

  const cancelEdit = () => {
    setEditing(null)
    setDraft('')
    setError(null)
  }

  const save = async () => {
    if (!editing) return
    const provider = editing
    const trimmed = draft.trim()
    const message = validateKeyFormat(provider, trimmed)
    if (message) {
      setError({ provider, message })
      return
    }

    setEditing(null)
    setDraft('')
    setError(null)
    try {
      await setKey(provider, trimmed)
    } catch {
      setError({
        provider,
        message:
          "Saved in this browser, but it couldn't be saved to your account. It will retry the next time you load the page.",
      })
    }
  }

  const remove = async (provider: ByokProvider) => {
    setEditing(null)
    setError(null)
    try {
      await clearKey(provider)
    } catch {
      setError({
        provider,
        message:
          "Couldn't remove the key from your account. Check your connection and try again.",
      })
    }
  }

  const bothKeys = Boolean(stored.anthropic && stored.openai)

  return (
    <div className="flex flex-col gap-6 px-[10px] pt-2 pb-3 md:gap-4 md:pt-0 md:pb-2">
      <StatusBadge
        status={status}
        providerLabel={active ? PROVIDER_META[active.provider].label : undefined}
      />

      <div className="flex flex-col">
        {PROVIDER_ORDER.map((provider, i) => {
          const meta = PROVIDER_META[provider]
          const savedKey = stored[provider]
          const isEditing = editing === provider
          const isDefault = bothKeys && active?.provider === provider
          const inputId = `byok-key-${provider}`

          return (
            <div
              key={provider}
              className={cn(
                'flex flex-col py-2 border-t border-[#262626]',
                i === PROVIDER_ORDER.length - 1 && 'border-b',
              )}
            >
              <div className="flex min-h-[44px] items-center justify-between gap-3 md:min-h-[36px]">
                <div className="flex min-w-0 flex-col gap-[2px]">
                  <span className="text-[15px] leading-[20px] text-[#dadee5] md:text-[14px]">
                    {meta.label}
                  </span>
                  {savedKey ? (
                    <span className="truncate font-['JetBrains_Mono',monospace] text-[12px] leading-[16px] text-[#9B9EA3]">
                      Connected · ••••{savedKey.slice(-4)}
                      {isDefault && ' · default'}
                    </span>
                  ) : (
                    <span className="text-[13px] leading-[16px] text-[#8b8f95] md:text-[12px]">
                      Not added
                    </span>
                  )}
                </div>

                {savedKey ? (
                  <button
                    type="button"
                    onClick={() => void remove(provider)}
                    aria-label={`Remove ${meta.label} key`}
                    className={GHOST_BUTTON}
                  >
                    Remove
                  </button>
                ) : (
                  !isEditing && (
                    <button
                      type="button"
                      onClick={() => startEdit(provider)}
                      aria-label={`Add ${meta.label} key`}
                      className={ADD_BUTTON}
                    >
                      Add
                    </button>
                  )
                )}
              </div>

              {isEditing && (
                <div className="flex flex-col gap-2 pt-1 pb-2">
                  <label htmlFor={inputId} className="sr-only">
                    {meta.label} API key
                  </label>
                  <input
                    id={inputId}
                    type="password"
                    placeholder={meta.placeholder}
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value)
                      setError(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void save()
                      else if (e.key === 'Escape') {
                        // Escape belongs to the input while it's open: cancel
                        // the edit rather than closing the whole menu.
                        e.stopPropagation()
                        cancelEdit()
                      }
                    }}
                    autoFocus
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full h-11 md:h-9 bg-[#242526] border border-[#333] rounded-[10px] md:rounded-[8px] px-3 text-[#DADEE5] outline-none focus:border-[#525252] font-['JetBrains_Mono',monospace] text-[13px] md:text-[12px]"
                  />
                  <div className="flex gap-2 md:gap-1.5">
                    <button
                      type="button"
                      onClick={() => void save()}
                      className="flex-1 md:flex-none h-11 md:h-auto px-4 md:px-[14px] md:py-[6px] rounded-[10px] md:rounded-[8px] bg-[rgba(37,99,235,0.85)] hover:bg-[rgba(37,99,235,0.95)] border border-white/[0.15] text-[15px] md:text-[13px] font-medium text-[#fafafa] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                    >
                      Save key
                    </button>
                    <button type="button" onClick={cancelEdit} className={GHOST_BUTTON}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {error?.provider === provider && (
                <p className="m-0 pb-1 text-[13px] leading-[18px] text-destructive md:text-[12px] md:leading-[16px]">
                  {error.message}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* The model only means something once a key pays for it — the
          selector itself locks every option without one. */}
      {active && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-[#9B9EA3] md:text-[12px]">Model</span>
          <ModelSelector />
        </div>
      )}

      <p className="m-0 text-[13px] leading-[18px] text-[#8b8f95] md:text-[12px] md:leading-[16px]">
        Need a key?{' '}
        {PROVIDER_ORDER.map((provider, i) => (
          <span key={provider}>
            {i > 0 && ' · '}
            <a
              href={PROVIDER_META[provider].consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[#dadee5]"
            >
              {PROVIDER_META[provider].label}
            </a>
          </span>
        ))}
        {!user && (
          <>
            <br />
            Kept only in this browser until you sign in.
          </>
        )}
      </p>
    </div>
  )
}

const GHOST_BUTTON =
  'shrink-0 h-11 md:h-auto px-3 md:px-[10px] md:py-[6px] rounded-[10px] md:rounded-[8px] bg-transparent text-[14px] md:text-[13px] font-medium text-[#9B9EA3] hover:bg-white/[0.08] hover:text-[#dadee5] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40'

const ADD_BUTTON =
  'shrink-0 h-11 md:h-auto px-4 md:px-[14px] md:py-[6px] rounded-[10px] md:rounded-[8px] bg-white/10 border border-white/[0.15] text-[14px] md:text-[13px] font-medium text-[#dadee5] hover:bg-white/20 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/40'

/**
 * Who pays for AI right now, as a rounded badge. It used to be a bordered
 * box, which read as a text field.
 */
function StatusBadge({
  status,
  providerLabel,
}: {
  status: 'byok' | 'server' | 'none'
  providerLabel?: string
}) {
  const config = {
    byok: {
      label: `Using your ${providerLabel ?? 'own'} key`,
      help: 'Usage is billed to your provider account, not to us.',
      badge: 'bg-[rgba(47,191,44,0.14)] text-[#86e283]',
      dot: 'bg-[#2fbf2c]',
    },
    server: {
      label: "Using Timeline Academy's AI",
      help: 'Limited to 5 generations a day. Add a key to lift that.',
      badge: 'bg-white/[0.08] text-[#c9ced4]',
      dot: 'bg-[#9B9EA3]',
    },
    none: {
      label: 'AI is off',
      help: 'Add a key, or log in to use ours.',
      badge: 'bg-white/[0.08] text-[#c9ced4]',
      dot: 'bg-[#6b6e73]',
    },
  }[status]

  return (
    <div className="flex flex-col items-start gap-2 md:gap-1.5">
      <span
        className={cn(
          'inline-flex h-[30px] items-center gap-2 rounded-full px-3 text-[13px] font-medium md:h-[26px] md:px-[10px] md:text-[12px]',
          config.badge,
        )}
      >
        <span className={cn('size-[7px] shrink-0 rounded-full', config.dot)} aria-hidden />
        {config.label}
      </span>
      <p className="m-0 text-[14px] leading-[20px] text-[#9B9EA3] md:text-[12px] md:leading-[16px]">
        {config.help}
      </p>
    </div>
  )
}
