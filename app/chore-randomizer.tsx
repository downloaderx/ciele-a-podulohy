'use client';
import { useState } from 'react';
import { choreElapsedLabel, createRandomIndex, getChoreIntervalDays, type ChoreCadence, type Goal } from './page-model';
import { chorePickOptions, choreRandomizerItems, type ChorePick, type ChoreReveal } from './chore-randomizer-model';

export function ChoreRandomizer({ goals, onOpen }: { goals: Goal[]; onOpen: (request: ChoreReveal) => void }) {
  const items = choreRandomizerItems(goals);
  return <section className="project-strip chore-randomizer" aria-label="Náhodný výber chores">
    <div className="chore-randomizer-heading"><span className="label">Chores</span><h3>Nevieš, čím začať?</h3><p>Nechaj si vybrať jednu prácu. Dnes vykonané sa nevyberajú.</p></div>
    <div className="chore-randomizer-grid">{(['routine', 'occasional'] as const).map((cadence) => <ChorePickCard key={cadence} items={items} cadence={cadence} onOpen={onOpen} />)}</div>
  </section>;
}

function ChorePickCard({ items, cadence, onOpen }: { items: ChorePick[]; cadence: ChoreCadence; onOpen: (request: ChoreReveal) => void }) {
  const [selectedId, setSelectedId] = useState<string>();
  const eligible = items.filter((item) => item.cadence === cadence && !item.doneToday);
  const selected = eligible.find((item) => item.task.id === selectedId);
  const hasAny = items.some((item) => item.cadence === cadence);
  const routine = cadence === 'routine';
  return <section className="chore-pick-card" aria-label={routine ? 'Náhodná bežná práca' : 'Náhodná občasná práca'}>
    <h4>{routine ? 'Bežné práce' : 'Občasné práce'}</h4>
    <button type="button" disabled={!eligible.length} onClick={() => { const options = chorePickOptions(items, cadence, selectedId); if (options.length) setSelectedId(options[createRandomIndex(options.length)].task.id); }}>
      <span aria-hidden="true">⤨ </span>{selected ? routine ? 'Vybrať inú bežnú prácu' : 'Vybrať inú občasnú prácu' : routine ? 'Vybrať bežnú prácu' : 'Vybrať občasnú prácu'}
    </button>
    <div className="chore-pick-result" aria-live="polite" aria-atomic="true">{selected ? <>
      <strong>{selected.task.title}</strong><span>Projekt: {selected.goalTitle}</span>
      <span>{choreElapsedLabel(selected.task)}{!routine ? ` · Opakovať každých ${getChoreIntervalDays(selected.task)} dní` : ''}</span>
      <button className="chore-pick-open" type="button" onClick={() => onOpen({ taskId: selected.task.id, path: selected.path })}>Prejsť na podúlohu</button>
    </> : <p>{!eligible.length ? hasAny ? 'Všetky práce v tejto skupine už boli dnes vykonané.' : 'V tejto skupine zatiaľ nie sú podúlohy.' : selectedId ? 'Vybraná práca už nie je vo výbere. Skús ďalšiu.' : 'Klikni a vyberieme ti konkrétnu podúlohu.'}</p>}</div>
  </section>;
}
