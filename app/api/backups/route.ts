import { checkOrigin, errorResponse, requirePerson } from '../../server-storage';
import { readBoard } from '../../server-board';
import { listServerBackups, readServerBackup, saveServerBackup } from '../../server-backups';
import { visibleState } from '../../state-sync';

export const dynamic = 'force-dynamic';
const headers = { 'cache-control': 'no-store' };

export async function GET(request: Request) {
  try {
    const personId = await requirePerson();
    const revision = new URL(request.url).searchParams.get('revision');
    if (revision !== null) {
      const backup = await readServerBackup(Number(revision));
      return Response.json({ version: 1, exportedAt: new Date().toISOString(), backedUpAt: backup.updated_at, revision: backup.revision, data: visibleState(backup.data, personId) }, { headers });
    }
    return Response.json({ backups: await listServerBackups() }, { headers });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const personId = await requirePerson();
    const version = await readBoard(personId);
    await saveServerBackup(version);
    return Response.json({ revision: version.revision, backups: await listServerBackups() }, { headers });
  } catch (error) { return errorResponse(error); }
}
