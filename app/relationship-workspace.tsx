'use client';

import { useState, type ReactNode } from 'react';
import { EditableInput } from './editable-input';
import type { Goal, GoalCategory } from './page-model';
import { pickRule, type RuleEntry } from './rulebook-model';

type Props = {
  goals: Goal[];
  canEdit: boolean;
  personal: boolean;
  rules: RuleEntry[];
  renderGoal: (goal: Goal) => ReactNode;
  addForm: (onCreated: (id: string, category: GoalCategory) => void) => ReactNode;
  overview: ReactNode;
  gratitude: ReactNode;
  activities: ReactNode;
  poll: ReactNode;
  calendar: ReactNode;
  changes: ReactNode;
  onAddRule: (text: string) => void;
  onRenameRule: (id: string, text: string) => void;
  onDeleteRule: (id: string) => void;
};

export function RelationshipWorkspace(props: Props) {
  const [view, setView] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const selectedGoal = props.goals.find((goal) => 'topic:' + goal.id === view);
  const groups = [
    { id: 'topics', label: 'Témy a ciele', pages: [{ id: 'poll', label: 'Anketa priorít' }] },
    { id: 'agreements', label: 'Pravidlá a dohody', pages: [{ id: 'rulebook', label: 'Rulebook' }] },
    { id: 'moments', label: 'Spoločné chvíle', pages: [
      { id: 'gratitude', label: 'Vďačnosť' },
      { id: 'activities', label: 'Spoločné aktivity' },
      ...(props.calendar ? [{ id: 'calendar', label: 'Kalendár' }] : []),
    ] },
    { id: 'history', label: 'História', pages: [{ id: 'changes', label: 'Zmeny' }] },
  ];
  const pages = groups.flatMap((group) => group.pages);
  const current = selectedGoal || ['overview', 'add', ...pages.map((page) => page.id)].includes(view) ? view : 'overview';
  const addLabel = props.personal ? 'Pridať osobný cieľ' : 'Pridať spoločný cieľ';
  const title = selectedGoal?.title ?? pages.find((page) => page.id === current)?.label ?? (current === 'add' ? addLabel : 'Prehľad');
  function navigate(next: string) { setView(next); setMenuOpen(false); }

  return <section className="chores-workspace relationship-workspace" aria-label="Pracovný priestor vzťahových cieľov">
    <div className="chores-mobile-bar">
      <button type="button" aria-expanded={menuOpen} aria-controls="relationship-menu" onClick={() => setMenuOpen((open) => !open)}>☰ Menu vzťahu</button>
      <span>{title}</span>
    </div>
    <nav id="relationship-menu" className={`chores-menu${menuOpen ? ' is-open' : ''}`} aria-label="Menu vzťahových cieľov">
      <button type="button" aria-current={current === 'overview' ? 'page' : undefined} onClick={() => navigate('overview')}>Prehľad</button>
      {groups.map((group) => <section key={group.id} className={`relationship-menu-group relationship-menu-${group.id}`} aria-labelledby={`relationship-menu-${group.id}-heading`}>
        <h3 id={`relationship-menu-${group.id}-heading`}>{group.label}</h3>
        {group.id === 'topics' && <>
          {props.goals.map((goal) => <button type="button" key={goal.id} aria-current={selectedGoal?.id === goal.id ? 'page' : undefined} onClick={() => navigate('topic:' + goal.id)}>{goal.title}</button>)}
        </>}
        {group.pages.map((page) => <button type="button" key={page.id} aria-current={current === page.id ? 'page' : undefined} onClick={() => navigate(page.id)}>{page.label}</button>)}
      </section>)}

    </nav>
    <div className="chores-content relationship-content">
      {!props.canEdit && <p className="personal-readonly-note">Ak chceš pridať cieľ na túto tabuľu, najprv prepni líštičku hore.</p>}
      {props.canEdit && current !== 'add' && <div className="chores-content-heading">
        <button type="button" onClick={() => navigate('add')}>＋ {addLabel}</button>
      </div>}
      {current === 'overview' && <>
        <header className="chores-content-heading"><h2>{props.personal ? 'Osobné ciele' : 'Vzťahové ciele'}</h2><p>{props.personal ? 'Svoje ciele nájdeš aj v menu.' : 'Každá téma má svoj priestor. Vyber ju v menu alebo otvor Rulebook.'}</p></header>
        {props.overview}
        <div className="chores-area-list relationship-topic-list">
          {props.goals.map((goal) => <button type="button" key={goal.id} onClick={() => navigate('topic:' + goal.id)}><strong>{goal.title}</strong><span>Otvoriť →</span></button>)}
          <button type="button" onClick={() => navigate('rulebook')}><strong>Rulebook</strong><span>{props.rules.length} pravidiel →</span></button>
        </div>
      </>}
      {selectedGoal && <div className="board-edit-controls">{props.renderGoal(selectedGoal)}</div>}
      {current === 'add' && props.canEdit && <section><h2>{addLabel}</h2>{props.addForm((id, category) => navigate(category === 'activity' ? 'activities' : 'topic:' + id))}</section>}
      {current === 'rulebook' && <Rulebook rules={props.rules} canEdit={props.canEdit} onAdd={props.onAddRule} onRename={props.onRenameRule} onDelete={props.onDeleteRule} onOpenTopic={(id) => navigate('topic:' + id)} />}
      {current === 'poll' && props.poll}
      {current === 'gratitude' && props.gratitude}
      {current === 'activities' && props.activities}
      {current === 'calendar' && props.calendar}
      {current === 'changes' && <div className="relationship-changes"><h2>Zmeny</h2>{props.changes}</div>}
    </div>
  </section>;
}

