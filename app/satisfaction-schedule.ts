import { gratitudeDay, validGratitudeDay } from './gratitude';

// One shared calendar schedule across browsers; the first check-in is Sunday 25 October 2026.
export const satisfactionAnchorDay = '2026-10-25';
const intervalDays = 14;
const dayMillis = 86400000;

export function satisfactionSchedule(day = gratitudeDay()) {
  if (!validGratitudeDay(day)) throw new Error('Invalid check-in day');
  const delta = Math.round((Date.parse(day) - Date.parse(satisfactionAnchorDay)) / dayMillis);
  const isOpen = delta >= 0 && delta % intervalDays === 0;
  const untilNext = delta < 0 ? -delta : isOpen ? intervalDays : intervalDays - delta % intervalDays;
  return { isOpen, nextDay: new Date(Date.parse(day) + untilNext * dayMillis).toISOString().slice(0, 10) };
}

export function satisfactionDateLabel(day: string) {
  return new Intl.DateTimeFormat('sk-SK', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(day + 'T12:00:00Z'));
}
