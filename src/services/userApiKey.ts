import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const STORAGE_KEY = 'timeline_byok_anthropic_key'

// Brings auth.users.raw_user_meta_data.byok_enabled in sync with whether a
// BYOK key exists in localStorage. Idempotent and best-effort: no-op when
// already in sync, no-op when logged out, errors are logged not thrown.
async function reconcileBYOKMetadata(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const hasKey = !!getAnthropicKey()
    const currentFlag = !!user.user_metadata?.byok_enabled
    if (hasKey === currentFlag) return
    await supabase.auth.updateUser({ data: { byok_enabled: hasKey } })
  } catch (err) {
    console.warn('BYOK metadata sync failed:', err)
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN') void reconcileBYOKMetadata()
})

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
  void reconcileBYOKMetadata()
}

export function clearAnthropicKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new Event('byok:changed'))
  } catch {
    // ignore
  }
  void reconcileBYOKMetadata()
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
