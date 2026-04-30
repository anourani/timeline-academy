import { Plus, CalendarFold, Bolt } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FloatingToolbarProps {
  onAddEventClick: () => void
  onEventsClick: () => void
  onSettingsClick: () => void
  activePanel: 'events' | 'settings' | null
}

export function FloatingToolbar({
  onAddEventClick,
  onEventsClick,
  onSettingsClick,
  activePanel,
}: FloatingToolbarProps) {
  return (
    <>
      {/* Desktop: floating pill, centered at bottom */}
      <div
        className="
          hidden md:flex
          fixed bottom-6 left-1/2 -translate-x-1/2 z-30
          flex-row items-start gap-1.5 p-2
          w-[373px] h-[58px]
          bg-[rgba(23,23,23,0.8)] border border-[#262626] backdrop-blur-[2px]
          rounded-[20px]
        "
      >
        <Button variant="glass" size="none" onClick={onAddEventClick}>
          <Plus size={20} />
          Add Event
        </Button>
        <Button
          variant="glass" size="none"
          data-active={activePanel === 'events'}
          onClick={onEventsClick}
        >
          <CalendarFold size={20} />
          Events
        </Button>
        <Button
          variant="glass" size="none"
          data-active={activePanel === 'settings'}
          onClick={onSettingsClick}
        >
          <Bolt size={20} />
          Settings
        </Button>
      </div>

      {/* Mobile: full-width sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-30 w-full flex md:hidden justify-center items-center gap-1.5 px-4 pt-2 pb-6 bg-black border-t border-[#3d3e40]">
        <Button variant="glass" size="none" onClick={onAddEventClick}>
          <Plus size={20} />
          Add Event
        </Button>
        <Button
          variant="glass" size="none"
          data-active={activePanel === 'events'}
          onClick={onEventsClick}
        >
          <CalendarFold size={20} />
          Events
        </Button>
        <Button
          variant="glass" size="none"
          data-active={activePanel === 'settings'}
          onClick={onSettingsClick}
        >
          <Bolt size={20} />
          Settings
        </Button>
      </div>
    </>
  )
}
