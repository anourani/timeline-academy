import React, { useState, useCallback, useEffect } from 'react';
import { TimelineEvent, CategoryConfig } from '../../types/event';

const MAX_TITLE_LENGTH = 55;

interface EventFormProps {
  onSubmit: (event: Omit<TimelineEvent, 'id'>) => void;
  categories: CategoryConfig[];
  onImport?: (events: Array<Omit<TimelineEvent, 'id'>>, categories: CategoryConfig[]) => void;
  initialStartDate?: string | null;
  initialEvent?: TimelineEvent | null;
}

export function EventForm({ 
  onSubmit, 
  categories, 
  onImport, 
  initialStartDate,
  initialEvent 
}: EventFormProps) {
  const [title, setTitle] = useState(initialEvent?.title || '');
  const [startDate, setStartDate] = useState(initialEvent?.startDate || initialStartDate || '');
  const [endDate, setEndDate] = useState(initialEvent?.endDate || '');
  const [category, setCategory] = useState(initialEvent?.category || categories[0]?.id || '');
  const [isEndDateFocused, setIsEndDateFocused] = useState(false);

  // Update form when initialEvent changes
  useEffect(() => {
    if (initialEvent) {
      setTitle(initialEvent.title);
      setStartDate(initialEvent.startDate);
      setEndDate(initialEvent.endDate);
      setCategory(initialEvent.category);
    }
  }, [initialEvent]);

  // Set end date to start date when end date field is focused and empty
  useEffect(() => {
    if (isEndDateFocused && !endDate && startDate) {
      setEndDate(startDate);
    }
  }, [isEndDateFocused, endDate, startDate]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!category) {
      alert('Please select a category');
      return;
    }

    if (title.length > MAX_TITLE_LENGTH) {
      alert(`Title must be ${MAX_TITLE_LENGTH} characters or less`);
      return;
    }
    
    onSubmit({ 
      title, 
      startDate, 
      endDate: endDate || startDate,
      category 
    });
    
    setTitle('');
    setStartDate('');
    setEndDate('');
    setCategory(categories[0]?.id || '');
  }, [title, startDate, endDate, category, categories, onSubmit]);

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 p-3 rounded-lg mb-8">
      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="title" className="block text-sm font-medium text-gray-200 mb-1">
              Event Title <span className="text-gray-400">({title.length}/{MAX_TITLE_LENGTH})</span>
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_TITLE_LENGTH}
              required
              className="w-full h-10 rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div className="flex-1">
            <label htmlFor="category" className="block text-sm font-medium text-gray-200 mb-1">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
              className="w-full h-10 rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-200 mb-1">
              Start Date
            </label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full h-10 rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="flex-1">
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-200 mb-1">
              End Date <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              onFocus={() => setIsEndDateFocused(true)}
              onBlur={() => setIsEndDateFocused(false)}
              min={startDate}
              className="w-full h-10 rounded-md bg-gray-700 border-gray-600 text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          type="submit"
          className="h-10 bg-blue-600 text-white px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
        >
          {initialEvent ? 'Update Event' : 'Add Event'}
        </button>
      </div>
    </form>
  );
}