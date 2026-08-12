import { useState } from 'react'
import { ByokDefaultProviderPicker } from './ByokDefaultProviderPicker'
import { PROVIDER_META, PROVIDER_ORDER } from '@/constants/byokProviders'
import {
  clearKey,
  hasAnyKey,
  maskKey,
  setKey,
  setPreferredProvider,
  useByokCredential,
  useByokKeys,
  validateKeyFormat,
} from '@/services/userApiKey'
import { useAuth } from '@/hooks/useAuth'
import type { ByokProvider } from '@/types/ai'

interface ApiKeySectionProps {
  defaultExpanded?: boolean
}

export function ApiKeySection({ defaultExpanded = false }: ApiKeySectionProps) {
  const stored = useByokKeys()
  const active = useByokCredential()
  const { user } = useAuth()

  // Only one row edits at a time, so a single draft/error pair still models
  // the state correctly — the same shape this section always had, widened
  // from a boolean to "which provider".
  const [editing, setEditing] = useState<ByokProvider | null>(
    defaultExpanded && !hasAnyKey() ? 'openai' : null,
  )
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Three states, not two. A key always wins, signed in or not — that's how the
  // AI routing itself decides. Without one, whether there's a fallback depends
  // on having an account: server-funded generation requires a JWT, so telling a
  // signed-out visitor they're "using our server" would be plainly false.
  //
  // This section used to bail out entirely when signed out, which left the
  // account-free byok-anon tier with no way to see, replace or remove the key
  // it is defined by.
  const status: 'byok' | 'server' | 'none' = active
    ? 'byok'
    : user
      ? 'server'
      : 'none'

  const bothPresent = Boolean(stored.anthropic && stored.openai)

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

  const save = () => {
    if (!editing) return
    const trimmed = draft.trim()
    const message = validateKeyFormat(editing, trimmed)
    if (message) {
      setError(message)
      return
    }
    setKey(editing, trimmed)
    setEditing(null)
    setDraft('')
    setError(null)
  }

  const remove = (provider: ByokProvider) => {
    // Removing the non-active key of two does not change tier — hasAnyKey()
    // stays true. Removing the last one drops a signed-out visitor back to
    // trial, which leaves their localStorage drafts dormant, not deleted.
    clearKey(provider)
    setEditing(null)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <span className="label-m-type2 text-[#9B9EA3]">AI Settings</span>
      <div className="h-px bg-[#262626] w-full" />

      {/* One pill, not one per provider: it answers "where does AI actually
          go", and that has exactly one answer. */}
      <StatusPill
        status={status}
        providerLabel={active ? PROVIDER_META[active.provider].label : undefined}
      />

      {PROVIDER_ORDER.map((provider) => {
        const meta = PROVIDER_META[provider]
        const savedKey = stored[provider]
        const isEditing = editing === provider
        const isDefault = bothPresent && active?.provider === provider

        return (
          <div key={provider} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="label-m-type2 text-[#9B9EA3]">{meta.label}</span>
              {isDefault && (
                <span className="font-['Avenir',sans-serif] text-[11px] text-[#6b6e73]">
                  Default
                </span>
              )}
            </div>

            {!isEditing && savedKey && (
              <div className="flex items-center justify-between gap-2">
                <code className="font-['JetBrains_Mono',monospace] text-[12px] text-[#c9ced4] break-all">
                  {maskKey(savedKey)}
                </code>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => startEdit(provider)}
                    className={glassButton}
                  >
                    Replace
                  </button>
                  <button
                    onClick={() => remove(provider)}
                    className={glassButton}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            {!isEditing && !savedKey && (
              <button
                onClick={() => startEdit(provider)}
                className={`${glassButton} self-start`}
              >
                Add {meta.label} key
              </button>
            )}

            {isEditing && (
              <div className="flex flex-col gap-2">
                <input
                  type="password"
                  placeholder={meta.placeholder}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') save()
                    else if (e.key === 'Escape') cancelEdit()
                  }}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full h-9 bg-[#242526] border border-[#262626] rounded-[8px] px-3 py-[7.5px] body-m text-[#DADEE5] outline-none focus:border-[#404040] font-['JetBrains_Mono',monospace] text-[12px]"
                />
                {error && <p className="body-m text-destructive m-0">{error}</p>}
                <div className="flex gap-1.5">
                  <button onClick={save} className={glassButton}>
                    Save
                  </button>
                  <button onClick={cancelEdit} className={glassButton}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {bothPresent && (
        <ByokDefaultProviderPicker
          value={stored.preferred ?? 'anthropic'}
          onChange={setPreferredProvider}
        />
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
        . Stored only in this browser — anyone with access to this device can
        see it. Usage is billed to that provider account, not to us.
      </p>
    </div>
  )
}

function StatusPill({
  status,
  providerLabel,
}: {
  status: 'byok' | 'server' | 'none'
  providerLabel?: string
}) {
  const config = {
    byok: {
      label: `Using your ${providerLabel ?? 'own'} key`,
      dot: '#259E23',
      text: '#c9ced4',
    },
    server: {
      label: "Using Timeline Academy's server (5/day)",
      dot: '#9B9EA3',
      text: '#9B9EA3',
    },
    none: {
      label: 'AI is off — add a key or log in',
      dot: '#6b6e73',
      text: '#9B9EA3',
    },
  }[status]

  return (
    <div className="flex items-center gap-2">
      <span
        className="rounded-full size-1.5 shrink-0"
        style={{ backgroundColor: config.dot }}
        aria-hidden
      />
      <span className="body-m" style={{ color: config.text }}>
        {config.label}
      </span>
    </div>
  )
}

const glassButton = `
  relative px-[11px] py-[6px] rounded-[10px]
  backdrop-blur-[12px] bg-white/10 border border-white/[0.15]
  shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
  font-['Avenir',sans-serif] font-medium text-[14px] text-[#c9ced4]
  hover:bg-white/20 hover:text-[#dadee5] transition-all
`
