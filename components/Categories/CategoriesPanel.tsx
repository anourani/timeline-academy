import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { CategoryConfig } from '../../types/event';
import { CategoryManager } from '../Settings/CategoryManager';
import { lockScroll, unlockScroll } from '../../utils/scrollLock';

interface CategoriesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryConfig[];
  onCategoriesChange: (categories: CategoryConfig[]) => void;
}

export function CategoriesPanel({
  isOpen,
  onClose,
  categories,
  onCategoriesChange
}: CategoriesPanelProps) {
  // Lock/unlock scroll when panel opens/closes
  useEffect(() => {
    if (isOpen) {
      lockScroll();
      return () => unlockScroll();
    }
  }, [isOpen]);

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-250 ease-in-out ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      <div 
        className={`fixed right-0 top-0 h-full w-[400px] min-w-[360px] bg-gray-800 z-50 shadow-xl transform transition-transform duration-250 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Categories</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-gray-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 max-h-[calc(100vh-5rem)] overflow-y-auto scrollbar-hide">
          <CategoryManager 
            categories={categories}
            onCategoriesChange={onCategoriesChange}
          />
        </div>
      </div>
    </>
  );
}