import { useState } from 'react';
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
  /** Passed through to the dock for the AI-generation intro. */
  intro?: boolean
  streaming?: boolean
  title: string;
  onAddEvent: (event: Omit<TimelineEvent, 'id'>) => void;
  onImportEvents: (events: Omit<TimelineEvent, 'id'>[]) => AddEventsResult;
  events: TimelineEvent[];
  categories: CategoryConfig[];
  onCategoriesChange: (categories: CategoryConfig[]) => void;
  onEventsChange: (events: TimelineEvent[]) => void;
  scale: 'large' | 'medium' | 'small';
  onScaleChange: (scale: 'large' | 'medium' | 'small') => void;
  verticalScale: 'small' | 'medium';
  onVerticalScaleChange: (scale: 'small' | 'medium') => void;
  groupByCategory: boolean;
  onGroupByCategoryChange: (value: boolean) => void;
  activePanel: 'events' | 'settings' | 'legend' | null;
  onActivePanelChange: (panel: 'events' | 'settings' | 'legend' | null) => void;
  showAddEventModal: boolean;
  onAddEventClick: () => void;
  onCloseAddEventModal: () => void;
  onDeleteTimeline: () => Promise<void> | void;
  mode?: 'edit' | 'view';
  onModeChange?: (mode: 'edit' | 'view') => void;
  /** AI timeline: the dock carries the legend and the add controls go. */
  aiGenerated?: boolean;
  /**
   * What the dock's legend shows. The generation store's categories and
   * events while streaming, like the nav legend, so its dots are the run's
   * rather than whatever the editor held before.
   */
  legendCategories?: CategoryConfig[];
  legendEvents?: TimelineEvent[];
}

export function Header({
  title,
  onAddEvent,
  onImportEvents,
  events,
  categories,
  onCategoriesChange,
  onEventsChange,
  scale,
  onScaleChange,
  verticalScale,
  onVerticalScaleChange,
  groupByCategory,
  onGroupByCategoryChange,
  activePanel,
  onActivePanelChange,
  showAddEventModal,
  onAddEventClick,
  onCloseAddEventModal,
  onDeleteTimeline,
  mode = 'edit',
  onModeChange,
  intro = false,
  streaming = false,
  aiGenerated = false,
  legendCategories = categories,
  legendEvents = events,
}: HeaderProps) {
  // Which tab the events drawer opens on: the dock's Events button opens the
  // table, the legend's "Edit categories" opens the categories editor.
  const [eventsInitialView, setEventsInitialView] = useState<'events' | 'categories'>('events');
  const closePanel = () => onActivePanelChange(null);
  const togglePanel = (panel: 'events' | 'settings' | 'legend') => {
    onActivePanelChange(activePanel === panel ? null : panel);
  };
  const openEvents = () => {
    setEventsInitialView('events');
    togglePanel('events');
  };
  const openCategoriesEditor = () => {
    setEventsInitialView('categories');
    onActivePanelChange('events');
  };

  const handleAddEventSubmit = (event: Omit<TimelineEvent, 'id'>) => {
    onAddEvent(event);
    onCloseAddEventModal();
  };

  return (
    <>
      {/* Renders in both modes: the dock carries the Edit/Present switch, so
          unmounting it in view mode would leave no way back. It hides its own
          edit-only buttons instead. */}
      <FloatingToolbar
        onAddEventClick={onAddEventClick}
        onEventsClick={openEvents}
        onSettingsClick={() => togglePanel('settings')}
        activePanel={activePanel}
        mode={mode}
        onModeChange={onModeChange}
        intro={intro}
        streaming={streaming}
        aiGenerated={aiGenerated}
        legend={{
          categories: legendCategories,
          events: legendEvents,
          onCategoriesChange,
          groupByCategory,
          onGroupByCategoryChange,
          onEditCategories: openCategoriesEditor,
        }}
        // Radix reports closes (Escape, outside click) here; opening goes
        // through the same toggle as the other dock buttons.
        onLegendOpenChange={(open) => onActivePanelChange(open ? 'legend' : null)}
      />

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
        onImportEvents={onImportEvents}
        categories={categories}
        onCategoriesChange={onCategoriesChange}
        scale={scale}
        onScaleChange={onScaleChange}
        verticalScale={verticalScale}
        onVerticalScaleChange={onVerticalScaleChange}
        groupByCategory={groupByCategory}
        onGroupByCategoryChange={onGroupByCategoryChange}
        onDeleteTimeline={onDeleteTimeline}
      />

      <EventTableEditor
        isOpen={activePanel === 'events'}
        onClose={closePanel}
        events={events}
        onEventsChange={onEventsChange}
        categories={categories}
        onCategoriesChange={onCategoriesChange}
        mode={mode}
        initialView={eventsInitialView}
        aiGenerated={aiGenerated}
      />
    </>
  );
}
