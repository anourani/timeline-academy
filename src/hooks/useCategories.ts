import { useState, useCallback } from 'react';
import { CategoryConfig } from '../types/event';
import { DEFAULT_CATEGORIES } from '../constants/categories';

/**
 * A saved set with every category hidden would draw an empty canvas with no
 * way back from the legend, which refuses to hide the last one. Show them all.
 */
export function ensureSomeVisible(categories: CategoryConfig[]): CategoryConfig[] {
  if (categories.length === 0 || categories.some(c => c.visible)) return categories;
  return categories.map(c => ({ ...c, visible: true }));
}

export function useCategories() {
  const [categories, setCategories] = useState<CategoryConfig[]>(DEFAULT_CATEGORIES);

  const updateCategories = useCallback((newCategories: CategoryConfig[] | undefined) => {
    // If newCategories is undefined or empty, reset to defaults
    if (!newCategories?.length) {
      setCategories(DEFAULT_CATEGORIES);
      return;
    }
    setCategories(ensureSomeVisible(newCategories));
  }, []);

  const resetCategories = useCallback(() => {
    setCategories(DEFAULT_CATEGORIES);
  }, []);

  return { categories, updateCategories, resetCategories };
}