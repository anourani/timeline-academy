import { TimelineEvent } from '../types/event';

export function generateSampleEvents(): Omit<TimelineEvent, 'id'>[] {
  const today = new Date();
  const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const twoYearsAgo = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate());

  return [
    {
      title: "Started College",
      startDate: twoYearsAgo.toISOString().split('T')[0],
      endDate: twoYearsAgo.toISOString().split('T')[0],
      category: "education"
    },
    {
      title: "First Internship",
      startDate: new Date(oneYearAgo.getFullYear(), 5, 1).toISOString().split('T')[0],
      endDate: new Date(oneYearAgo.getFullYear(), 7, 31).toISOString().split('T')[0],
      category: "career"
    },
    {
      title: "Moved to New City",
      startDate: new Date(oneYearAgo.getFullYear(), 8, 15).toISOString().split('T')[0],
      endDate: new Date(oneYearAgo.getFullYear(), 8, 15).toISOString().split('T')[0],
      category: "personal"
    },
    {
      title: "Started Remote Work",
      startDate: new Date(today.getFullYear(), 0, 15).toISOString().split('T')[0],
      endDate: today.toISOString().split('T')[0],
      category: "career"
    },
    {
      title: "New Apartment",
      startDate: new Date(today.getFullYear(), 2, 1).toISOString().split('T')[0],
      endDate: new Date(today.getFullYear(), 2, 1).toISOString().split('T')[0],
      category: "home"
    }
  ];
}