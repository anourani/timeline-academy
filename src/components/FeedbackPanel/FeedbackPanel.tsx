import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FeedbackPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeedbackPanel({ open, onOpenChange }: FeedbackPanelProps) {
  const handleEmailClick = () => {
    const mailtoLink =
      "mailto:alex@timeline.academy?subject=" +
      encodeURIComponent(
        "I'm a timeline.academy user. Here's my feedback"
      )
    window.location.href = mailtoLink
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, onOpenChange])

  if (typeof document === "undefined") return null

  return createPortal(
    <>
      <div
        onClick={() => onOpenChange(false)}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-out ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      />
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-[320px] pr-[6px] py-[6px] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
        aria-label="Feedback side panel"
      >
      <div className="h-full w-full bg-[#171717] rounded-[6px] border border-[#262626] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2 border-b border-[#404040] shrink-0">
          <h2 className="font-['Aleo',serif] font-normal text-[18px] leading-[1.4] text-[#c9ced4] m-0">
            Feedback
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="relative flex items-center justify-center p-1.5 rounded-lg border border-white/15 bg-white/10 backdrop-blur-[12px] text-[#c9ced4] shadow-[0px_8px_32px_0px_rgba(0,0,0,0.4),inset_0px_1px_0px_0px_rgba(255,255,255,0.1)] hover:bg-white/20 hover:text-[#dadee5] transition-colors"
            aria-label="Close feedback panel"
          >
            <X size={16} strokeWidth={1.25} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col px-5 pt-6 pb-2 gap-4">
            <p className="font-['Avenir',sans-serif] text-[14px] leading-[20px] text-[#c9ced4] m-0">
              So you have some feedback, huh? You came to the right place.
            </p>
            <p className="font-['Avenir',sans-serif] text-[14px] leading-[20px] text-[#c9ced4] m-0">
              If something's broken, confusing, or missing, tell us. If there's a feature you wish existed, tell us. If you just want to say what's working (or what isn't), we want to hear that too.
            </p>
            <p className="font-['Avenir',sans-serif] text-[14px] leading-[20px] text-[#c9ced4] m-0">
              Every piece of feedback gets read, and a lot of what you'll see in future updates will come directly from messages like the one you're about to send.
            </p>
            <p className="font-['Avenir',sans-serif] text-[14px] leading-[20px] text-[#c9ced4] m-0">
              No feedback is too small, too rough, or too weird. We're all ears.
            </p>
            <p className="font-['Avenir',sans-serif] text-[14px] leading-[20px] text-[#c9ced4] m-0">
              Thank you in advance!
            </p>
          </div>

          <div className="flex flex-col px-5 pt-6 pb-3 gap-2.5">
            <Button variant="glass" asChild className="w-full">
              <a
                href="https://buymeacoffee.com/ttjs81madp"
                target="_blank"
                rel="noopener noreferrer"
              >
                Buy me a coffee
              </a>
            </Button>
            <Button variant="glass" className="w-full" onClick={handleEmailClick}>
              Feedback
            </Button>
          </div>
        </div>
      </div>
      </aside>
    </>,
    document.body
  )
}