function Rulebook({ rules, canEdit, onAdd, onRename, onDelete, onOpenTopic }: {
  rules: RuleEntry[]; canEdit: boolean; onAdd: (text: string) => void;
  onRename: (id: string, text: string) => void; onDelete: (id: string) => void; onOpenTopic: (id: string) => void;
}) {
  const [text, setText] = useState('');
  const [pickedId, setPickedId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const selected = rules.find((rule) => rule.id === pickedId);
  return <section className="rulebook" aria-label="Rulebook">
    <header className="chores-content-heading"><h2>Rulebook</h2><p>Naše pravidlá a dohody, ku ktorým sa môžeme vrátiť.</p></header>
    <div className="rulebook-pick">
      <span className="label">Jedno pravidlo na pripomenutie</span>
      <div aria-live="polite" aria-atomic="true">{selected ? <><blockquote>{selected.text}</blockquote>{selected.sourceTitle && <p>Z témy: {selected.sourceTitle}</p>}</> : <p>Nechaj si náhodne vybrať jedno z našich pravidiel.</p>}</div>
      <button type="button" disabled={!rules.length} onClick={() => setPickedId(pickRule(rules, pickedId)?.id)}>🔀 {selected ? 'Vybrať ďalšie pravidlo' : 'Vybrať náhodné pravidlo'}</button>
    </div>
    {canEdit && <form className="rulebook-add" onSubmit={(event) => { event.preventDefault(); if (!text.trim()) return; onAdd(text); setText(''); }}>
      <label>Nové pravidlo<textarea required maxLength={4000} rows={3} placeholder="Na čom sa chceme dohodnúť…" value={text} onChange={(event) => setText(event.target.value)} /></label>
      <button type="submit" disabled={!text.trim()}>Pridať pravidlo</button>
    </form>}
    <h3>Všetky pravidlá <span className="rulebook-count">{rules.length}</span></h3>
    {!rules.length && <p className="empty-board">Zatiaľ tu nie sú pravidlá.{canEdit ? ' Môžeš pridať prvé.' : ''}</p>}
    <ul className="rulebook-list">{rules.map((rule) => <li key={rule.id}>
      {editingId === rule.id ? <><EditableInput maxLength={4000} aria-label="Text pravidla" value={rule.text} onCommit={(value) => { if (value.trim()) onRename(rule.id, value); }} /><button type="button" onClick={() => setEditingId(undefined)}>Hotovo</button></> : <p>{rule.text}</p>}
      <div className="rulebook-actions">
        {rule.sourceId && <button type="button" onClick={() => onOpenTopic(rule.sourceId!)}>Z témy: {rule.sourceTitle} →</button>}
        {canEdit && <>
          <button type="button" aria-label={'Upraviť pravidlo: ' + rule.text} onClick={() => setEditingId(editingId === rule.id ? undefined : rule.id)}>{editingId === rule.id ? 'Zavrieť úpravu' : 'Upraviť'}</button>
          <button type="button" onClick={() => { if (window.confirm('Presunúť toto pravidlo do koša?')) onDelete(rule.id); }}>Do koša</button>
        </>}
      </div>
    </li>)}</ul>
  </section>;
}
