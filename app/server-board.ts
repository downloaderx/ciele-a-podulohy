import { ApiError, supabase } from './server-storage';
import { defaultPeople, type AppStateData } from './page-model';
import { isValidState } from './state-sync';

export const stateKey = process.env.SUPABASE_APP_STATE_KEY ?? 'main';
export type BoardVersion = { data: AppStateData; revision: number };

export async function readBoard(personId: string): Promise<BoardVersion> {
  const response = await supabase(`/rest/v1/app_state?id=eq.${encodeURIComponent(stateKey)}&select=data,revision`);
  if (!response.ok) throw new ApiError(503, 'Úložisko nie je pripravené. Skontrolujte databázovú migráciu.');
  const rows = await response.json() as BoardVersion[];
  if (!rows.length) return { data: { activePersonId: personId, people: defaultPeople, goals: [], activityLog: [], goalRankings: {} }, revision: 0 };
  if (!isValidState(rows[0].data)) throw new ApiError(422, 'Serverové dáta majú neplatný formát. Zachovajte zálohu pred opravou.');
  if (!Number.isSafeInteger(rows[0].revision) || rows[0].revision < 0) throw new ApiError(503, 'Chýba migrácia synchronizácie.');
  return rows[0];
}
