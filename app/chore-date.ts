const shortDate = new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric' });

export function shortChoreDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  const parts = shortDate.formatToParts(date);
  return `${parts.find((part) => part.type === 'day')!.value}.${parts.find((part) => part.type === 'month')!.value}.`;
}
