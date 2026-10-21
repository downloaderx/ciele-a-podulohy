import type { AppStateData } from './page-model';
import { isValidState } from './state-sync';

const key = 'acorns-acknowledged-board';
export type AcknowledgedBoard = { data: AppStateData; revision: number };

export function readAcknowledgedBoard(storage: Pick<Storage, 'getItem'>): AcknowledgedBoard | null {
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null') as AcknowledgedBoard | null;
    return value && isValidState(value.data) && Number.isSafeInteger(value.revision) && value.revision >= 0 ? value : null;
  } catch { return null; }
}

export function rememberAcknowledgedBoard(storage: Pick<Storage, 'getItem' | 'setItem'>, board: AcknowledgedBoard) {
  try {
    const old = readAcknowledgedBoard(storage);
    // Concurrent tabs may finish reads out of order. Never replace a newer acknowledgement.
    if (!old || old.revision <= board.revision) storage.setItem(key, JSON.stringify(board));
  } catch { /* A full cache cannot prevent server saving. */ }
}
