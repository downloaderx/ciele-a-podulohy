'use client';

import { useEffect, useRef, useState } from 'react';
import type { Goal } from './page-model';
import { routineProgress } from './routines-model';

type Step = { id: string; title: string };
type Action = 'start' | 'done' | 'skipped' | 'back' | 'pause' | 'resume';
type Props = {
  routines: Goal[];
  canEdit: boolean;
  personName: string;
  saveStatus: string;
  onSave: (id: string | undefined, title: string, steps: Step[]) => string | undefined;
  onAction: (id: string, action: Action) => void;
  onDelete: (id: string) => void;
};

export function RoutinesWorkspace({ routines, canEdit, personName, saveStatus, onSave, onAction, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [submittedId, setSubmittedId] = useState<string>();
  const [saveError, setSaveError] = useState('');
  const selected = routines.find((routine) => routine.id === selectedId);
  const shown = selected ? [selected] : routines;
  function edit(routine?: Goal) {
    if (!canEdit) return;
    setSelectedId(routine?.id);
    setTitle(routine?.title ?? '');
    setSaveError('');
    setSteps(routine ? routine.children.filter((step) => !step.deletedAt).map(({ id, title }) => ({ id, title })) : [{ id: crypto.randomUUID(), title: '' }]);
    setEditing(true); setMenuOpen(false); setCreating(!routine);
  }
  function navigate(id?: string) { setSelectedId(id); setEditing(false); setCreating(false); setMenuOpen(false); }
  function move(index: number, delta: number) {
    setSteps((current) => { const next = [...current]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });
  }
  return <section className="routines-workspace" aria-label="Rutiny">
    <div className="routine-mobile-bar"><button type="button" aria-expanded={menuOpen} aria-controls="routine-menu" onClick={() => setMenuOpen((open) => !open)}>☰ Moje rutiny</button><span>{selected?.title ?? 'Všetky rutiny'}</span></div>
    <aside id="routine-menu" className={`routine-menu${menuOpen ? ' is-open' : ''}`}>
      <h2>Rutiny · {personName}</h2>
      <nav aria-label="Moje rutiny">
        <button type="button" aria-current={!selected && !creating ? 'page' : undefined} onClick={() => navigate()}>Všetky rutiny</button>
        {routines.map((routine) => <button type="button" key={routine.id} aria-current={!creating && selected?.id === routine.id ? 'page' : undefined} onClick={() => navigate(routine.id)}>{routine.title}{routine.routineRun?.paused ? <small>Pozastavená</small> : null}</button>)}
      </nav>
      {canEdit && <button className="routine-new-button" type="button" onClick={() => edit()}>+ Nová rutina</button>}
    </aside>
    <div className="routine-content">
      <header className="lists-content-heading"><h1>{selected?.title ?? 'Rutiny'}</h1><p>{personName} · Malé kroky v tvojom poradí.</p>{!canEdit && <p>Osobné rutiny druhej líštičky sú na prezeranie.</p>}</header>
      {editing && canEdit ? <div className="lists-note-grid"><form className="todo-note routine-editor routine-note" onSubmit={(event) => {
        event.preventDefault();
        const filledSteps = steps.filter((step) => step.title.trim());
        if (!title.trim() || !filledSteps.length) {
          setSaveError('Zadaj názov rutiny a aspoň jeden krok.');
          return;
        }
        const id = (creating || selected) && onSave(creating ? undefined : selected?.id, title, filledSteps);
        if (!id) { setSaveError('Rutinu sa nepodarilo uložiť. Skús znova.'); return; }
        setSubmittedId(id);
        setSelectedId(id); setEditing(false); setCreating(false);
      }}>
        <h2>{creating ? 'Nová rutina' : 'Upraviť rutinu'}</h2>
        <label>Názov rutiny<input autoFocus required maxLength={200} value={title} placeholder="Napríklad Ranná rutina" onChange={(event) => setTitle(event.target.value)} /></label>
        <p>Zmeny krokov sa použijú pri ďalšom spustení.</p>
        <ol>{steps.map((step, index) => <li key={step.id}>
          <input aria-label={`Krok ${index + 1}`} maxLength={2000} value={step.title} placeholder="Čo spravím?" onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, title: event.target.value } : item))} />
          <div className="routine-step-tools"><button type="button" aria-label={`Krok ${index + 1} vyššie`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`Krok ${index + 1} nižšie`} disabled={index === steps.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" aria-label={`Odstrániť krok ${index + 1}`} disabled={steps.length === 1} onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))}>Odobrať</button></div>
        </li>)}</ol>
        <button type="button" disabled={steps.length >= 100} onClick={() => setSteps((current) => [...current, { id: crypto.randomUUID(), title: '' }])}>+ Pridať krok</button>
        <div className="routine-actions"><button type="submit">Uložiť rutinu</button><button type="button" onClick={() => { setEditing(false); setCreating(false); }}>Zrušiť</button></div>
        {saveError && <p role="alert">{saveError}</p>}
        {!creating && selected && <footer className="todo-note-trash-area"><button type="button" onClick={() => { if (window.confirm('Presunúť túto rutinu do koša?')) { onDelete(selected.id); navigate(); } }}><span aria-hidden="true">🗑</span>Presunúť rutinu do koša</button></footer>}
      </form></div> : routines.length ? <>
        {submittedId && selected?.id === submittedId && <p className="routine-footnote" role="status">{saveStatus}</p>}
        <div className="lists-note-grid">{shown.map((routine) => <RoutineNote key={routine.id} routine={routine} canEdit={canEdit} onEdit={() => edit(routine)} onAction={onAction} />)}</div>
        <p className="routine-footnote">Postup sa ukladá automaticky. Ďalšie spustenie začne od prvého kroku.</p>
      </> : <div className="lists-empty"><h2>Jeden krok za druhým</h2><p>Pridaj si rannú, večernú alebo inú rutinu. Kroky uvidíš priamo na kartičke.</p>{canEdit && <button type="button" onClick={() => edit()}>Vytvoriť prvú rutinu</button>}</div>}
    </div>
  </section>;
}

