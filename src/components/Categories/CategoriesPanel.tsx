import React from 'react';
import { CategoryConfig } from '../../types/event';
import { CategoryManager } from '../Settings/CategoryManager';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

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
  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[400px] min-w-[360px] p-0">
        <SheetDescription className="sr-only">Categories management panel</SheetDescription>
        <div className="h-full flex flex-col">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="text-xl font-semibold">Categories</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 scrollbar-hide">
            <CategoryManager
              categories={categories}
              onCategoriesChange={onCategoriesChange}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
