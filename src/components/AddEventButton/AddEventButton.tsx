import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '../Modal/Modal';
import { EventForm } from '../EventForm/EventForm';
import { TimelineEvent, CategoryConfig } from '../../types/event';

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
      <button
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
      >
        <Plus size={20} />
        Add Event
      </button>
      
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Event"
      >
        <EventForm onSubmit={handleSubmit} categories={categories} />
      </Modal>
    </>
  );
}