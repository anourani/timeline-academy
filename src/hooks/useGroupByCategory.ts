import { useState, useCallback } from 'react'

export function useGroupByCategory(initial = false) {
  const [groupByCategory, setGroupByCategory] = useState<boolean>(initial)

  const handleGroupByCategoryChange = useCallback((value: boolean) => {
    setGroupByCategory(value)
  }, [])

  return {
    groupByCategory,
    handleGroupByCategoryChange,
  }
}
