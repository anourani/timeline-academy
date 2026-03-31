import { useState } from 'react';
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

  const classify = async (subject: string): Promise<SubjectType> => {
    setIsClassifying(true);
    setError(null);

    try {
      const result = await classifySubject(subject);
      const type = result.type;
      setClassifiedType(type);

      const pills = PILL_DEFINITIONS[type];
      setCategoryLabels(pills.map((p) => p.label));

      return type;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to classify subject';
      setError(msg);
      throw err;
    } finally {
      setIsClassifying(false);
    }
  };

  const generate = async (subject: string, subjectType: SubjectType): Promise<GenerateResult> => {
    setIsGenerating(true);
    setError(null);

    try {
      const pills = PILL_DEFINITIONS[subjectType];
      const result = await generateTimeline(subject, subjectType, pills);

      const events: TimelineEvent[] = result.events.map((e) => ({
        id: crypto.randomUUID(),
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        category: e.category,
      }));

      // Build category configs using the categoryMapping from the LLM response
      // or fall back to pill definitions
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
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  };

  const resetClassification = () => {
    setClassifiedType(null);
    setCategoryLabels([]);
    setError(null);
  };

  return {
    isGenerating,
    isClassifying,
    classifiedType,
    categoryLabels,
    error,
    classify,
    generate,
    resetClassification,
  };
}
