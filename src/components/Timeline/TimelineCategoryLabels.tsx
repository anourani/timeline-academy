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
    <div className="relative h-full">
      {categories.map((categoryData) => {
        const category = customCategories.find(c => c.id === categoryData.id);
        if (!category) return null;

        return (
          <div
            key={`category-${categoryData.id}`}
            className="flex items-start pt-2 pl-6"
            style={{ height: `${categoryData.height}px` }}
          >
            <div
              className="rounded-[4px] p-2 backdrop-blur-[2px] leading-none"
              style={{
                backgroundColor: `${category.color}4D`,
              }}
            >
              <span className="label-small-allcaps whitespace-nowrap">
                {category.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
