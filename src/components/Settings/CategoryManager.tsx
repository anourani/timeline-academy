import React, { useState, useCallback, useEffect } from 'react';
import { GripVertical, Eye, EyeOff, Trash2, Plus } from 'lucide-react';
import { CategoryConfig } from '../../types/event';
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
        <div role="alert" className="text-sm text-destructive bg-destructive/10 border border-destructive/50 rounded p-2">
          {error}
        </div>
      )}
      <div className="space-y-3">
        {categories.map((category, index) => (
          <div
            key={`category-${category.id}`}
            className={`relative rounded-lg border border-border/60 bg-card overflow-hidden ${
              draggedIndex === index ? 'opacity-50' : ''
            }`}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleDrop(e, index)}
          >
            {dragOverIndex === index && (
              <div className="absolute inset-0 border-2 border-primary rounded-lg pointer-events-none" />
            )}
            <div className="grid grid-cols-[40px_1fr]">
              {/* Left Column - Grip Handle */}
              <div
                className="flex items-center justify-center border-r border-border/40 cursor-move"
                aria-label={`Drag to reorder ${category.label}`}
                role="button"
                tabIndex={0}
              >
                <GripVertical size={18} className="text-muted-foreground/80" />
              </div>

              {/* Right Column - Category Controls */}
              <div className="p-3 space-y-3">
                {/* Name Input */}
                <div>
                  <Label htmlFor={`category-name-${category.id}`} className="sr-only">
                    Category name
                  </Label>
                  <Input
                    type="text"
                    id={`category-name-${category.id}`}
                    value={editingValues[category.id] || ''}
                    onChange={(e) => handleNameChange(index, e.target.value)}
                    onBlur={() => handleNameBlur(index)}
                    placeholder="Category Name"
                    className="border-border/60 bg-background"
                    aria-label={`Name for category ${index + 1}`}
                  />
                </div>

                {/* Color Selector */}
                <div>
                  <Label htmlFor={`category-color-${category.id}`} className="sr-only">
                    Category color
                  </Label>
                  <Select
                    value={category.color}
                    onValueChange={(value) => handleColorChange(index, value)}
                  >
                    <SelectTrigger
                      id={`category-color-${category.id}`}
                      className="border-border/60 bg-background"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0 ring-1 ring-white/20"
                          style={{ backgroundColor: category.color }}
                        />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_COLORS.map(color => (
                        <SelectItem key={color.value} value={color.value}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full ring-1 ring-white/20"
                              style={{ backgroundColor: color.value }}
                            />
                            {color.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleVisibilityToggle(index)}
                    disabled={categories.length <= 1}
                    className="flex-1 gap-1.5 border-border/60"
                    aria-label={category.visible ? `Hide ${category.label}` : `Show ${category.label}`}
                  >
                    {category.visible ? (
                      <>
                        <EyeOff size={14} />
                        Hide
                      </>
                    ) : (
                      <>
                        <Eye size={14} />
                        Show
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(index)}
                    disabled={categories.length <= 1}
                    className="flex-1 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Delete ${category.label}`}
                  >
                    <Trash2 size={14} />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {categories.length < 4 && (
        <Button
          variant="outline"
          onClick={handleAdd}
          className="w-full gap-2 border-dashed border-border/60 hover:border-foreground/40"
        >
          <Plus size={16} />
          Add Category
        </Button>
      )}
    </div>
  );
}
