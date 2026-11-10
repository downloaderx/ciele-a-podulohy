'use client';

import { useState, type ReactNode } from 'react';
import { createId, type AgreementEntry, type Goal, type Person, type Task } from './page-model';
import { ProjectResources } from './project-resources';

type Props = {
  topics: Goal[];
  selectedId?: string;
  people: Person[];
  personId: string;
  onOpen: (id: string) => void;
  onCreate: (title: string) => string | undefined;
  onSave: (topicId: string, entry: AgreementEntry) => boolean;
};

const reasonGroups = [
  { kind: 'works', label: 'Čo by fungovalo' },
  { kind: 'concern', label: 'Čo by nefungovalo a prečo' },
  { kind: 'condition', label: 'Za akých podmienok by to šlo' },
] as const;

export function AgreementWorkspace({ topics, selectedId, people, personId, onOpen, onCreate, onSave }: Props) {
  const [creating, setCreating] = useState(false);
  const topic = topics.find((item) => item.id === selectedId);

  return <section className="agreement-workspace" aria-label="Hľadanie dohody">
    <header className="chores-content-heading">
      <h2>Hľadanie dohody</h2>
      <p>Sem patria náročnejšie témy, ktoré ste presunuli z Cieľov alebo otvorili priamo tu. Nájsť pri nich riešenie, ktoré by vyhovovalo obom, môže byť veľmi ťažké, niekedy až takmer nemožné.</p>
      <p>Môžete si tu spísať, čo každý potrebuje a prečo mu jednotlivé návrhy vyhovujú alebo prekážajú. K téme sa dá vrátiť aj neskôr, keď na ňu budete mať priestor.</p>
    </header>
    <div className="agreement-topic-bar">
      {topics.map((item) => <button key={item.id} type="button" aria-pressed={topic?.id === item.id} onClick={() => onOpen(item.id)}>{item.title}</button>)}
      <button type="button" onClick={() => setCreating((open) => !open)} aria-expanded={creating}>＋ Nová téma</button>
    </div>
    {creating && <TextForm label="Názov novej témy" maxLength={200} onCancel={() => setCreating(false)} onSave={(title) => {
      const id = onCreate(title);
      if (!id) return false;
      setCreating(false);
      onOpen(id);
      return true;
    }} />}
    {topic ? <AgreementTopic key={topic.id} topic={topic} people={people} personId={personId} onSave={(entry) => onSave(topic.id, entry)} />
      : <p className="empty-board">{topics.length ? 'Vyber tému, ku ktorej sa chceš vrátiť.' : 'Pridaj novú tému alebo presuň existujúci cieľ.'}</p>}
  </section>;
}