function RoutineNote({ routine, canEdit, onEdit, onAction }: Pick<Props, 'canEdit' | 'onAction'> & { routine: Goal; onEdit: () => void }) {
  const run = routine.routineRun;
  const progress = run ? routineProgress(run) : undefined;
  const steps = run?.steps ?? routine.children.filter((step) => !step.deletedAt);
  const listRef = useRef<HTMLOListElement>(null);
  const currentIndex = progress?.index;
  useEffect(() => {
    const list = listRef.current, current = list?.querySelector('[aria-current="step"]');
    if (!list || !current) return;
    const itemRect = current.getBoundingClientRect(), listRect = list.getBoundingClientRect();
    if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom;
    else if (itemRect.top < listRect.top) list.scrollTop -= listRect.top - itemRect.top;
  }, [run?.id, currentIndex]);
  return <article className="todo-note note-lavender routine-note" aria-label={`Rutina: ${routine.title}`}>
    <header className="todo-note-heading"><div><h2>{routine.title}</h2><span>{run ? currentIndex === -1 ? 'Rutina je prejdená' : `${run.paused ? 'Pozastavené · ' : ''}Krok ${currentIndex! + 1} z ${steps.length}` : `Počet krokov: ${steps.length}`}</span></div>{canEdit && <button type="button" aria-label={`Upraviť rutinu: ${routine.title}`} onClick={onEdit}>⋯</button>}</header>
    <ol className="note-checklist routine-step-list" aria-label={`Kroky rutiny ${routine.title}`} ref={listRef}>{steps.map((step, index) => {
      const outcome = progress?.outcomes.get(step.id);
      const current = currentIndex === index;
      return <li key={step.id} aria-current={current ? 'step' : undefined} className={outcome === 'done' ? 'routine-step-done' : outcome === 'skipped' ? 'routine-step-skipped' : undefined}><span className="routine-step-number" aria-hidden="true">{outcome === 'done' ? '✓' : index + 1}</span><span className="routine-step-title">{step.title}{outcome === 'done' ? <small>Hotovo</small> : outcome === 'skipped' ? <small>Preskočené</small> : current ? <small>Aktuálny krok</small> : null}</span></li>;
    })}</ol>
    <fieldset className="routine-note-controls" disabled={!canEdit} aria-label={`Ovládanie rutiny ${routine.title}`}>
      {!run ? <button className="routine-start" type="button" onClick={() => onAction(routine.id, 'start')}>Spustiť rutinu</button> : currentIndex === -1 ? <><p>Hotové: {progress!.done} · Preskočené: {progress!.skipped}</p><button className="routine-start" type="button" onClick={() => onAction(routine.id, 'start')}>Spustiť znova</button><button type="button" onClick={() => onAction(routine.id, 'back')}>Späť na posledný krok</button></> : run.paused ? <button className="routine-start" type="button" onClick={() => onAction(routine.id, 'resume')}>Pokračovať</button> : <><div className="routine-actions"><button className="routine-done" type="button" onClick={() => onAction(routine.id, 'done')}>✓ Hotovo</button><button type="button" onClick={() => onAction(routine.id, 'skipped')}>Preskočiť</button></div><div className="routine-actions"><button disabled={currentIndex === 0} type="button" onClick={() => onAction(routine.id, 'back')}>← Späť</button><button type="button" onClick={() => onAction(routine.id, 'pause')}>Pozastaviť</button></div></>}
    </fieldset>
  </article>;
}
