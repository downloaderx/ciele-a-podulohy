'use client';

import { useState, type FormEvent } from 'react';
import { createId } from './page-model';
import { projectFileMaxBytes, projectFileMime, projectFileUrl, resourceUrl, type ProjectResource } from './project-resources-model';

type Props = {
  goalId: string;
  resources?: ProjectResource[];
  editMode?: boolean;
  personId?: string;
  onSave?: (resource: ProjectResource) => void;
  onRemove?: (id: string) => void;
};

const labels = { link: 'Odkaz', document: 'Dokument', note: 'Poznámka' };

export function ProjectResources({ goalId, resources = [], editMode = false, personId, onSave, onRemove }: Props) {
  const [editor, setEditor] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const live = resources.filter((resource) => !resource.deletedAt);
  const selected = live.find((resource) => resource.id === editor);
  return <section className="project-resources" aria-label="Podklady projektu">
    <div className="simple-items-heading"><h3>Podklady</h3><span>{live.length}</span></div>
    {!live.length && <p className="resources-empty">Odkazy, dokumenty a poznámky k tomuto projektu na jednom mieste.</p>}
    <ul className="resource-list">{live.map((resource) => <li key={resource.id}>
      <span className="resource-type">{labels[resource.kind]}</span>
      {resource.kind === 'note' ? <details className="resource-note"><summary>{resource.title}</summary><p>{resource.content}</p></details> : <>
        {resource.localPath ? <>
          <strong className="resource-title">{resource.title}</strong>
          <span className="resource-host">Originál v PC</span><code className="resource-local-path">{resource.localPath}</code>
          <button type="button" className="resource-copy-path" onClick={async () => {
            try { await navigator.clipboard.writeText(resource.localPath!); setCopyMessage('Cesta k súboru je skopírovaná. Vlož ju do Prieskumníka.'); }
            catch { setCopyMessage('Cestu označ a skopíruj ručne.'); }
          }}>Skopírovať cestu</button>
          <a className="resource-backup" href={projectFileUrl(goalId, resource.id)}>Stiahnuť záložnú kópiu z appky</a>
        </> : <>
          <a href={resource.file ? projectFileUrl(goalId, resource.id) : resourceUrl(resource.content)} target={resource.file ? undefined : '_blank'} rel="noopener noreferrer">{resource.title}<span aria-hidden="true"> {resource.file ? '↓' : '↗'}</span></a>
          <span className="resource-host">{resource.file ? `${resource.file.name} · ${Math.ceil(resource.file.size / 1024)} kB` : new URL(resource.content).hostname}</span>
        </>}
      </>}
      {editMode && <div className="resource-actions">
        <button type="button" aria-label={'Upraviť podklad: ' + resource.title} onClick={() => setEditor(resource.id)}>Upraviť</button>
        <button type="button" aria-label={'Odobrať podklad: ' + resource.title} onClick={() => onRemove?.(resource.id)}>Odobrať</button>
      </div>}
    </li>)}</ul>
    {copyMessage && <p role="status" className="resource-message">{copyMessage}</p>}
    {editMode && personId && onSave && <>
      {editor !== null ? <ResourceForm key={selected?.id ?? 'new'} resource={selected} goalId={goalId} personId={personId}
        onSave={(resource) => { onSave(resource); setEditor(null); }} onCancel={() => setEditor(null)} /> :
        <button type="button" disabled={resources.length >= 100} className="resource-add" onClick={() => setEditor('new')}>＋ Pridať podklad</button>}
      {resources.some((resource) => resource.deletedAt) && <details className="resource-removed"><summary>Odobraté podklady</summary><ul>{resources.filter((resource) => resource.deletedAt).map((resource) => <li key={resource.id}><span>{resource.title}</span><button type="button" onClick={() => { const restored = { ...resource }; delete restored.deletedAt; onSave(restored); }}>Obnoviť</button></li>)}</ul></details>}
    </>}
  </section>;
}

