'use client';
import { useEffect, useSyncExternalStore } from 'react';
const themes = [
  { id: 'original', label: 'Pôvodná', icon: '☀', swatch: '#dff7f2' },
  { id: 'dark', label: 'Tmavá', icon: '🌙', swatch: '#182236' },
  { id: 'blue', label: 'Modrá', icon: '💙', swatch: '#b7d2ff' },
  { id: 'hearts', label: 'Srdiečka', icon: '💗', swatch: '#f5bfd4' },
  { id: 'green', label: 'Zelená', icon: '🌿', swatch: '#b5dfc5' },
  { id: 'lavender', label: 'Levanduľa', icon: '💜', swatch: '#d5c8f3' },
] as const;
type Theme = typeof themes[number]['id'];
const key = 'foxies-theme-v1';
const eventName = 'foxies-theme-change';
function readTheme(): Theme {
  let value: string | null = null;
  try { value = window.localStorage.getItem(key); } catch { /* Local-only fallback below. */ }
  value ??= document.documentElement.dataset.theme ?? null;
  return themes.some((theme) => theme.id === value) ? value as Theme : 'original';
}
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback); window.addEventListener(eventName, callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener(eventName, callback); };
}
const serverTheme = (): Theme => 'original';
function useTheme() { return useSyncExternalStore(subscribe, readTheme, serverTheme); }
export function ThemeController() {
  const theme = useTheme();
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  return null;
}
export function ThemePicker() {
  const selected = useTheme();
  function choose(theme: Theme) {
    try { window.localStorage.setItem(key, theme); } catch { /* Selection still works for this visit. */ }
    document.documentElement.setAttribute('data-theme', theme);
    window.dispatchEvent(new Event(eventName));
  }
  return <section className="theme-picker" aria-label="Farebná téma">
    <h3>Farebná téma</h3><div className="theme-options">
      {themes.map((theme) => <button type="button" key={theme.id} aria-pressed={selected === theme.id} onClick={() => choose(theme.id)}>
        <span className="theme-swatch" style={{ backgroundColor: theme.swatch }} aria-hidden="true">{theme.icon}</span>{theme.label}
      </button>)}
    </div><p>Výber sa uloží v tomto prehliadači.</p>
  </section>;
}
