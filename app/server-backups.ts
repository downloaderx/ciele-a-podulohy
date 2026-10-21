import { ApiError, supabase } from './server-storage';
import { stateKey, type BoardVersion } from './server-board';
import { isValidState } from './state-sync';

// Separate immutable rows in the existing private table; no schema migration is required.
const prefix = `${stateKey}:backup:`;
const backupId = (revision: number) => `${prefix}${revision}`;
export type ServerBackup = { revision: number; updated_at: string };

export async function saveServerBackup(version: BoardVersion) {
  if (version.revision === 0) return;
  const response = await supabase('/rest/v1/app_state?on_conflict=id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ id: backupId(version.revision), revision: version.revision, data: version.data }),
  });
  if (!response.ok) throw new ApiError(503, 'Serverovú zálohu sa nepodarilo vytvoriť. Tabuľa sa neprepísala; zmeny zostávajú lokálne.');
}

export async function listServerBackups(): Promise<ServerBackup[]> {
  const pattern = prefix.replace(/[\\%_*]/g, '\\$&') + '%';
  const response = await supabase(`/rest/v1/app_state?id=like.${encodeURIComponent(pattern)}&select=revision,updated_at&order=revision.desc&limit=100`);
  if (!response.ok) throw new ApiError(503, 'Históriu záloh sa nepodarilo načítať.');
  const rows = await response.json() as ServerBackup[];
  if (!Array.isArray(rows) || rows.some((row) => !Number.isSafeInteger(row.revision) || row.revision < 1 || !Number.isFinite(Date.parse(row.updated_at)))) throw new ApiError(503, 'História záloh má neplatný formát.');
  return rows;
}

export async function readServerBackup(revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new ApiError(400, 'Neplatná verzia zálohy.');
  const response = await supabase(`/rest/v1/app_state?id=eq.${encodeURIComponent(backupId(revision))}&select=data,revision,updated_at`);
  if (!response.ok) throw new ApiError(503, 'Zálohu sa nepodarilo načítať.');
  const rows = await response.json() as (BoardVersion & { updated_at: string })[];
  if (!rows.length) throw new ApiError(404, 'Táto záloha neexistuje.');
  if (rows[0].revision !== revision || !isValidState(rows[0].data)) throw new ApiError(422, 'Záloha má neplatný formát.');
  return rows[0];
}
