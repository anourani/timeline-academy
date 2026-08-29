import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverAnchor = PopoverPrimitive.Anchor

const DEFAULT_CONTENT_CLASS =
  "z-50 w-auto rounded-lg border bg-popover p-0 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"

interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  /**
   * Drop the default surface and animation classes and use `className` alone.
   *
   * The defaults above include `tailwindcss-animate` utilities (`zoom-in-95`,
   * `slide-in-from-top-2`) which set the same CSS custom properties as any
   * override. `twMerge` has no rule group for them, so both survive the merge
   * and stylesheet order — not class order — decides the winner. A panel that
   * needs its own motion has to replace the string, not layer over it. It also
   * frees the panel from `bg-popover`, the blue-tinted slate that
   * `dropdown-menu.tsx` warns against.
   */
  unstyled?: boolean
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = "start", sideOffset = 4, unstyled = false, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={unstyled ? className : cn(DEFAULT_CONTENT_CLASS, className)}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