function AgreementTopic({ topic, people, personId, onSave }: { topic: Goal; people: Person[]; personId: string; onSave: (entry: AgreementEntry) => boolean }) {
  const entries = (topic.agreementEntries ?? []).filter((entry) => !entry.deletedAt);
  const showEntry = (entry: AgreementEntry) => <Entry key={entry.id} entry={entry} editable={entry.personId === personId} onSave={onSave} />;
  const showByPerson = (render: (person: Person) => ReactNode) => <div className="agreement-columns">
    {people.map((person) => <section className="agreement-side" key={person.id} style={{ borderInlineStartColor: person.tone }}>
      <h4>{person.name}</h4>
      {render(person)}
    </section>)}
  </div>;
  function addEntry(label: string, kind: AgreementEntry['kind'], proposalId?: string) {
    return <AddEntry label={label} onSave={(text) => {
      const base = { id: createId(), personId, text };
      if (kind === 'need' || kind === 'context' || kind === 'proposal') return onSave({ ...base, kind });
      return proposalId ? onSave({ ...base, kind, proposalId }) : false;
    }} />;
  }

  return <article className="agreement-topic">
    <h3>{topic.title}</h3>
    <h4>Pôvodné potreby</h4>
    {showByPerson((person) => <>
      {entries.filter((entry) => entry.kind === 'need' && entry.personId === person.id).map(showEntry)}
      {person.id === personId && addEntry('Pridať potrebu', 'need')}
    </>)}
    <section className="agreement-context">
      <h4>Fakty a pozorovania</h4>
      {entries.filter((entry) => entry.kind === 'context').map((entry) => <div key={entry.id}>
        <small>{people.find((person) => person.id === entry.personId)?.name}</small>
        {showEntry(entry)}
      </div>)}
      {addEntry('Pridať fakt alebo pozorovanie', 'context')}
    </section>
    {(topic.description || topic.children.length > 0 || topic.resources?.some((item) => !item.deletedAt)) && <details className="agreement-context">
      <summary>Pôvodné poznámky a podklady</summary>
      {topic.description && <p>{topic.description}</p>}
      <OriginalItems tasks={topic.children} />
      {topic.resources?.some((item) => !item.deletedAt) && <ProjectResources goalId={topic.id} resources={topic.resources} />}
    </details>}
    <section className="agreement-proposals">
      <h4>Návrhy riešení</h4>
      {addEntry('Pridať návrh riešenia', 'proposal')}
      {entries.filter((entry) => entry.kind === 'proposal').map((proposal) => <section className="agreement-proposal" key={proposal.id} aria-label={proposal.text}>
        <Entry entry={proposal} editable={proposal.personId === personId} onSave={onSave} />
        {showByPerson((person) => reasonGroups.map(({ kind, label }) => <div className="agreement-reason" key={kind}>
          <h5>{label}</h5>
          {entries.filter((entry) => entry.kind === kind && entry.personId === person.id && 'proposalId' in entry && entry.proposalId === proposal.id).map(showEntry)}
          {person.id === personId && addEntry(label, kind, proposal.id)}
        </div>))}
      </section>)}
    </section>
    {topic.agreementEntries?.some((entry) => entry.deletedAt && entry.personId === personId) && <details className="agreement-context">
      <summary>Moje odobraté body</summary>
      {topic.agreementEntries.filter((entry) => entry.deletedAt && entry.personId === personId).map((entry) => <div className="agreement-entry" key={entry.id}>
        <p>{entry.text}</p>
        <button type="button" onClick={() => {
          const restored = { ...entry };
          delete restored.deletedAt;
          onSave(restored);
        }}>Obnoviť</button>
      </div>)}
    </details>}
  </article>;
}

function OriginalItems({ tasks }: { tasks: Task[] }) {
  return tasks.length > 0 ? <ul>{tasks.map((task) => <li key={task.id}>{task.title}<OriginalItems tasks={task.children} /></li>)}</ul> : null;
}

function Entry({ entry, editable, onSave }: { entry: AgreementEntry; editable: boolean; onSave: (entry: AgreementEntry) => boolean }) {
  const [editing, setEditing] = useState(false);
  return editing ? <TextForm label="Upraviť text" initial={entry.text} onCancel={() => setEditing(false)} onSave={(text) => {
    if (!onSave({ ...entry, text })) return false;
    setEditing(false);
    return true;
  }} /> : <div className="agreement-entry">
    {entry.kind === 'proposal' ? <h5>{entry.text}</h5> : <p>{entry.text}</p>}
    {editable && <div className="agreement-entry-actions">
      <button type="button" onClick={() => setEditing(true)}>Upraviť</button>
      {entry.kind !== 'proposal' && <button type="button" onClick={() => onSave({ ...entry, deletedAt: new Date().toISOString() })}>Odobrať</button>}
    </div>}
  </div>;
}

function AddEntry({ label, onSave }: { label: string; onSave: (text: string) => boolean }) {
  const [open, setOpen] = useState(false);
  return open ? <TextForm label={label} onCancel={() => setOpen(false)} onSave={(text) => {
    if (!onSave(text)) return false;
    setOpen(false);
    return true;
  }} /> : <button type="button" className="agreement-add" onClick={() => setOpen(true)}>＋ {label}</button>;
}

function TextForm({ label, initial = '', maxLength = 4000, onCancel, onSave }: { label: string; initial?: string; maxLength?: number; onCancel: () => void; onSave: (text: string) => boolean }) {
  const [value, setValue] = useState(initial);
  const [failed, setFailed] = useState(false);
  return <form className="agreement-form" onSubmit={(event) => {
    event.preventDefault();
    if (value.trim()) setFailed(!onSave(value.trim()));
  }}>
    <label>{label}<textarea rows={3} maxLength={maxLength} required value={value} onChange={(event) => setValue(event.target.value)} /></label>
    <div className="agreement-entry-actions"><button type="submit" disabled={!value.trim()}>Uložiť</button><button type="button" onClick={onCancel}>Zrušiť</button></div>
    {failed && <p role="alert">Text sa nepodarilo uložiť. Skús to znova.</p>}
  </form>;
}
