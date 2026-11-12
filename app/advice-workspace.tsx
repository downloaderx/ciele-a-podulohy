'use client';

import { useState } from 'react';
import type { Goal } from './page-model';

export type AdviceDraft = { title: string; topic: string; text: string };

type Props = {
  advice: Goal[];
  onSave: (id: string | undefined, draft: AdviceDraft) => boolean;
  onDelete: (id: string) => void;
};

const searchKey = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('sk').trim();

export function AdviceWorkspace({ advice, onSave, onDelete }: Props) {
  const [query, setQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [editor, setEditor] = useState<string | null>(null);
  const topics = new Map<string, string>();
  const groups = new Map<string, Goal[]>();
  const queryKey = searchKey(query);
  for (const item of advice) {
    const topic = item.adviceTopic ?? '';
    const key = searchKey(topic);
    if (key && !topics.has(key)) topics.set(key, topic);
  }
  const activeFilter = topics.has(topicFilter) ? topicFilter : '';
  for (const item of advice) {
    const topic = item.adviceTopic ?? '';
    const key = searchKey(topic);
    if (activeFilter && key !== activeFilter) continue;
    if (!searchKey(`${item.title} ${topic} ${item.description}`).includes(queryKey)) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const editing = advice.find((item) => item.id === editor);
  const orderedTopics = [...topics].sort((a, b) => a[1].localeCompare(b[1], 'sk'));

  return <section className="chores-content advice-page" aria-labelledby="advice-title">
    <header className="advice-header">
      <h2 id="advice-title">Rady</h2>
      <button type="button" onClick={() => setEditor('new')}>＋ Pridať radu</button>
    </header>
    <div className="advice-filters">
      <label>Hľadať radu<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label>Téma<select value={activeFilter} onChange={(event) => setTopicFilter(event.target.value)}>
        <option value="">Všetky témy</option>
        {orderedTopics.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
      </select></label>
    </div>
    <datalist id="advice-topics">{orderedTopics.map(([key, title]) => <option key={key} value={title} />)}</datalist>
    {editor === 'new' && <AdviceForm onCancel={() => setEditor(null)} onSave={(draft) => {
      if (!onSave(undefined, draft)) return false;
      setQuery(''); setTopicFilter(''); setEditor(null);
      return true;
    }} />}
    {groups.size === 0 && <p className="empty-board">{advice.length ? 'Nenašli sa žiadne rady.' : 'Pridaj prvú radu, ku ktorej sa chceš vrátiť.'}</p>}
    {[...orderedTopics.map(([key]) => key), ''].map((key) => {
      const items = groups.get(key);
      if (!items) return null;
      return <section className="advice-group" key={key}>
        <h3>{topics.get(key) ?? 'Bez témy'}</h3>
        {items.map((item) => <details className="advice-card" key={item.id}>
          <summary>{item.title}</summary>
          {editing?.id === item.id ? <AdviceForm item={item} onCancel={() => setEditor(null)} onSave={(draft) => {
            if (!onSave(item.id, draft)) return false;
            setQuery(''); setTopicFilter(''); setEditor(null);
            return true;
          }} /> : <>
            <p>{item.description}</p>
            <div className="advice-actions">
              <button type="button" onClick={() => setEditor(item.id)}>Upraviť</button>
              <button type="button" onClick={() => { if (window.confirm('Presunúť túto radu do koša?')) onDelete(item.id); }}>Do koša</button>
            </div>
          </>}
        </details>)}
      </section>;
    })}
  </section>;
}

function AdviceForm({ item, onCancel, onSave }: { item?: Goal; onCancel: () => void; onSave: (draft: AdviceDraft) => boolean }) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [topic, setTopic] = useState(item?.adviceTopic ?? '');
  const [text, setText] = useState(item?.description ?? '');
  const [failed, setFailed] = useState(false);

  return <form className="resource-form advice-form" onSubmit={(event) => {
    event.preventDefault();
    setFailed(!onSave({ title, topic, text }));
  }}>
    <label>Nadpis<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Téma (voliteľná)<input list="advice-topics" maxLength={80} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Napr. Domácnosť" /></label>
    <label>Text rady<textarea required rows={5} maxLength={4000} value={text} onChange={(event) => setText(event.target.value)} /></label>
    <div><button type="submit" disabled={!title.trim() || !text.trim()}>Uložiť radu</button><button type="button" onClick={onCancel}>Zrušiť</button></div>
    {failed && <p role="alert">Radu sa nepodarilo uložiť.</p>}
  </form>;
}
