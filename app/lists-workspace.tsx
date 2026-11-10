'use client';

import { useState, type FormEvent } from 'react';
import type { Goal, NoteColor } from './page-model';
import { EditableInput } from './editable-input';
import { noteColors, hasCompletedTodoItems } from './lists-model';

const colorNames: Record<NoteColor, string> = { butter: 'Bledožltá', rose: 'Ružová', mint: 'Mintová', lavender: 'Levanduľová', sky: 'Bledomodrá' };
type Props = {
  lists: Goal[];
  onReset: (listId: string) => void;
  spaces: Array<{ id: string; label: string }>;
  onMove: (id: string, destination: string) => void;
  moveNotice: string;
  canEdit: boolean;
  spaceLabel: string;
  onCreate: (title: string) => string | undefined;
  onAddItem: (listId: string, title: string) => void;
  onToggle: (taskId: string) => void;
  onRename: (taskId: string, title: string) => void;
  onColor: (listId: string, color: NoteColor) => void;
  onDelete: (taskId: string) => void;
};

export function ListsWorkspace(props: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const selected = props.lists.find((list) => list.id === selectedId);
  const shown = selected ? [selected] : props.lists;
  const openCreate = () => { if (!props.canEdit) return; setCreating(true); setMenuOpen(true); };
  function create(event: FormEvent) {
    event.preventDefault();
    const id = props.onCreate(name);
    if (!id) return;
    setSelectedId(id); setName(''); setCreating(false); setMenuOpen(false);
  }
  return <section className="lists-workspace" aria-label="Pracovný priestor Lists & todos">
    <div className="lists-mobile-bar"><button type="button" aria-expanded={menuOpen} aria-controls="lists-menu" onClick={() => setMenuOpen((open) => !open)}>☰ Zoznamy</button><span>{selected?.title ?? 'Všetky zoznamy'}</span></div>
    <nav id="lists-menu" className={`lists-menu${menuOpen ? ' is-open' : ''}`} aria-label="Menu zoznamov">
      <h2>Zoznamy · {props.spaceLabel}</h2>
      <button type="button" aria-current={!selected ? 'page' : undefined} onClick={() => { setSelectedId(null); setMenuOpen(false); }}>Všetky zoznamy</button>
      {props.lists.map((list) => <button type="button" key={list.id} aria-current={selected?.id === list.id ? 'page' : undefined} onClick={() => { setSelectedId(list.id); setMenuOpen(false); }}><span>{list.title}</span><small>{list.children.filter((task) => task.done).length}/{list.children.length}</small></button>)}
      {props.canEdit && <button type="button" className="lists-new-button" onClick={openCreate}>＋ Nový zoznam</button>}
      {props.canEdit && creating && <form className="lists-create-form" onSubmit={create}><label>Názov zoznamu<input maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Napr. Nákupy alebo Vybaviť" /></label><div><button disabled={!name.trim()} type="submit">Vytvoriť zoznam</button><button type="button" onClick={() => { setCreating(false); setName(''); }}>Zrušiť</button></div></form>}
    </nav>
    <div className="lists-content">
      {props.moveNotice && <p className="list-move-notice" role="status">{props.moveNotice}</p>}
      <header className="lists-content-heading"><h1>{selected?.title ?? 'Lists & todos'}</h1><p>{props.spaceLabel} · Jednorazové veci, na ktoré nechceme zabudnúť.</p>{!props.canEdit && <p>Osobné zoznamy druhej líštičky sú na prezeranie.</p>}</header>
      {!props.lists.length ? <div className="lists-empty"><span aria-hidden="true">📝</span><h2>Prvý zoznam čaká na teba</h2><p>Nákupy, telefonáty, čo vziať so sebou… Každý zoznam bude vlastná farebná kartička s úlohami.</p>{props.canEdit && <button type="button" onClick={openCreate}>Vytvoriť prvý zoznam</button>}</div> : <div className={`lists-note-grid${selected ? ' single' : ''}`}>{shown.map((list) => <TodoNote key={list.id} list={list} {...props} />)}</div>}
    </div>
  </section>;
}

function TodoNote({ list, spaces, onMove, canEdit, onReset, onAddItem, onToggle, onRename, onColor, onDelete }: Props & { list: Goal }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const tasks = list.children.filter((task) => !task.deletedAt && !task.purgedAt);
  const color = list.noteColor && noteColors.includes(list.noteColor) ? list.noteColor : 'butter';
  return <article className={`todo-note note-${color}`} aria-label={`Zoznam: ${list.title}`}>
    <header className="todo-note-heading"><div>{editing ? <EditableInput maxLength={100} aria-label="Názov zoznamu na kartičke" value={list.title} onCommit={(value) => onRename(list.id, value)} /> : <h2>{list.title}</h2>}<span>{tasks.filter((task) => task.done).length} z {tasks.length} hotovo</span></div>{canEdit && <button type="button" aria-label={`${editing ? 'Dokončiť úpravy zoznamu' : 'Upraviť zoznam'}: ${list.title}`} aria-expanded={editing} onClick={() => setEditing((open) => !open)}>{editing ? 'Hotovo' : '⋯'}</button>}</header>
    {editing && <div className="todo-note-options"><label>Farba kartičky<select value={color} onChange={(event) => onColor(list.id, event.target.value as NoteColor)}>{noteColors.map((value) => <option key={value} value={value}>{colorNames[value]}</option>)}</select></label><div className="list-move-control"><label>Presunúť zoznam do<select aria-label={`Cieľ presunu zoznamu ${list.title}`} value="" onChange={(event) => { if (event.target.value) onMove(list.id, event.target.value); }}><option value="">Vyber časť…</option>{spaces.filter((space) => space.id !== (list.spaceId ?? 'shared')).map((space) => <option key={space.id} value={space.id}>{space.label}</option>)}<option value="recipe">Špajznička · spoločné obľúbené jedlá</option></select></label></div></div>}
    {canEdit && <button type="button" className="note-reset-button" aria-label={`Všetko odznačiť v zozname ${list.title}`} title="Odznačí všetky hotové položky tohto zoznamu" disabled={!hasCompletedTodoItems(list)} onClick={() => onReset(list.id)}><span aria-hidden="true">↶</span> Všetko odznačiť</button>}
    <ul className="note-checklist">{tasks.map((task) => <li key={task.id} className={task.done ? 'is-done' : ''}>
      <label className="note-task-check"><input type="checkbox" checked={task.done} disabled={!canEdit} onChange={() => onToggle(task.id)} aria-label={`${task.done ? 'Vrátiť medzi nedokončené' : 'Označiť ako hotové'}: ${task.title}`} />{!editing && <span>{task.title}</span>}</label>
      {editing && <><EditableInput maxLength={2000} aria-label={`Názov úlohy: ${task.title}`} value={task.title} onCommit={(value) => onRename(task.id, value)} /><button type="button" className="note-task-trash" aria-label={`Presunúť úlohu do koša: ${task.title}`} onClick={() => onDelete(task.id)}>Do koša</button></>}
    </li>)}</ul>
    {!tasks.length && <p className="todo-note-empty">Zatiaľ prázdny zoznam. Pridaj prvú úlohu.</p>}
    {canEdit && <form className="note-add-task" onSubmit={(event) => { event.preventDefault(); if (!draft.trim()) return; onAddItem(list.id, draft); setDraft(''); }}><input maxLength={2000} value={draft} aria-label={`Nová úloha v zozname ${list.title}`} placeholder="Pridať úlohu…" onChange={(event) => setDraft(event.target.value)} /><button type="submit" disabled={!draft.trim()} aria-label={`Pridať úlohu do zoznamu ${list.title}`}>＋</button></form>}
    {editing && <footer className="todo-note-trash-area"><button type="button" onClick={() => onDelete(list.id)}><svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg><span>Presunúť zoznam do koša</span></button></footer>}
  </article>;
}
