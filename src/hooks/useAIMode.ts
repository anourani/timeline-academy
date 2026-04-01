import { useState, useRef, useCallback } from 'react';
import { classifySubject, generateTimeline } from '../services/aiTimeline';
import { TimelineEvent, CategoryConfig } from '../types/event';
import { PILL_DEFINITIONS } from '../constants/pillDefinitions';
import { DEFAULT_CATEGORIES } from '../constants/categories';
import type { SubjectType } from '../constants/pillDefinitions';

interface GenerateResult {
  title: string;
  description: string;
  events: TimelineEvent[];
  categories: CategoryConfig[];
}

export function useAIMode() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [classifiedType, setClassifiedType] = useState<SubjectType | null>(null);
  const [categoryLabels, setCategoryLabels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortedRef = useRef(false);

  const classifyAndGenerate = useCallback(async (subject: string): Promise<GenerateResult> => {
    abortedRef.current = false;
    setIsClassifying(true);
    setError(null);
    setClassifiedType(null);
    setCategoryLabels([]);

    let type: SubjectType;
    try {
      const result = await classifySubject(subject);
      if (abortedRef.current) throw new Error('Cancelled');
      type = result.type;
      setClassifiedType(type);

      const pills = PILL_DEFINITIONS[type];
      setCategoryLabels(pills.map((p) => p.label));
    } catch (err) {
      if (abortedRef.current) {
        setIsClassifying(false);
        throw new Error('Cancelled');
      }
      const msg = err instanceof Error ? err.message : 'Failed to classify subject';
      setError(msg);
      setIsClassifying(false);
      throw err;
    }

    setIsClassifying(false);
    setIsGenerating(true);

    try {
      const pills = PILL_DEFINITIONS[type];
      const result = await generateTimeline(subject, type, pills);
      if (abortedRef.current) throw new Error('Cancelled');

      const events: TimelineEvent[] = result.events.map((e) => ({
        id: crypto.randomUUID(),
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        category: e.category,
      }));

      const categories: CategoryConfig[] = DEFAULT_CATEGORIES.map((defaultCat, i) => {
        const pill = pills[i];
        const mappingLabel = result.categoryMapping?.[`category_${i + 1}`];
        return {
          ...defaultCat,
          label: mappingLabel || pill?.label || defaultCat.label,
        };
      });

      return {
        title: result.timelineTitle,
        description: result.timelineDescription,
        events,
        categories,
      };
    } catch (err) {
      if (abortedRef.current) {
        setIsGenerating(false);
        throw new Error('Cancelled');
      }
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const abort = useCallback(() => {
    abortedRef.current = true;
    setIsClassifying(false);
    setIsGenerating(false);
    setClassifiedType(null);
    setCategoryLabels([]);
    setError(null);
  }, []);

  const resetClassification = useCallback(() => {
    setClassifiedType(null);
    setCategoryLabels([]);
    setError(null);
  }, []);

  return {
    isGenerating,
    isClassifying,
    classifiedType,
    categoryLabels,
    error,
    classifyAndGenerate,
    abort,
    resetClassification,
  };
}
