import { useContext } from 'react'
import {
  GenerationContext,
  type GenerationContextValue,
} from '@/contexts/GenerationContext'

/**
 * The in-flight AI generation.
 *
 * Throws rather than returning null when unmounted: every caller sits inside
 * `LayoutRoute`, so a missing provider is a wiring mistake, not a state a
 * component should be written to tolerate.
 */
export function useGeneration(): GenerationContextValue {
  const ctx = useContext(GenerationContext)
  if (!ctx) {
    throw new Error('useGeneration must be used within a GenerationProvider')
  }
  return ctx
}
