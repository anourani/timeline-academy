import { KeyRound } from 'lucide-react'
import { DockMenu } from '@/components/FloatingToolbar/DockMenu'
import { ApiKeySection } from '@/components/Settings/ApiKeySection'
import { buttonVariants } from '@/components/ui/buttonVariants'
import { useByokCredential } from '@/services/userApiKey'
import { cn } from '@/lib/utils'

export interface DockApiKeysProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled?: boolean
  iconOnly?: boolean
  triggerClassName?: string
}

/**
 * The dock's API Keys menu: the BYOK keys and the model picker, which used to
 * sit at the top of the Settings panel. Keys belong to the account rather than
 * to one timeline, so they get their own place instead of sharing a panel with
 * Import, Download and Delete.
 *
 * The green dot on the key says "your own key is paying for AI" without
 * opening anything.
 */
export function DockApiKeys({
  open,
  onOpenChange,
  disabled = false,
  iconOnly = false,
  triggerClassName,
}: DockApiKeysProps) {
  const credential = useByokCredential()

  // A plain <button>, not <Button>: Radix needs a forwarded ref to anchor the
  // popover to. See `DockDesign`.
  const trigger = (
    <button
      type="button"
      aria-label="API Keys"
      title={iconOnly ? 'API Keys' : undefined}
      data-active={open}
      disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
      className={cn(
        buttonVariants({ variant: 'glass', size: 'none' }),
        disabled && 'opacity-50 pointer-events-none',
        triggerClassName,
      )}
    >
      <span className="relative flex">
        <KeyRound size={20} />
        {credential && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-[3px] size-[7px] rounded-full bg-[#2fbf2c] shadow-[0_0_0_2px_#262626]"
          />
        )}
      </span>
      {!iconOnly && 'API Keys'}
    </button>
  )

  return (
    <DockMenu
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger}
      title="API Keys"
      label="API keys"
      widthClass="w-[320px]"
      // Opened from links elsewhere too (Account Details, the side panel's
      // usage section, the Settings panel's note) — see DockMenu.
      onFocusOutside={(e) => e.preventDefault()}
    >
      <ApiKeySection />
    </DockMenu>
  )
}
