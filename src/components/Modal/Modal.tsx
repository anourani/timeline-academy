import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { lockScroll, unlockScroll } from '../../utils/scrollLock';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
  size?: 'default' | 'large';
}

export function Modal({ isOpen, onClose, children, title, size = 'default' }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      lockScroll();
      return () => unlockScroll();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    default: 'w-[550px] max-w-[90vw]',
    large: 'w-[960px] max-w-[95vw] min-h-[600px]'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`bg-gray-800 rounded-lg shadow-xl ${sizeClasses[size]}`}>
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        <div className="p-4 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}