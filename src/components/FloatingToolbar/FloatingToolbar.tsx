import { Plus, Columns3, Layers, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FloatingToolbarProps {
  onAddEventClick: () => void
  onEventsClick: () => void
  onCategoriesClick: () => void
  onSettingsClick: () => void
  activePanel: 'events' | 'categories' | 'settings' | null
}

export function FloatingToolbar({
  onAddEventClick,
  onEventsClick,
  onCategoriesClick,
  onSettingsClick,
  activePanel
}: FloatingToolbarProps) {
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex items-center gap-2.5">
        <Button variant="glass" size="none" onClick={onAddEventClick}>
          <Plus size={18} />
          Add Event
        </Button>
        <Button
          variant="glass" size="none"
          data-active={activePanel === 'events'}
          onClick={onEventsClick}
        >
          <Columns3 size={18} />
          Event
        </Button>
        <Button
          variant="glass" size="none"
          data-active={activePanel === 'categories'}
          onClick={onCategoriesClick}
        >
          <Layers size={18} />
          Categories
        </Button>
        <Button
          variant="glass" size="none"
          data-active={activePanel === 'settings'}
          onClick={onSettingsClick}
        >
          <Settings size={18} />
          Settings
        </Button>
      </div>

      {/* Mobile: Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 w-full flex md:hidden justify-around items-center gap-2 px-4 pt-2 pb-6 bg-black border-t border-[#3d3e40]">
        <Button
          variant="glass" size="none"
          className="flex-col gap-1 h-auto px-3 py-2 text-[11px] min-w-0"
          onClick={onAddEventClick}
        >
          <Plus size={20} />
          Add
        </Button>
        <Button
          variant="glass" size="none"
          className="flex-col gap-1 h-auto px-3 py-2 text-[11px] min-w-0"
          data-active={activePanel === 'events'}
          onClick={onEventsClick}
        >
          <Columns3 size={20} />
          Events
        </Button>
        <Button
          variant="glass" size="none"
          className="flex-col gap-1 h-auto px-3 py-2 text-[11px] min-w-0"
          data-active={activePanel === 'categories'}
          onClick={onCategoriesClick}
        >
          <Layers size={20} />
          Categories
        </Button>
        <Button
          variant="glass" size="none"
          className="flex-col gap-1 h-auto px-3 py-2 text-[11px] min-w-0"
          data-active={activePanel === 'settings'}
          onClick={onSettingsClick}
        >
          <Settings size={20} />
          Settings
        </Button>
      </div>
    </>
  )
}
