import React, { useState, useCallback, useEffect } from 'react';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

  useEffect(() => {
    if (initialEvent) {
      setTitle(initialEvent.title);
      setStartDate(initialEvent.startDate);
      setEndDate(initialEvent.endDate);
      setCategory(initialEvent.category);
    }
  }, [initialEvent]);

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
    <form onSubmit={handleSubmit} className="rounded-lg">
      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="title">
              Event Title <span className="text-muted-foreground">({title.length}/{MAX_TITLE_LENGTH})</span>
            </Label>
            <Input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_TITLE_LENGTH}
              required
              className="h-10 [color-scheme:dark]"
              autoFocus
            />
          </div>

          <div className="flex-1 space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="startDate">Start Date</Label>
            <Input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="h-10 [color-scheme:dark]"
            />
          </div>

          <div className="flex-1 space-y-2">
            <Label htmlFor="endDate">
              End Date <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              onFocus={() => setIsEndDateFocused(true)}
              onBlur={() => setIsEndDateFocused(false)}
              min={startDate}
              className="h-10 [color-scheme:dark]"
            />
          </div>
        </div>

        <Button type="submit" className="h-10">
          {initialEvent ? 'Update Event' : 'Add Event'}
        </Button>
      </div>
    </form>
  );
}
