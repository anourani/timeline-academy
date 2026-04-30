import { useEffect, useState } from 'react'

const STORAGE_KEY = 'timeline_byok_anthropic_key'

function read(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v.trim() ? v : null
  } catch {
    return null
  }
}

export function getAnthropicKey(): string | null {
  return read()
}

export function setAnthropicKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) {
    clearAnthropicKey()
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, trimmed)
    // Notify listeners in this tab — `storage` events only fire in OTHER tabs.
    window.dispatchEvent(new Event('byok:changed'))
  } catch {
    // ignore — quota or disabled storage
  }
}

export function clearAnthropicKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new Event('byok:changed'))
  } catch {
    // ignore
  }
}

export function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 12) return `${key.slice(0, 4)}…`
  return `${key.slice(0, 8)}…${key.slice(-4)}`
}

// React hook — re-renders when the key changes in this tab or any other.
export function useAnthropicKey(): string | null {
  const [key, setKey] = useState<string | null>(() => read())

  useEffect(() => {
    const sync = () => setKey(read())
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) sync()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('byok:changed', sync)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('byok:changed', sync)
    }
  }, [])

  return key
}
