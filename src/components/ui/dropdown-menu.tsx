import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Deliberately *not* themed off the shadcn `--popover` token.
 *
 * `index.css:21` defines it as `217 33% 17%` — a blue-tinted slate inherited
 * from the default palette. Every floating surface in this product is the
 * panel's neutral `#171717` on a `#404040` border, so a menu on `bg-popover`
 * arrives subtly and inexplicably blue against the panel it hangs off. The
 * colours below match `TileMenuButton` in `SidePanel/SidePanelBody.tsx`, which
 * is the menu this one sits four pixels away from.
 *
 * Every surface portals to `document.body` (Radix's default), which is load
 * bearing rather than incidental: `GlobalSidePanel` is `overflow-hidden` and
 * the panel carries a `transform`, so an in-flow menu is clipped and a
 * `position: fixed` one is trapped. Same hazard `Modal.tsx` documents.
 */

const DropdownMenu = DropdownMenuPrimitive.Root

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuSub = DropdownMenuPrimitive.Sub

const SURFACE_CLASS =
  "z-50 min-w-[8rem] overflow-hidden rounded-md border border-[#404040] bg-[#171717] p-1 " +
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 " +
  "data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 " +
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 " +
  "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"

const SURFACE_SHADOW = { filter: "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))" }

// Radix moves DOM focus onto an item on hover as well as on arrow-key
// traversal, so `focus:` covers both and a separate `hover:` rule would only
// diverge from the keyboard highlight.
const ITEM_CLASS =
  "relative flex cursor-pointer select-none items-center gap-2 rounded px-3 py-2 text-sm " +
  "text-[#c9ced4] outline-none transition-colors focus:bg-white/5 focus:text-[#dadee5] " +
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50"

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(ITEM_CLASS, "data-[state=open]:bg-white/5", className)}
    {...props}
  >
    {children}
    <ChevronRight size={14} className="ml-auto shrink-0" />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    style={SURFACE_SHADOW}
    className={cn(SURFACE_CLASS, className)}
    {...props}
  />
))
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      style={SURFACE_SHADOW}
      className={cn(SURFACE_CLASS, className)}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    destructive?: boolean
  }
>(({ className, destructive, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      ITEM_CLASS,
      destructive && "text-destructive focus:text-destructive",
      className,
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn("px-3 py-2 text-sm text-[#6b6e73]", className)}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-[#404040]", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
}
