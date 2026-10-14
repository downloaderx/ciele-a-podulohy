'use client';
import { useEffect, useState } from 'react';
import { getDaysUntil, getNextDueDate, recurringCategoryIds, normalizeGoalCategory, type Goal } from './page-model';

export function useReminders(goals: Goal[], personId: string, authenticated: boolean) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!authenticated) return;
    const timer = window.setTimeout(() => {
      try { setEnabled(window.localStorage.getItem(`acorns-reminders-${personId}`) === 'on'); } catch { /* Preference can remain session-only. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authenticated, personId]);
  useEffect(() => {
    if (!enabled || !authenticated || !('Notification' in window) || Notification.permission !== 'granted') return;
    const notify = () => {
      const today = new Date().toLocaleDateString('sk-SK');
      for (const goal of goals) {
        const date = recurringCategoryIds.includes(normalizeGoalCategory(goal.category)) ? getNextDueDate(goal) : goal.dueAt ? new Date(goal.dueAt) : null;
        if (!date || goal.deletedAt || goal.done || getDaysUntil(date) > 0) continue;
        const key = `acorns-notified-${personId}-${goal.id}`;
        try {
          if (window.localStorage.getItem(key) === today) continue;
          new Notification('Foxies · pripomienka', { body: `${goal.title} · dnes alebo po termíne`, tag: goal.id, icon: '/favicon.svg' });
          window.localStorage.setItem(key, today);
        } catch { /* Unsupported browser or denied storage: avoid repeated prompts. */ }
      }
    };
    const timer = window.setTimeout(notify, 0);
    const interval = window.setInterval(notify, 60000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [goals, enabled, personId, authenticated]);
  async function toggle() {
    if (!('Notification' in window)) { setMessage('Tento prehliadač nepodporuje oznámenia.'); return; }
    if (enabled) {
      setEnabled(false); setMessage('Pripomienky sú vypnuté.');
      try { window.localStorage.setItem(`acorns-reminders-${personId}`, 'off'); } catch { /* Session preference remains effective. */ }
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { setMessage('Oznámenia nie sú povolené. Povoľte ich v nastaveniach prehliadača.'); return; }
    setEnabled(true); setMessage('Pripomienky fungujú, keď je aplikácia otvorená.');
    try { window.localStorage.setItem(`acorns-reminders-${personId}`, 'on'); } catch { /* Session preference remains effective. */ }
  }
  return { enabled, message, toggle };
}
