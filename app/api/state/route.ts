import { ApiError, checkOrigin, errorResponse, requirePerson, supabase } from '../../server-storage';
import { defaultPeople, type AppStateData } from '../../page-model';
import { authorizedState } from '../../state-access';
import { isValidState, visibleState } from '../../state-sync';

export const dynamic = 'force-dynamic';
const stateKey = process.env.SUPABASE_APP_STATE_KEY ?? 'main';
const headers = { 'cache-control': 'no-store' };
const emptyState = (personId: string): AppStateData => ({ activePersonId: personId, people: defaultPeople, goals: [], activityLog: [], goalRankings: {} });

async function readState(personId: string) {
  const response = await supabase(`/rest/v1/app_state?id=eq.${encodeURIComponent(stateKey)}&select=data,revision`);
  if (!response.ok) throw new ApiError(503, 'Úložisko nie je pripravené. Skontrolujte databázovú migráciu.');
  const rows = await response.json() as { data: unknown; revision: number }[];
  if (!rows.length) return { data: emptyState(personId), revision: 0 };
  if (!isValidState(rows[0].data)) throw new ApiError(422, 'Serverové dáta majú neplatný formát. Zachovajte zálohu a opravte ich pred ukladaním.');
  if (!Number.isSafeInteger(rows[0].revision)) throw new ApiError(503, 'Chýba migrácia synchronizácie.');
  return { data: rows[0].data, revision: rows[0].revision };
}

export async function GET() {
  try {
    const personId = await requirePerson();
    const state = await readState(personId);
    return Response.json({ data: visibleState(state.data, personId), revision: state.revision }, { headers });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const personId = await requirePerson();
    if (Number(request.headers.get('content-length')) > 2_000_000) throw new ApiError(413, 'Záloha je príliš veľká.');
    const raw = await request.text();
    if (raw.length > 2_000_000) throw new ApiError(413, 'Záloha je príliš veľká.');
    const payload = JSON.parse(raw) as { data?: unknown; revision?: unknown };
    if (!payload || !isValidState(payload.data) || !Number.isSafeInteger(payload.revision) || Number(payload.revision) < 0) throw new ApiError(400, 'Neplatné dáta alebo verzia tabule.');
    const previous = await readState(personId);
    if (previous.revision !== payload.revision) {
      return Response.json({ data: visibleState(previous.data, personId), revision: previous.revision }, { status: 409, headers });
    }
    const data = authorizedState(previous.data, payload.data, personId);
    if (!isValidState(data)) throw new ApiError(400, 'Výsledný stav je príliš veľký alebo neplatný.');
    const saved = await supabase('/rest/v1/rpc/save_app_state', {
      method: 'POST', body: JSON.stringify({ p_id: stateKey, p_expected_revision: payload.revision, p_data: data }),
    });
    if (!saved.ok) throw new ApiError(503, 'Dáta sa neuložili. Skontrolujte migráciu synchronizácie a skúste znova.');
    const result = await saved.json() as { ok: boolean; revision: number };
    if (!result.ok) {
      const latest = await readState(personId);
      return Response.json({ data: visibleState(latest.data, personId), revision: latest.revision }, { status: 409, headers });
    }
    return Response.json({ data: visibleState(data, personId), revision: result.revision }, { headers });
  } catch (error) {
    return errorResponse(error instanceof SyntaxError ? new ApiError(400, 'Neplatný JSON.') : error);
  }
}
