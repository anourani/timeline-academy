import { TimelineSettingsPanel } from '../Settings/TimelineSettingsPanel';
import { EventTableEditor } from '../EventTableEditor/EventTableEditor';
import { FloatingToolbar } from '../FloatingToolbar/FloatingToolbar';
import { EventForm } from '../EventForm/EventForm';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AddEventsResult } from '../../hooks/useEvents';

interface HeaderProps {
  title: string;
  description: string;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onAddEvent: (event: Omit<TimelineEvent, 'id'>) => void;
  onImportEvents: (events: Omit<TimelineEvent, 'id'>[]) => AddEventsResult;
  onClearTimeline: () => void;
  events: TimelineEvent[];
  categories: CategoryConfig[];
  onCategoriesChange: (categories: CategoryConfig[]) => void;
  onEventsChange: (events: TimelineEvent[]) => void;
  scale: 'large' | 'small';
  onScaleChange: (scale: 'large' | 'small') => void;
  activePanel: 'events' | 'settings' | null;
  onActivePanelChange: (panel: 'events' | 'settings' | null) => void;
  showAddEventModal: boolean;
  onAddEventClick: () => void;
  onCloseAddEventModal: () => void;
}

export function Header({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  onAddEvent,
  onImportEvents,
  onClearTimeline,
  events,
  categories,
  onCategoriesChange,
  onEventsChange,
  scale,
  onScaleChange,
  activePanel,
  onActivePanelChange,
  showAddEventModal,
  onAddEventClick,
  onCloseAddEventModal,
}: HeaderProps) {
  const closePanel = () => onActivePanelChange(null);
  const togglePanel = (panel: 'events' | 'settings') => {
    onActivePanelChange(activePanel === panel ? null : panel);
  };

  const handleAddEventSubmit = (event: Omit<TimelineEvent, 'id'>) => {
    onAddEvent(event);
    onCloseAddEventModal();
  };

  return (
    <>
      {/* Mobile toolbar — desktop toolbar lives in GlobalNav */}
      <div className="md:hidden">
        <FloatingToolbar
          onAddEventClick={onAddEventClick}
          onEventsClick={() => togglePanel('events')}
          onSettingsClick={() => togglePanel('settings')}
          activePanel={activePanel}
        />
      </div>

      <Dialog open={showAddEventModal} onOpenChange={(open) => { if (!open) onCloseAddEventModal(); }}>
        <DialogContent className="bg-surface-secondary border-[rgba(210,210,210,0.15)] max-w-[360px] rounded-[20px] px-5 py-6">
          <DialogHeader>
            <DialogTitle className="header-small text-[#c9ced4] text-center">
              Add Event
            </DialogTitle>
          </DialogHeader>
          <EventForm
            onSubmit={handleAddEventSubmit}
            categories={categories.filter(c => c.visible)}
          />
        </DialogContent>
      </Dialog>

      <TimelineSettingsPanel
        isOpen={activePanel === 'settings'}
        onClose={closePanel}
        events={events}
        timelineTitle={title}
        timelineDescription={description}
        onImportEvents={onImportEvents}
        onClearTimeline={onClearTimeline}
        onTitleChange={onTitleChange}
        onDescriptionChange={onDescriptionChange}
        categories={categories}
        onCategoriesChange={onCategoriesChange}
        scale={scale}
        onScaleChange={onScaleChange}
      />

      <EventTableEditor
        isOpen={activePanel === 'events'}
        onClose={closePanel}
        events={events}
        onEventsChange={onEventsChange}
        categories={categories}
        onCategoriesChange={onCategoriesChange}
      />
    </>
  );
}
