import { useState, useCallback } from 'react';
import { CategoryConfig } from '../types/event';
import { DEFAULT_CATEGORIES } from '../constants/categories';

export function useCategories() {
  const [categories, setCategories] = useState<CategoryConfig[]>(DEFAULT_CATEGORIES);

  const updateCategories = useCallback((newCategories: CategoryConfig[] | undefined) => {
    // If newCategories is undefined or empty, reset to defaults
    if (!newCategories?.length) {
      setCategories(DEFAULT_CATEGORIES);
      return;
    }
    setCategories(newCategories);
  }, []);

  const resetCategories = useCallback(() => {
    setCategories(DEFAULT_CATEGORIES);
  }, []);

  return { categories, updateCategories, resetCategories };
}