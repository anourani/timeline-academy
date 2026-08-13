import type { ReactNode } from 'react'
import {
  ExternalLink,
  Info,
  LogIn,
  LogOut,
  Settings,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface AccountMenuProps {
  trigger: ReactNode
  /** Opens the account modal — the destination of the single Settings item. */
  onOpenSettings: () => void
  onSignIn: () => void
  onSignOut: () => void
  onDeleteAccount: () => void
}

/**
 * The menu behind the account row. Opens upward, and through a portal — the
 * panel frame is `overflow-hidden` and carries a transform, so neither an
 * in-flow nor a `position: fixed` menu can escape it.
 */
export function AccountMenu({
  trigger,
  onOpenSettings,
  onSignIn,
  onSignOut,
  onDeleteAccount,
}: AccountMenuProps) {
  const { user } = useAuth()

  return (
    /*
      `modal={false}` is load bearing, not a preference.

      As a modal layer the menu writes `pointer-events: none` onto <body> while
      open. Every item here opens another Radix layer — the account modal, or a
      ConfirmationModal for Log Out and Delete Account — and when
      that second layer tears down it restores the style it found on mount,
      which is the menu's `none`. The page then looks fine and ignores every
      click, with nothing on screen to explain why.

      Turning the menu non-modal means it never writes the style, so there is
      nothing stale to restore. Click-outside and Escape still dismiss it; the
      only thing given up is inerting the page behind a small account menu,
      which was never worth having.
    */
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      {/*
        Wider than the row by a fixed overhang, so the menu overlaps the canvas
        at every panel width rather than at one of them. A literal width can't
        do this: the panel is resizable from 300 to 400, so any number is either
        narrower than the card at the top of that range or wider than it needs
        to be at the bottom. Radix publishes the trigger's measured width, so
        the overhang stays constant instead.

        Overflowing the panel at all is only possible because the content
        portals — `GlobalSidePanel` is `overflow-hidden`.
      */}
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-[calc(var(--radix-dropdown-menu-trigger-width)+48px)]"
      >
        {user && <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>}

        {/*
          One entry, not two. This used to be Settings — which opened the
          editor's timeline settings panel and silently did nothing on every
          other route — sitting directly above Account Details. Both now
          resolve here, to the account modal, whose own usage section links on
          to the timeline panel where that panel is actually available.

          Signed-in only, which is where Account Details already sat: the
          destination is an account modal, so it appears exactly when there is
          an account.
        */}
        {user && (
          <DropdownMenuItem onSelect={onOpenSettings}>
            <Settings size={14} />
            Settings
          </DropdownMenuItem>
        )}

        {user && <DropdownMenuSeparator />}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Info size={14} />
            Learn more
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-[220px]">
              {/* New tabs, not <Link>s. `/privacy` and `/terms` mount outside
                  LayoutRoute, so navigating in-tab unmounts the editor and
                  takes unsaved work with it. */}
              <DropdownMenuItem asChild>
                <a href="/privacy" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                  <ExternalLink size={13} className="ml-auto shrink-0 text-[#6b6e73]" />
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href="/terms" target="_blank" rel="noopener noreferrer">
                  Terms &amp; Conditions
                  <ExternalLink size={13} className="ml-auto shrink-0 text-[#6b6e73]" />
                </a>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {user ? (
          <>
            <DropdownMenuItem onSelect={onSignOut}>
              <LogOut size={14} />
              Log Out
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={onDeleteAccount}>
              <Trash2 size={14} />
              Delete Account
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={onSignIn}>
            <LogIn size={14} />
            Sign in
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
