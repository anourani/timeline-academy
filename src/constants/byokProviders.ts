// Display metadata for the BYOK providers.
//
// Every user-facing mention of a provider — the modal fields, the Settings
// rows, the status pill, the retry button — reads from here, so provider
// naming and console links cannot drift between surfaces.

import type { ByokProvider } from '@/types/ai'

export interface ProviderMeta {
  /** Human-readable name, as shown in labels and buttons. */
  label: string
  /** Input placeholder, which doubles as a hint at the expected key prefix. */
  placeholder: string
  consoleUrl: string
  /** Bare domain, used as the visible link text. */
  consoleLabel: string
}

export const PROVIDER_META: Record<ByokProvider, ProviderMeta> = {
  openai: {
    label: 'OpenAI',
    placeholder: 'sk-...',
    consoleUrl: 'https://platform.openai.com/api-keys',
    consoleLabel: 'platform.openai.com',
  },
  anthropic: {
    label: 'Anthropic',
    placeholder: 'sk-ant-...',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    consoleLabel: 'console.anthropic.com',
  },
}

/** The order providers are listed in wherever both are shown. */
export const PROVIDER_ORDER: ByokProvider[] = ['openai', 'anthropic']
