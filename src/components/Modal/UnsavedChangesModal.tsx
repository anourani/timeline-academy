import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

export function UnsavedChangesModal({
  isOpen,
  onClose,
  onDiscard,
  onSave,
}: UnsavedChangesModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Unsaved Changes">
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-yellow-500">
          <AlertTriangle size={24} />
          <p className="text-lg font-medium">You have unsaved changes</p>
        </div>
        
        <p className="text-gray-300">
          Would you like to save your changes before switching timelines?
        </p>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onDiscard}
            className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
          >
            Discard Changes
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </Modal>
  );
}