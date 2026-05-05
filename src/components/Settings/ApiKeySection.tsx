import { useState } from 'react'
import {
  clearAnthropicKey,
  maskKey,
  setAnthropicKey,
  useAnthropicKey,
} from '@/services/userApiKey'
import { useAuth } from '@/hooks/useAuth'

interface ApiKeySectionProps {
  defaultExpanded?: boolean
}

export function ApiKeySection({ defaultExpanded = false }: ApiKeySectionProps) {
  const key = useAnthropicKey()
  const { user } = useAuth()
  const [editing, setEditing] = useState(defaultExpanded && !key)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!user) {
    return (
      <div className="flex flex-col gap-2.5">
        <span className="label-m-type2 text-[#9B9EA3]">AI Settings</span>
        <div className="h-px bg-[#262626] w-full" />
        <p className="body-m text-[#c9ced4] m-0">
          Log in to add an Anthropic API key for unlimited AI generation.
        </p>
      </div>
    )
  }

  const status: 'byok' | 'server' = key ? 'byok' : 'server'

  const startEdit = () => {
    setDraft('')
    setError(null)
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setDraft('')
    setError(null)
  }

  const save = () => {
    const trimmed = draft.trim()
    if (!trimmed) {
      setError('Paste a key first.')
      return
    }
    if (!trimmed.startsWith('sk-ant-')) {
      setError('Anthropic keys start with sk-ant-. Double-check and try again.')
      return
    }
    setAnthropicKey(trimmed)
    setEditing(false)
    setDraft('')
    setError(null)
  }

  const remove = () => {
    clearAnthropicKey()
    setEditing(false)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <span className="label-m-type2 text-[#9B9EA3]">AI Settings</span>
      <div className="h-px bg-[#262626] w-full" />

      <StatusPill status={status} />

      {!editing && key && (
        <div className="flex items-center justify-between gap-2">
          <code className="font-['JetBrains_Mono',monospace] text-[12px] text-[#c9ced4] break-all">
            {maskKey(key)}
          </code>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={startEdit} className={glassButton}>
              Replace
            </button>
            <button onClick={remove} className={glassButton}>
              Remove
            </button>
          </div>
        </div>
      )}

      {!editing && !key && (
        <button onClick={startEdit} className={`${glassButton} self-start`}>
          Add Anthropic key
        </button>
      )}

      {editing && (
        <div className="flex flex-col gap-2">
          <input
            type="password"
            placeholder="sk-ant-..."
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
          {error && (
            <p className="body-m text-destructive m-0">{error}</p>
          )}
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

      <p className="font-['Avenir',sans-serif] text-[12px] leading-[16px] text-[#6b6e73] m-0">
        Get a key at{' '}
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[#9B9EA3]"
        >
          console.anthropic.com
        </a>
        . Stored only in this browser — anyone with access to this device can
        see it.
      </p>
    </div>
  )
}

function StatusPill({
  status,
}: {
  status: 'byok' | 'server'
}) {
  const config = {
    byok: {
      label: 'Using your Anthropic key',
      dot: '#259E23',
      text: '#c9ced4',
    },
    server: {
      label: "Using Timeline Academy's server (5/day)",
      dot: '#9B9EA3',
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
