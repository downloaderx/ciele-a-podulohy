import { ApiError, checkOrigin, checkExpectedProfile, errorResponse, requirePerson, supabase } from '../../server-storage';
import { readBoard, stateKey } from '../../server-board';
import { saveServerBackup } from '../../server-backups';
import { authorizedState } from '../../state-access';
import { isValidState, visibleState } from '../../state-sync';

export const dynamic = 'force-dynamic';
const headers = { 'cache-control': 'no-store' };

export async function GET(request: Request) {
  try {
    const personId = await requirePerson();
    checkExpectedProfile(request, personId);
    const state = await readBoard(personId);
    return Response.json({ data: visibleState(state.data, personId), revision: state.revision }, { headers });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request);
    const personId = await requirePerson();
    checkExpectedProfile(request, personId);
    if (Number(request.headers.get('content-length')) > 2_000_000) throw new ApiError(413, 'Záloha je príliš veľká.');
    const raw = await request.text();
    if (raw.length > 2_000_000) throw new ApiError(413, 'Záloha je príliš veľká.');
    const payload = JSON.parse(raw) as { data?: unknown; revision?: unknown };
    if (!payload || !isValidState(payload.data) || !Number.isSafeInteger(payload.revision) || Number(payload.revision) < 0) throw new ApiError(400, 'Neplatné dáta alebo verzia tabule.');
    const previous = await readBoard(personId);
    if (previous.revision !== payload.revision) {
      return Response.json({ data: visibleState(previous.data, personId), revision: previous.revision }, { status: 409, headers });
    }
    const data = authorizedState(previous.data, payload.data, personId);
    if (!isValidState(data)) throw new ApiError(400, 'Výsledný stav je príliš veľký alebo neplatný.');
    // Do not overwrite the current board until its recoverable copy is acknowledged.
    await saveServerBackup(previous);
    const saved = await supabase('/rest/v1/rpc/save_app_state', {
      method: 'POST', body: JSON.stringify({ p_id: stateKey, p_expected_revision: payload.revision, p_data: data }),
    });
    if (!saved.ok) throw new ApiError(503, 'Dáta sa neuložili. Skontrolujte migráciu synchronizácie a skúste znova.');
    const result = await saved.json() as { ok: boolean; revision: number };
    if (!result.ok) {
      const latest = await readBoard(personId);
      return Response.json({ data: visibleState(latest.data, personId), revision: latest.revision }, { status: 409, headers });
    }
    return Response.json({ data: visibleState(data, personId), revision: result.revision }, { headers });
  } catch (error) {
    return errorResponse(error instanceof SyntaxError ? new ApiError(400, 'Neplatný JSON.') : error);
  }
}
