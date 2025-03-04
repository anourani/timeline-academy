import React, { useState, useMemo } from 'react';
import { Modal } from '../Modal/Modal';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import { Trash2, Plus } from 'lucide-react';

interface DraftEvent extends Omit<TimelineEvent, 'id'> {
  id: string;
}

interface EventTableEditorProps {
  isOpen: boolean;
  onClose: () => void;
  events: TimelineEvent[];
  onEventsChange: (events: TimelineEvent[]) => void;
  categories: CategoryConfig[];
}

export function EventTableEditor({
  isOpen,
  onClose,
  events,
  onEventsChange,
  categories,
}: EventTableEditorProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [emptyRows, setEmptyRows] = useState<DraftEvent[]>([]);
  const [draftEvents, setDraftEvents] = useState<TimelineEvent[]>(events);
  const [hasChanges, setHasChanges] = useState(false);
  const MAX_EMPTY_ROWS = 10;

  // Reset state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setDraftEvents(events);
      setEmptyRows([]);
      setHasChanges(false);
    }
  }, [isOpen, events]);

  const displayEvents = useMemo(() => {
    const filteredEvents = activeCategory
      ? draftEvents.filter(event => event.category === activeCategory)
      : draftEvents;

    return [...filteredEvents, ...emptyRows];
  }, [draftEvents, activeCategory, emptyRows]);

  const isValidEvent = (event: DraftEvent | TimelineEvent) => {
    return Boolean(
      event.title.trim() && 
      event.startDate && 
      event.category
    );
  };

  const canApplyChanges = useMemo(() => {
    if (!hasChanges) return false;

    const allEventsValid = draftEvents.every(isValidEvent);
    const allEmptyRowsValid = emptyRows.every(row => {
      const hasAnyField = Boolean(
        row.title.trim() || 
        row.startDate || 
        row.category
      );

      return hasAnyField ? isValidEvent(row) : true;
    });

    return allEventsValid && allEmptyRowsValid;
  }, [draftEvents, emptyRows, hasChanges]);

  const handleDeleteEvent = (eventId: string) => {
    setDraftEvents(draftEvents.filter(event => event.id !== eventId));
    setHasChanges(true);
  };

  const handleEventChange = (id: string, changes: Partial<TimelineEvent>) => {
    // Check if this is an empty row
    const emptyRowIndex = emptyRows.findIndex(row => row.id === id);
    
    if (emptyRowIndex !== -1) {
      // Update empty row
      const updatedEmptyRows = [...emptyRows];
      updatedEmptyRows[emptyRowIndex] = {
        ...updatedEmptyRows[emptyRowIndex],
        ...changes
      };
      setEmptyRows(updatedEmptyRows);

      // Check if the row is now valid and should be converted to a real event
      const updatedRow = updatedEmptyRows[emptyRowIndex];
      if (isValidEvent(updatedRow)) {
        const newEvent: TimelineEvent = {
          id: crypto.randomUUID(),
          title: updatedRow.title,
          startDate: updatedRow.startDate,
          endDate: updatedRow.endDate || updatedRow.startDate,
          category: updatedRow.category,
        };
        setDraftEvents(prev => [...prev, newEvent]);
        setEmptyRows(rows => rows.filter(row => row.id !== id));
      }
    } else {
      // Update existing event
      setDraftEvents(draftEvents.map(evt => 
        evt.id === id ? { ...evt, ...changes } : evt
      ));
    }
    setHasChanges(true);
  };

  const handleAddRow = () => {
    if (emptyRows.length < MAX_EMPTY_ROWS) {
      const newEmptyRow: DraftEvent = {
        id: crypto.randomUUID(),
        title: '',
        startDate: '',
        endDate: '',
        category: ''
      };
      setEmptyRows(rows => [...rows, newEmptyRow]);
    }
  };

  const handleDeleteEmptyRow = (rowId: string) => {
    setEmptyRows(rows => rows.filter(row => row.id !== rowId));
  };

  const handleApplyChanges = () => {
    if (!canApplyChanges) return;
    onEventsChange(draftEvents);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Timeline" size="large">
      <div className="flex flex-col h-[calc(100vh-200px)]">
        {/* Category Filter Segmented Button */}
        <div className="flex bg-gray-700 rounded-lg p-1 mb-6">
          <button
            onClick={() => setActiveCategory(null)}
            className={`flex-1 px-4 py-2 text-sm rounded-md transition-all duration-200 ${
              activeCategory === null
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-300 hover:text-white'
            }`}
          >
            All
          </button>
          {categories.map(category => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`flex-1 px-4 py-2 text-sm rounded-md transition-all duration-200 ${
                activeCategory === category.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-300 hover:text-white'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col min-h-0 border border-gray-700/50 rounded-lg">
          <div className="rounded-t-lg bg-gray-800">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="pb-3 pt-2 px-3 font-medium text-gray-300" style={{ width: 'calc(100% - 540px)' }}>
                    Title <span className="text-red-500">*</span>
                  </th>
                  <th className="pb-3 pt-2 px-3 font-medium text-gray-300" style={{ width: '180px' }}>
                    Start Date <span className="text-red-500">*</span>
                  </th>
                  <th className="pb-3 pt-2 px-3 font-medium text-gray-300" style={{ width: '180px' }}>
                    End Date
                  </th>
                  <th className="pb-3 pt-2 px-3 font-medium text-gray-300" style={{ width: '180px' }}>
                    Category <span className="text-red-500">*</span>
                  </th>
                  <th className="pb-3 pt-2 px-3 font-medium text-gray-300 w-[48px]"></th>
                </tr>
              </thead>
            </table>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 bg-gray-800/50">
            <table className="w-full text-left">
              <tbody className="text-gray-300">
                {displayEvents.map((event) => (
                  <tr key={event.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-2 px-3" style={{ width: 'calc(100% - 540px)' }}>
                      <input
                        type="text"
                        value={event.title}
                        onChange={(e) => handleEventChange(event.id, { title: e.target.value })}
                        className="w-full bg-transparent hover:bg-gray-600/50 px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Event title"
                        autoComplete="off"
                      />
                    </td>
                    <td className="py-2 px-3" style={{ width: '180px' }}>
                      <input
                        type="date"
                        value={event.startDate}
                        onChange={(e) => {
                          const newDate = e.target.value;
                          handleEventChange(event.id, { 
                            startDate: newDate,
                            // If end date is before new start date, update it
                            endDate: event.endDate && event.endDate < newDate ? newDate : event.endDate
                          });
                        }}
                        className="w-full bg-transparent hover:bg-gray-600/50 px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-300 [color-scheme:dark]"
                      />
                    </td>
                    <td className="py-2 px-3" style={{ width: '180px' }}>
                      <input
                        type="date"
                        value={event.endDate}
                        onChange={(e) => handleEventChange(event.id, { endDate: e.target.value })}
                        min={event.startDate}
                        className="w-full bg-transparent hover:bg-gray-600/50 px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-300 [color-scheme:dark]"
                      />
                    </td>
                    <td className="py-2 px-3" style={{ width: '180px' }}>
                      <select
                        value={event.category}
                        onChange={(e) => handleEventChange(event.id, { category: e.target.value })}
                        className="w-full bg-transparent hover:bg-gray-600/50 px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="" disabled>Select a category</option>
                        {categories.map(category => (
                          <option key={category.id} value={category.id}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 w-[48px]">
                      <button
                        onClick={() => emptyRows.find(row => row.id === event.id)
                          ? handleDeleteEmptyRow(event.id) 
                          : handleDeleteEvent(event.id)
                        }
                        className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 pb-2 flex justify-between items-center">
          <button
            onClick={handleAddRow}
            disabled={emptyRows.length >= MAX_EMPTY_ROWS}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
              emptyRows.length >= MAX_EMPTY_ROWS
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Plus size={20} />
            Add Row
          </button>

          <button
            onClick={handleApplyChanges}
            disabled={!canApplyChanges}
            className={`px-4 py-2 rounded-md transition-colors ${
              canApplyChanges
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            Apply Changes
          </button>
        </div>
      </div>
    </Modal>
  );
}