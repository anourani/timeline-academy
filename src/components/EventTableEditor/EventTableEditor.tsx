import React, { useState, useMemo } from 'react';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import { Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface EventTableEditorProps {
  isOpen: boolean;
  onClose: () => void;
  events: TimelineEvent[];
  onEventsChange: (events: TimelineEvent[]) => void;
  categories: CategoryConfig[];
}

interface DraftEvent extends Omit<TimelineEvent, 'id'> {
  id: string;
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-gray-800 border-gray-700 max-w-[960px] max-h-[95vh]">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-white">
            Edit Timeline
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col h-[calc(100vh-200px)]">
          <div className="flex gap-2 mb-6">
            <Button
              variant={activeCategory === null ? "default" : "secondary"}
              onClick={() => setActiveCategory(null)}
              className={activeCategory === null
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }
            >
              All
            </Button>
            {categories.map(cat => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? "default" : "secondary"}
                onClick={() => setActiveCategory(cat.id)}
                className={activeCategory === cat.id
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }
              >
                {cat.label}
              </Button>
            ))}
          </div>

          <div className="flex-1 flex flex-col min-h-0 border border-gray-700/50 rounded-lg">
            <div className="rounded-t-lg bg-gray-800">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-gray-700 hover:bg-transparent">
                    <TableHead className="pb-3 pt-2 px-3 font-medium text-gray-300" style={{ width: 'calc(100% - 540px)' }}>
                      Title <span className="text-red-500">*</span>
                    </TableHead>
                    <TableHead className="pb-3 pt-2 px-3 font-medium text-gray-300" style={{ width: '180px' }}>
                      Start Date <span className="text-red-500">*</span>
                    </TableHead>
                    <TableHead className="pb-3 pt-2 px-3 font-medium text-gray-300" style={{ width: '180px' }}>
                      End Date
                    </TableHead>
                    <TableHead className="pb-3 pt-2 px-3 font-medium text-gray-300" style={{ width: '180px' }}>
                      Category <span className="text-red-500">*</span>
                    </TableHead>
                    <TableHead className="pb-3 pt-2 px-3 font-medium text-gray-300 w-[48px]"></TableHead>
                  </TableRow>
                </TableHeader>
              </Table>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 bg-gray-800/50">
              <Table>
                <TableBody className="text-gray-300">
                  {displayEvents.map((event) => (
                    <TableRow key={event.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <TableCell className="py-2 px-3" style={{ width: 'calc(100% - 540px)' }}>
                        <Input
                          type="text"
                          value={event.title}
                          onChange={(e) => handleEventChange(event.id, { title: e.target.value })}
                          className="bg-transparent border-0 shadow-none hover:bg-gray-600/50 px-2 py-1 h-auto focus-visible:ring-1 focus-visible:ring-blue-500"
                          placeholder="Event title"
                          autoComplete="off"
                        />
                      </TableCell>
                      <TableCell className="py-2 px-3" style={{ width: '180px' }}>
                        <Input
                          type="date"
                          value={event.startDate}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            handleEventChange(event.id, {
                              startDate: newDate,
                              endDate: event.endDate && event.endDate < newDate ? newDate : event.endDate
                            });
                          }}
                          className="bg-transparent border-0 shadow-none hover:bg-gray-600/50 px-2 py-1 h-auto text-gray-300 [color-scheme:dark] focus-visible:ring-1 focus-visible:ring-blue-500"
                        />
                      </TableCell>
                      <TableCell className="py-2 px-3" style={{ width: '180px' }}>
                        <Input
                          type="date"
                          value={event.endDate}
                          onChange={(e) => handleEventChange(event.id, { endDate: e.target.value })}
                          min={event.startDate}
                          className="bg-transparent border-0 shadow-none hover:bg-gray-600/50 px-2 py-1 h-auto text-gray-300 [color-scheme:dark] focus-visible:ring-1 focus-visible:ring-blue-500"
                        />
                      </TableCell>
                      <TableCell className="py-2 px-3" style={{ width: '180px' }}>
                        <select
                          value={event.category}
                          onChange={(e) => handleEventChange(event.id, { category: e.target.value })}
                          className="w-full bg-transparent hover:bg-gray-600/50 px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="" disabled>Select a category</option>
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>
                              {cat.label}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="py-2 px-3 w-[48px]">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => emptyRows.find(row => row.id === event.id)
                            ? handleDeleteEmptyRow(event.id)
                            : handleDeleteEvent(event.id)
                          }
                          className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-600"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-4 pb-2 flex justify-between items-center">
            <Button
              onClick={handleAddRow}
              disabled={emptyRows.length >= MAX_EMPTY_ROWS}
              className="gap-2 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500"
            >
              <Plus size={20} />
              Add Row
            </Button>

            <Button
              onClick={handleApplyChanges}
              disabled={!canApplyChanges}
              className="bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500"
            >
              Apply Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
