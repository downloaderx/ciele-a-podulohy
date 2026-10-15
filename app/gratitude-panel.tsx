'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { GratitudeEntry, Person } from './page-model';
import { gratitudeDay, gratitudeDateLabel } from './gratitude';

type Props = {
  entries: GratitudeEntry[];
  people: Person[];
  activePersonId: string;
  onSave: (day: string, text: string) => void;
};

export function GratitudePanel({ entries, people, activePersonId, onSave }: Props) {
  const [day, setDay] = useState(() => gratitudeDay());
  useEffect(() => {
    const refresh = () => setDay(gratitudeDay());
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const own = entries.find((entry) => entry.personId === activePersonId && entry.day === day);
  const historyDays = [...new Set(entries.filter((entry) => entry.day < day).map((entry) => entry.day))].sort().reverse();
  return <section className="gratitude-panel" aria-labelledby="gratitude-heading">
    <div className="gratitude-heading">
      <h2 id="gratitude-heading">Za čo sme dnes vďační</h2>
      <time dateTime={day}>{gratitudeDateLabel(day)}</time>
    </div>
    <p className="gratitude-hint">Aj drobnosť sa počíta. Jeden zápis denne od každého, iba ak máte chuť.</p>
    <ul className="gratitude-entries">
      {people.map((person) => {
        const entry = entries.find((item) => item.personId === person.id && item.day === day);
        return <li key={person.id} className={entry ? '' : 'gratitude-empty'}>
          <strong>{person.name}</strong>
          <p>{entry?.text ?? 'Dnes tu ešte nemá zápis.'}</p>
        </li>;
      })}
    </ul>
    <GratitudeEditor key={`${activePersonId}-${day}-${own?.text ?? ''}`} entry={own} day={day} onSave={onSave} />
    {historyDays.length ? <details className="gratitude-history">
      <summary>Predchádzajúce dni ({historyDays.length})</summary>
      <div className="gratitude-history-days">
        {historyDays.map((historyDay) => <section key={historyDay}>
          <h3><time dateTime={historyDay}>{gratitudeDateLabel(historyDay)}</time></h3>
          <ul className="gratitude-entries">{entries.filter((entry) => entry.day === historyDay).map((entry) =>
            <li key={entry.id}><strong>{people.find((person) => person.id === entry.personId)?.name}</strong><p>{entry.text}</p></li>)}</ul>
        </section>)}
      </div>
    </details> : null}
  </section>;
}

function GratitudeEditor({ entry, day, onSave }: { entry?: GratitudeEntry; day: string; onSave: Props['onSave'] }) {
  const [editing, setEditing] = useState(!entry);
  const [text, setText] = useState(entry?.text ?? '');
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (gratitudeDay() !== day) { setError('Začal nový deň. Svoj zápis môžeš uložiť do dnešného dňa.'); return; }
    if (!text.trim()) return;
    onSave(day, text.trim());
    setEditing(false);
  }
  if (!editing && entry) return <button type="button" className="gratitude-edit" onClick={() => setEditing(true)}>Upraviť môj dnešný zápis</button>;
  return <form className="gratitude-form" onSubmit={submit}>
    <label htmlFor="gratitude-text">Za čo si dnes vďačný/á?</label>
    <textarea id="gratitude-text" value={text} maxLength={1000} rows={3} placeholder="Napríklad za spoločnú večeru alebo chvíľu pokoja…" onChange={(event) => setText(event.target.value)} />
    {error ? <p role="alert">{error}</p> : null}
    <div className="gratitude-actions">
      <button type="submit" disabled={!text.trim() || text.trim() === entry?.text}>{entry ? 'Uložiť úpravu' : 'Uložiť dnešný zápis'}</button>
      {entry ? <button type="button" className="gratitude-edit" onClick={() => { setText(entry.text); setEditing(false); }}>Zrušiť</button> : null}
    </div>
  </form>;
}
