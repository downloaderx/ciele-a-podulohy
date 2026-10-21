'use client';
import { useState } from 'react';
import type { ConflictChoices, MergeConflict } from './state-sync';

export function SyncConflictPanel({ conflicts, labelFor, valueFor, onResolve, onDownload }: {
  conflicts: MergeConflict[]; labelFor: (path: string) => string; valueFor: (value: unknown) => string;
  onResolve: (choices: ConflictChoices) => void; onDownload: () => void;
}) {
  const [choices, setChoices] = useState<ConflictChoices>({});
  const complete = conflicts.every((conflict) => choices[conflict.path]);
  const selected = conflicts.filter((conflict) => choices[conflict.path]).length;
  return <section className="sync-conflicts" role="alert" aria-label="Riešenie rozdielnych úprav">
    <h2>Rozdielne úpravy tej istej položky</h2>
    <p>Nesporné položky a úpravy už vidíš na tabuli. Pri každom spornom poli vyber, ktorú verziu zachovať. Sporné polia sa uložia až po potvrdení výberu.</p>
    <div className="sync-conflict-fields">{conflicts.map((conflict) => <fieldset key={conflict.path}>
      <legend>{labelFor(conflict.path)}</legend>
      {(['local', 'remote'] as const).map((side) => <label key={side}>
        <input type="radio" name={'conflict-' + conflict.path} checked={choices[conflict.path] === side} onChange={() => setChoices((current) => ({ ...current, [conflict.path]: side }))} />
        <span><strong>{side === 'local' ? 'Toto zariadenie' : 'Server'}</strong><span className="sync-conflict-value">{valueFor(conflict[side])}</span></span>
      </label>)}
    </fieldset>)}</div>
    <div className="sync-conflict-actions">
      <button type="button" onClick={onDownload}>Stiahnuť obe verzie</button>
      <button type="button" onClick={() => setChoices(Object.fromEntries(conflicts.map((item) => [item.path, 'local'])))}>Vybrať všade toto zariadenie</button>
      <button type="button" onClick={() => setChoices(Object.fromEntries(conflicts.map((item) => [item.path, 'remote'])))}>Vybrať všade server</button>
      <span>Vybrané {selected} z {conflicts.length}</span>
      <button type="button" disabled={!complete} onClick={() => onResolve(choices)}>Uložiť vybrané verzie</button>
    </div>
  </section>;
}
