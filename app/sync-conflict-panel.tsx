'use client';
import { useState } from 'react';
import type { ConflictChoices, MergeConflict } from './state-sync';

export function SyncConflictPanel({ open, onClose, conflicts, labelFor, valueFor, onResolve, onDownload }: {
  open: boolean; onClose: () => void;
  conflicts: MergeConflict[]; labelFor: (path: string) => string; valueFor: (value: unknown) => string;
  onResolve: (choices: ConflictChoices) => void; onDownload: () => void;
}) {
  const [choices, setChoices] = useState<ConflictChoices>({});
  const selected = conflicts.filter((conflict) => choices[conflict.path]).length;
  function choose(next: ConflictChoices) {
    setChoices(next);
    if (conflicts.every((conflict) => next[conflict.path])) onResolve(next);
  }
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation"><section className="dialog-card data-modal sync-conflict-dialog" role="dialog" aria-modal="true" aria-label="Riešenie rozdielnych úprav" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
    <div className="modal-heading"><h2>Rozdielne úpravy</h2><button autoFocus className="icon-button compact" type="button" aria-label="Zatvoriť rozdielne úpravy" onClick={onClose}>×</button></div>
    <p>Pri každom poli vyber, ktorú verziu zachovať. Po poslednom výbere sa voľby automaticky uložia a upozornenie zmizne.</p>
    <div className="sync-conflict-fields">{conflicts.map((conflict) => <fieldset key={conflict.path}>
      <legend>{labelFor(conflict.path)}</legend>
      {(['local', 'remote'] as const).map((side) => <label key={side}>
        <input type="radio" name={'conflict-' + conflict.path} checked={choices[conflict.path] === side} onChange={() => choose({ ...choices, [conflict.path]: side })} />
        <span><strong>{side === 'local' ? 'Toto zariadenie' : 'Server'}</strong><span className="sync-conflict-value">{valueFor(conflict[side])}</span></span>
      </label>)}
    </fieldset>)}</div>
    <div className="sync-conflict-actions">
      <button type="button" onClick={onDownload}>Stiahnuť obe verzie</button>
      <button type="button" onClick={() => choose(Object.fromEntries(conflicts.map((item) => [item.path, 'local'])))}>Všade použiť miestnu verziu</button>
      <button type="button" onClick={() => choose(Object.fromEntries(conflicts.map((item) => [item.path, 'remote'])))}>Všade použiť serverovú verziu</button>
      <span>Zostáva vybrať: {conflicts.length - selected}</span>
    </div>
  </section></div>;
}
