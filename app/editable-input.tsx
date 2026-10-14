'use client';
import { useState, type InputHTMLAttributes } from 'react';

// A remote update must appear immediately when idle and must not overwrite a draft.
export function EditableInput({ value, onCommit, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string; onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [start, setStart] = useState(value);
  const changedRemotely = draft !== null && value !== start;
  return <>
    <input {...props} value={draft ?? value}
      onFocus={() => { setStart(value); setDraft(value); }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== start && !changedRemotely) { onCommit(draft); setDraft(null); }
        else if (!changedRemotely || draft === start) setDraft(null);
      }} />
    {changedRemotely && draft !== start ? <span className="field-conflict" role="alert">
      Na serveri: {value}
      <button type="button" onClick={() => { onCommit(draft!); setDraft(null); }}>Použiť môj text</button>
      <button type="button" onClick={() => setDraft(null)}>Použiť serverový text</button>
    </span> : null}
  </>;
}