function ResourceForm({ resource, goalId, personId, onSave, onCancel }: {
  resource?: ProjectResource; goalId: string; personId: string; onSave: (resource: ProjectResource) => void; onCancel: () => void;
}) {
  const [kind, setKind] = useState<ProjectResource['kind']>(resource?.kind ?? 'link');
  const [title, setTitle] = useState(resource?.title ?? '');
  const [content, setContent] = useState(resource?.content ?? '');
  const [error, setError] = useState('');
  const [fileMode, setFileMode] = useState(Boolean(resource?.file));
  const [file, setFile] = useState<File | null>(null);
  const [localPath, setLocalPath] = useState(resource?.localPath ?? '');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (fileMode) {
      if (!file && resource?.file) { onSave({ ...resource, title: title.trim() || resource.file.name, localPath: localPath.trim() || undefined }); return; }
      if (!file || !projectFileMime(file.name) || file.size < 1 || file.size > projectFileMaxBytes) { setError('Vyber PDF, Office dokument, obrázok alebo text do 3 MB.'); return; }
      setBusy(true);
      try {
        const form = new FormData(); form.set('goalId', goalId); form.set('file', file); form.set('title', title); form.set('localPath', localPath.trim());
        const response = await fetch('/api/project-files', { method: 'POST', headers: { 'x-acorns-person-id': personId }, body: form });
        const result = await response.json() as { resource?: ProjectResource; error?: string };
        if (!response.ok || !result.resource) throw new Error(result.error ?? 'Nahratie sa nepodarilo.');
        onSave(result.resource);
      } catch (error) { setError(error instanceof Error ? error.message : 'Nahratie sa nepodarilo.'); }
      finally { setBusy(false); }
      return;
    }
    const body = kind === 'note' ? content.trim() : resourceUrl(content);
    if (body && kind !== 'note' && body.length > 2048) { setError('Odkaz je príliš dlhý.'); return; }
    if (!body) { setError(kind === 'note' ? 'Napíš poznámku.' : 'Vlož úplný odkaz začínajúci https:// alebo http://.'); return; }
    onSave({ id: resource?.id ?? createId(), kind, title: title.trim() || (kind === 'note' ? body.split('\n')[0].slice(0, 80) : new URL(body).hostname),
      content: body, ownerId: resource?.ownerId ?? personId, createdAt: resource?.createdAt ?? new Date().toISOString() });
  }
  return <form className="resource-form" onSubmit={submit} aria-label={resource ? 'Upraviť podklad' : 'Pridať podklad'}>
    <label>Typ podkladu<select disabled={busy || Boolean(resource?.file)} value={fileMode ? 'file' : kind} onChange={(event) => { setFileMode(event.target.value === 'file'); if (event.target.value !== 'file') setKind(event.target.value as ProjectResource['kind']); setError(''); }}>
      <option value="link">Odkaz</option><option value="document">Dokument – odkaz</option><option value="file">Súbor zo zariadenia</option><option value="note">Poznámka</option>
    </select></label>
    <label>Názov (voliteľný)<input maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Napr. Rozpočet alebo naše nápady" /></label>
    {fileMode ? <>
      {!resource?.file && <label>Záložná kópia súboru<input type="file" disabled={busy} required accept=".pdf,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>}
      <label>Cesta k originálu v PC (voliteľná)<input maxLength={1000} value={localPath} onChange={(event) => setLocalPath(event.target.value)} placeholder="C:\\Users\\…\\Dokument.docx" /></label>
      <p>Originál zostáva v PC. Cestu môžeš skopírovať do Prieskumníka; nahratá kópia v appke je samostatná záloha k okamihu nahratia. Zmeny v origináli sa do nej neprenášajú automaticky. Najviac 3 MB.</p>
    </> : kind === 'note' ? <label>Text poznámky<textarea required rows={4} maxLength={10000} value={content} onChange={(event) => setContent(event.target.value)} /></label> :
      <label>{kind === 'document' ? 'Odkaz na dokument' : 'Webová adresa'}<input type="url" required maxLength={2048} value={content} onChange={(event) => setContent(event.target.value)} placeholder="https://…" /></label>}
    {!fileMode && kind === 'document' && <p>Odkaz napríklad na Google Drive, OneDrive alebo iné miesto, kde máte dokument.</p>}
    {error && <p role="alert">{error}</p>}
    <div><button type="submit" disabled={busy || (fileMode ? !file && !resource?.file : !content.trim())}>{busy ? 'Nahrávam…' : resource ? 'Uložiť úpravy' : 'Pridať podklad'}</button><button disabled={busy} type="button" onClick={onCancel}>Zrušiť</button></div>
  </form>;
}
