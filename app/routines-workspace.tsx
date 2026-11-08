'use client';

import { useState } from 'react';
import type { Goal } from './page-model';
import { routineProgress } from './routines-model';

type Step = { id: string; title: string };
type Props = {
  routines: Goal[];
  canEdit: boolean;
  personName: string;
  onSave: (id: string | undefined, title: string, steps: Step[]) => string | undefined;
  onAction: (id: string, action: 'start' | 'done' | 'skipped' | 'back' | 'pause' | 'resume') => void;
  onDelete: (id: string) => void;
};

export function RoutinesWorkspace({ routines, canEdit, personName, onSave, onAction, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const selected = routines.find((routine) => routine.id === selectedId) ?? routines[0];
  const run = selected?.routineRun;
  const progress = run ? routineProgress(run) : undefined;
  function edit(isNew = false) {
    if (!canEdit) return;
    setSelectedId(isNew ? undefined : selected?.id);
    setTitle(isNew ? '' : selected?.title ?? '');
    setSteps(isNew ? [{ id: crypto.randomUUID(), title: '' }] : selected?.children.filter((step) => !step.deletedAt).map(({ id, title }) => ({ id, title })) ?? []);
    setEditing(true);
    setMenuOpen(false);
    setCreating(isNew);
  }
  const [creating, setCreating] = useState(false);
  function move(index: number, delta: number) {
    setSteps((current) => { const next = [...current]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });
  }
  return <section className="routines-workspace" aria-label="Rutiny">
    <div className="routine-mobile-bar"><button type="button" aria-expanded={menuOpen} aria-controls="routine-menu" onClick={() => setMenuOpen((open) => !open)}>☰ Moje rutiny</button><span>{selected?.title ?? personName}</span></div>
    <aside id="routine-menu" className={`routine-menu${menuOpen ? ' is-open' : ''}`}>
      <h2>Rutiny · {personName}</h2>
      <p>Malé kroky v tvojom poradí.</p>
      {canEdit && <button type="button" onClick={() => edit(true)}>+ Nová rutina</button>}
      <nav aria-label="Moje rutiny">{routines.map((routine) => <button type="button" key={routine.id} aria-current={!creating && selected?.id === routine.id ? 'page' : undefined} onClick={() => { setSelectedId(routine.id); setEditing(false); setCreating(false); setMenuOpen(false); }}>{routine.title}{routine.routineRun?.paused ? <small>Pozastavená</small> : null}</button>)}</nav>
    </aside>
    <div className="routine-content">
      {!canEdit && <p className="routine-footnote">Osobné rutiny druhej líštičky sú na prezeranie.</p>}
      {editing && canEdit ? <form className="routine-editor" onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim() || !steps.length || steps.some((step) => !step.title.trim())) return;
        const id = onSave(creating ? undefined : selected?.id, title, steps);
        if (!id) return;
        setSelectedId(id); setEditing(false); setCreating(false);
      }}>
        <h2>{creating ? 'Nová rutina' : 'Upraviť rutinu'}</h2>
        <label>Názov rutiny<input autoFocus required maxLength={200} value={title} placeholder="Napríklad Ranná rutina" onChange={(event) => setTitle(event.target.value)} /></label>
        <p>Kroky sa budú zobrazovať po jednom. Zmeny krokov sa použijú pri ďalšom spustení.</p>
        <ol>{steps.map((step, index) => <li key={step.id}>
          <input aria-label={`Krok ${index + 1}`} required maxLength={2000} value={step.title} placeholder="Čo spravím?" onChange={(event) => setSteps((current) => current.map((item) => item.id === step.id ? { ...item, title: event.target.value } : item))} />
          <div className="routine-step-tools"><button type="button" aria-label={`Krok ${index + 1} vyššie`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`Krok ${index + 1} nižšie`} disabled={index === steps.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" aria-label={`Odstrániť krok ${index + 1}`} disabled={steps.length === 1} onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))}>Odobrať</button></div>
        </li>)}</ol>
        <button type="button" disabled={steps.length >= 100} onClick={() => setSteps((current) => [...current, { id: crypto.randomUUID(), title: '' }])}>+ Pridať krok</button>
        <div className="routine-actions"><button type="submit">Uložiť rutinu</button><button type="button" onClick={() => { setEditing(false); setCreating(false); }}>Zrušiť</button></div>
      </form> : selected ? <>
        <header className="routine-heading"><h2>{selected.title}</h2>{canEdit && <button type="button" onClick={() => edit()}>Upraviť rutinu</button>}</header>
        {!run ? <fieldset disabled={!canEdit} className="routine-player"><p>Počet krokov: {selected.children.filter((step) => !step.deletedAt).length}. Postupuj vlastným tempom.</p><button type="button" onClick={() => onAction(selected.id, 'start')}>Spustiť rutinu</button></fieldset> : <fieldset disabled={!canEdit} className="routine-player" aria-live="polite">
          {progress!.index === -1 ? <><span className="label">Hotovo na teraz</span><h3>Rutina je prejdená</h3><p>Hotové kroky: {progress!.done} · Preskočené: {progress!.skipped}</p><button type="button" onClick={() => onAction(selected.id, 'start')}>Spustiť znova</button><button type="button" onClick={() => onAction(selected.id, 'back')}>Späť na posledný krok</button></> : run.paused ? <><span className="label">Pozastavené · krok {progress!.index + 1} z {run.steps.length}</span><h3>Pokračuj, keď sa ti to hodí.</h3><button type="button" onClick={() => onAction(selected.id, 'resume')}>Pokračovať</button></> : <><span className="label">Krok {progress!.index + 1} z {run.steps.length}</span><h3>{run.steps[progress!.index].title}</h3><div className="routine-actions"><button className="routine-done" type="button" onClick={() => onAction(selected.id, 'done')}>✓ Hotovo</button><button type="button" onClick={() => onAction(selected.id, 'skipped')}>Preskočiť</button></div><div className="routine-actions routine-secondary"><button disabled={progress!.index === 0} type="button" onClick={() => onAction(selected.id, 'back')}>← Späť</button><button type="button" onClick={() => onAction(selected.id, 'pause')}>Pozastaviť</button></div></>}
        </fieldset>}
        <details className="routine-all-steps"><summary>Všetky kroky</summary><ol>{(run?.steps ?? selected.children.filter((step) => !step.deletedAt)).map((step) => <li key={step.id}><span>{step.title}</span>{progress?.outcomes.get(step.id) === 'done' ? <small>Hotovo</small> : progress?.outcomes.get(step.id) === 'skipped' ? <small>Preskočené</small> : null}</li>)}</ol></details>
        <p className="routine-footnote">Postup sa ukladá automaticky. Ďalšie spustenie začne od prvého kroku.</p>
        {canEdit && <details className="routine-manage"><summary>Správa rutiny</summary><button type="button" onClick={() => { if (window.confirm('Presunúť túto rutinu do koša?')) onDelete(selected.id); }}>Presunúť do koša</button></details>}
      </> : <div className="routine-player"><h2>Jeden krok za druhým</h2><p>Pridaj si rannú, večernú alebo inú rutinu. Kroky si zvolíš sama a môžeš ich kedykoľvek upraviť.</p>{canEdit && <button type="button" onClick={() => edit(true)}>Vytvoriť prvú rutinu</button>}</div>}
    </div>
  </section>;
}
