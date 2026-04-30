import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { setAnthropicKey } from '@/services/userApiKey'

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

export function ApiKeyModal({
  isOpen,
  onClose,
  onKeySaved,
  onRequestSignIn,
}: ApiKeyModalProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showInput, setShowInput] = useState(false)

  // Reset state every time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setDraft('')
      setError(null)
      setShowInput(false)
    }
  }, [isOpen])

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
    onKeySaved()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generate with AI">
      <div className="space-y-4">
        <p className="body-m text-[#c9ced4] m-0">
          Timeline Academy uses Claude to generate event details and timelines.
          You can use your own Anthropic API key (free, no rate limits) or sign
          in to use ours.
        </p>

        {!showInput ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowInput(true)}
              className={glassPrimary}
            >
              Add Anthropic key
            </button>
            <button
              onClick={onRequestSignIn}
              className={glassSecondary}
            >
              Sign in instead
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              type="password"
              placeholder="sk-ant-..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
              }}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              className="w-full h-9 bg-[#242526] border border-[#262626] rounded-[8px] px-3 py-[7.5px] outline-none focus:border-[#404040] font-['JetBrains_Mono',monospace] text-[12px] text-[#DADEE5]"
            />
            {error && (
              <p className="body-m text-destructive m-0">{error}</p>
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
              . Stored only in this browser.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowInput(false)}
                className={glassSecondary}
              >
                Back
              </button>
              <button onClick={save} className={glassPrimary}>
                Save & continue
              </button>
            </div>
          </div>
        )}
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

const glassSecondary = `
  relative px-[16px] py-[8px] rounded-[10px]
  backdrop-blur-[12px] bg-white/10 border border-white/[0.15]
  shadow-[0px_8px_32px_rgba(0,0,0,0.4),inset_0px_1px_0px_rgba(255,255,255,0.1)]
  font-['Avenir',sans-serif] font-medium text-[14px] text-[#c9ced4]
  hover:bg-white/20 hover:text-[#dadee5] transition-all
`
