import { useState } from 'react';
import { Plus } from 'lucide-react';
import { EventForm } from '../EventForm/EventForm';
import { TimelineEvent, CategoryConfig } from '../../types/event';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AddEventButtonProps {
  onAddEvent: (event: Omit<TimelineEvent, 'id'>) => void;
  categories: CategoryConfig[];
}

export function AddEventButton({ onAddEvent, categories }: AddEventButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSubmit = (event: Omit<TimelineEvent, 'id'>) => {
    onAddEvent(event);
    setIsModalOpen(false);
  };

  return (
    <>
      <Button
        onClick={() => setIsModalOpen(true)}
        className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
      >
        <Plus size={20} />
        Add Event
      </Button>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-gray-800 border-gray-700 max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-white">
              Add New Event
            </DialogTitle>
          </DialogHeader>
          <EventForm onSubmit={handleSubmit} categories={categories} />
        </DialogContent>
      </Dialog>
    </>
  );
}
