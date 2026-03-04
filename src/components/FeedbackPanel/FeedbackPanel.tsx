import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface FeedbackPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackPanel({ open, onOpenChange }: FeedbackPanelProps) {
  const handleEmailClick = () => {
    const mailtoLink =
      "mailto:alex@timeline.academy?subject=" +
      encodeURIComponent(
        "I'm a timeline.academy user. Here's my feedback"
      );
    window.location.href = mailtoLink;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] min-w-[360px]">
        <SheetHeader className="border-b pb-4">
          <SheetTitle className="text-xl font-semibold">Feedback</SheetTitle>
          <SheetDescription className="sr-only">
            Send feedback about timeline.academy
          </SheetDescription>
        </SheetHeader>

        <div className="p-6 text-muted-foreground space-y-4">
          <p className="text-foreground font-medium">Hi, I'm Alex.</p>

          <p>
            I'm obsessed with timelines and how they transform the way we
            understand information. They turn isolated moments into visual
            stories that reveal hidden patterns and connections.
          </p>

          <p>
            Timeline.academy is my attempt to create the timeline tool I've
            always wanted - one that's visually clean, simple to manage, and
            functionally intuitive.
          </p>

          <p>
            I'm looking for feedback! The best products grow through their
            community. I'd love to hear your thoughts on how to make
            timeline.academy better – your feedback will help shape its future.
          </p>

          <p>Thanks!</p>

          <div className="pt-4 space-y-3">
            <Button onClick={handleEmailClick} className="w-full">
              Give Feedback
            </Button>

            <Button variant="secondary" asChild className="w-full">
              <a
                href="https://buymeacoffee.com/ttjs81madp"
                target="_blank"
                rel="noopener noreferrer"
              >
                Buy me a coffee
              </a>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
