import React from 'react'
import { Month, TimelineScale } from '../../types/timeline'

interface TimelineGridFillerProps {
  months: Month[]
  scale: TimelineScale
}

export function TimelineGridFiller({ months, scale }: TimelineGridFillerProps) {
  return (
    <div
      className="pointer-events-none grid flex-1 transition-all duration-200 ease-in-out"
      style={{
        gridTemplateColumns: `repeat(${months.length}, ${scale.monthWidth}px)`,
      }}
    >
      {months.map((month) => (
        <div
          key={`filler-${month.year}-${month.month}`}
          className="border-r border-gray-700 h-full"
        />
      ))}
    </div>
  )
}
