import React, { useState, useCallback, useEffect } from 'react';
import { GripVertical, Eye, EyeOff, Trash2 } from 'lucide-react';
import { CategoryConfig } from '../../types/event';

const CATEGORY_COLORS = [
  { label: 'Purple', value: '#A770EC' },
  { label: 'Orange', value: '#FF7D05' },
  { label: 'Green', value: '#259E23' },
  { label: 'Blue', value: '#4196E4' }
];

interface CategoryManagerProps {
  categories: CategoryConfig[];
  onCategoriesChange: (categories: CategoryConfig[]) => void;
}

export function CategoryManager({ categories, onCategoriesChange }: CategoryManagerProps) {
  const [error, setError] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<{ [key: string]: string }>(
    categories.reduce((acc, cat) => ({ ...acc, [cat.id]: cat.label }), {})
  );
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Update editing values when categories change
  useEffect(() => {
    setEditingValues(
      categories.reduce((acc, cat) => ({ ...acc, [cat.id]: cat.label }), {})
    );
  }, [categories]);

  const handleNameChange = useCallback((index: number, newValue: string) => {
    const category = categories[index];
    setEditingValues(prev => ({ ...prev, [category.id]: newValue }));
  }, [categories]);

  const handleNameBlur = useCallback((index: number) => {
    setError(null);
    const category = categories[index];
    const normalizedNewName = editingValues[category.id].trim();
    
    if (!normalizedNewName) {
      setError('Category name cannot be empty');
      setEditingValues(prev => ({ ...prev, [category.id]: category.label }));
      return;
    }
    
    const isDuplicate = categories.some(
      (cat, i) => i !== index && cat.label.toLowerCase() === normalizedNewName.toLowerCase()
    );

    if (isDuplicate) {
      setError(`Category "${normalizedNewName}" already exists`);
      setEditingValues(prev => ({ ...prev, [category.id]: category.label }));
      return;
    }

    const newCategories = [...categories];
    newCategories[index] = { 
      ...newCategories[index], 
      label: normalizedNewName
    };
    onCategoriesChange(newCategories);
  }, [categories, editingValues, onCategoriesChange]);

  const handleColorChange = useCallback((index: number, newColor: string) => {
    const newCategories = [...categories];
    newCategories[index] = {
      ...newCategories[index],
      color: newColor
    };
    onCategoriesChange(newCategories);
  }, [categories, onCategoriesChange]);

  const handleVisibilityToggle = useCallback((index: number) => {
    const newCategories = [...categories];
    newCategories[index] = {
      ...newCategories[index],
      visible: !newCategories[index].visible
    };
    onCategoriesChange(newCategories);
  }, [categories, onCategoriesChange]);

  const handleDelete = useCallback((index: number) => {
    if (categories.length <= 1) {
      setError('Cannot delete the last category');
      return;
    }
    const newCategories = categories.filter((_, i) => i !== index);
    onCategoriesChange(newCategories);
    setError(null);
  }, [categories, onCategoriesChange]);

  const handleAdd = useCallback(() => {
    setError(null);
    if (categories.length >= 4) {
      setError('Maximum of 4 categories allowed');
      return;
    }
    
    const defaultName = 'New Category';
    let uniqueName = defaultName;
    let counter = 1;
    
    while (categories.some(cat => cat.label.toLowerCase() === uniqueName.toLowerCase())) {
      uniqueName = `${defaultName} ${counter}`;
      counter++;
    }

    const newCategory = {
      id: uniqueName.toLowerCase().replace(/\s+/g, '_'),
      label: uniqueName,
      color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length].value,
      visible: true
    };
    
    const newCategories = [...categories, newCategory];
    onCategoriesChange(newCategories);
    setEditingValues(prev => ({ ...prev, [newCategory.id]: newCategory.label }));
  }, [categories, onCategoriesChange]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const newCategories = [...categories];
    const [draggedCategory] = newCategories.splice(draggedIndex, 1);
    newCategories.splice(targetIndex, 0, draggedCategory);
    onCategoriesChange(newCategories);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-sm text-red-400 bg-red-900/30 border border-red-500/50 rounded p-2">
          {error}
        </div>
      )}
      <div className="space-y-2">
        {categories.map((category, index) => (
          <div
            key={`category-${category.id}`}
            className={`relative bg-gray-700 rounded-lg overflow-hidden ${
              draggedIndex === index ? 'opacity-50' : ''
            }`}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleDrop(e, index)}
          >
            {dragOverIndex === index && (
              <div className="absolute inset-0 border-2 border-blue-500 rounded-lg pointer-events-none" />
            )}
            <div className="grid grid-cols-[48px_1fr]">
              {/* Left Column - Grip Handle */}
              <div className="flex items-center justify-center bg-gray-800/50">
                <div className="cursor-move p-2 rounded hover:bg-gray-600/50 transition-colors">
                  <GripVertical size={20} className="text-gray-400" />
                </div>
              </div>

              {/* Right Column - Category Controls */}
              <div className="p-4 space-y-3">
                {/* Name Input */}
                <input
                  type="text"
                  value={editingValues[category.id] || ''}
                  onChange={(e) => handleNameChange(index, e.target.value)}
                  onBlur={() => handleNameBlur(index)}
                  className="w-full bg-gray-600 px-3 py-2 rounded-lg text-white border border-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  placeholder="Category Name"
                />

                {/* Color Selector */}
                <div className="flex items-center gap-2">
                  <select
                    value={category.color}
                    onChange={(e) => handleColorChange(index, e.target.value)}
                    className="w-full bg-gray-600 px-3 py-2 rounded-lg text-white border border-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                  >
                    {CATEGORY_COLORS.map(color => (
                      <option key={color.value} value={color.value}>
                        {color.label}
                      </option>
                    ))}
                  </select>
                  <div 
                    className="w-6 h-6 rounded-full flex-shrink-0"
                    style={{ backgroundColor: category.color }}
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVisibilityToggle(index)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-md transition-colors"
                    disabled={categories.length <= 1}
                  >
                    {category.visible ? (
                      <>
                        <EyeOff size={16} />
                        Hide
                      </>
                    ) : (
                      <>
                        <Eye size={16} />
                        Show
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(index)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-950/50 text-red-400 hover:bg-red-900/50 rounded-md transition-colors"
                    disabled={categories.length <= 1}
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {categories.length < 4 && (
        <button
          onClick={handleAdd}
          className="w-full py-2 px-4 border border-dashed border-gray-600 rounded-md text-gray-400 hover:text-white hover:border-gray-500 hover:bg-gray-700"
        >
          Add Category
        </button>
      )}
    </div>
  );
}