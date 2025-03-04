import React from 'react';
import { CategoryConfig } from '../../types/event';

interface CategoryData {
  id: string;
  height: number;
}

interface TimelineCategoryLabelsProps {
  categories: CategoryData[];
  customCategories: CategoryConfig[];
}

export function TimelineCategoryLabels({ categories, customCategories }: TimelineCategoryLabelsProps) {
  return (
    <div className="relative h-full ml-3">
      {categories.map((categoryData) => {
        const category = customCategories.find(c => c.id === categoryData.id);
        if (!category) return null;
        
        return (
          <div
            key={`category-${categoryData.id}`}
            className="relative"
            style={{ height: `${categoryData.height}px` }}
          >
            <div
              className="px-1.5 pt-2 rounded-md mr-2 border-2 border-black"
              style={{
                height: `${categoryData.height}px`,
                backgroundColor: `${category.color}47`,
              }}
            >
              <span 
                className="text-sm font-medium uppercase break-words"
                style={{ 
                  color: '#fbfbfb',
                  lineHeight: '100%'
                }}
              >
                {category.label}
              </span>
            </div>
            <div 
              className="absolute top-0 right-0 w-1 h-full"
              style={{ backgroundColor: category.color }}
            />
          </div>
        );
      })}
    </div>
  );
}