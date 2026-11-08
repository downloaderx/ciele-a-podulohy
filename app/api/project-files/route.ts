import { createHash, randomUUID } from 'node:crypto';
import { ApiError, checkOrigin, checkExpectedProfile, errorResponse, requirePerson, supabase } from '../../server-storage';
import { readBoard, stateKey } from '../../server-board';
import { saveServerBackup } from '../../server-backups';
import { authorizedState } from '../../state-access';
import { isValidState } from '../../state-sync';
import { projectFileMaxBytes, projectFileMime, type ProjectResource } from '../../project-resources-model';

export const dynamic = 'force-dynamic';
const bucket = 'foxies-project-files';
const prefix = (goalId: string) => createHash('sha256').update(goalId).digest('hex');
const objectPath = (key: string) => key.split('/').map(encodeURIComponent).join('/');

async function ensureBucket() {
  const found = await supabase(`/storage/v1/bucket/${bucket}`);
  if (found.ok) {
    const info = await found.json() as { public?: boolean };
    if (info.public !== false) throw new ApiError(503, 'Úložisko dokumentov musí byť súkromné.');
    return;
  }
  if (found.status !== 404 && found.status !== 400) throw new ApiError(503, 'Úložisko dokumentov je nedostupné.');
  const created = await supabase('/storage/v1/bucket', { method: 'POST', body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: projectFileMaxBytes }) });
  if (!created.ok) {
    const retry = await supabase(`/storage/v1/bucket/${bucket}`);
    if (!retry.ok || (await retry.json() as { public?: boolean }).public !== false) throw new ApiError(503, 'Úložisko dokumentov sa nepodarilo pripraviť.');
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const personId = await requirePerson();
    checkExpectedProfile(request, personId);
    if (Number(request.headers.get('content-length')) > projectFileMaxBytes + 100_000) throw new ApiError(413, 'Súbor môže mať najviac 3 MB.');
    const form = await request.formData();
    const goalId = form.get('goalId');
    const file = form.get('file');
    if (typeof goalId !== 'string' || !(file instanceof File)) throw new ApiError(400, 'Vyber dokument a projekt.');
    if (file.size < 1 || file.size > projectFileMaxBytes) throw new ApiError(413, 'Súbor musí byť neprázdny a mať najviac 3 MB.');
    const localPath = String(form.get('localPath') ?? '').trim();
    if (localPath.length > 1000 || /[\r\n\x00]/.test(localPath)) throw new ApiError(400, 'Neplatná cesta k lokálnemu súboru.');
    const mime = projectFileMime(file.name);
    if (!mime || file.name.length > 255 || /[\r\n\x00]/.test(file.name)) throw new ApiError(400, 'Podporované sú PDF, Office dokumenty, obrázky a textové súbory.');
    const initial = await readBoard(personId);
    const allowed = initial.data.goals.find((goal) => goal.id === goalId && !goal.deletedAt && (!goal.category || goal.category === 'plan'));
    if (!allowed || (allowed.spaceId && !['shared', personId].includes(allowed.spaceId))) throw new ApiError(403, 'Do tohto projektu nemôžeš pridávať súbory.');
    if ((allowed.resources?.length ?? 0) >= 100) throw new ApiError(400, 'Projekt už má maximálny počet podkladov.');
    await ensureBucket();
    const id = randomUUID(), key = `${prefix(goalId)}/${id}`;
    const uploaded = await supabase(`/storage/v1/object/${bucket}/${objectPath(key)}`, { method: 'POST', headers: { 'content-type': mime, 'x-upsert': 'false' }, body: await file.arrayBuffer() });
    if (!uploaded.ok) throw new ApiError(503, 'Dokument sa nepodarilo nahrať. Skús to znova.');
    const resource: ProjectResource = { id, kind: 'document', title: String(form.get('title') ?? '').trim().slice(0, 200) || file.name,
      content: '', ...(localPath ? { localPath } : {}), ownerId: personId, createdAt: new Date().toISOString(), file: { key, name: file.name, size: file.size, mime } };
    for (let attempt = 0; attempt < 3; attempt++) {
      const previous = attempt ? await readBoard(personId) : initial;
      const target = previous.data.goals.find((goal) => goal.id === goalId && !goal.deletedAt);
      if (!target || (target.spaceId && !['shared', personId].includes(target.spaceId))) throw new ApiError(409, 'Projekt sa medzitým zmenil. Obnov stránku a skús to znova.');
      const incoming = { ...previous.data, goals: previous.data.goals.map((goal) => goal.id === goalId ? { ...goal, resources: [...(goal.resources ?? []), resource] } : goal) };
      const data = authorizedState(previous.data, incoming, personId);
      if (!isValidState(data)) throw new ApiError(400, 'Projekt má príliš veľa podkladov.');
      await saveServerBackup(previous);
      const saved = await supabase('/rest/v1/rpc/save_app_state', { method: 'POST', body: JSON.stringify({ p_id: stateKey, p_expected_revision: previous.revision, p_data: data }) });
      if (!saved.ok) throw new ApiError(503, 'Dokument sa nahral, ale pripojenie k projektu zlyhalo. Skús znova.');
      if ((await saved.json() as { ok: boolean }).ok) return Response.json({ resource }, { headers: { 'cache-control': 'no-store' } });
    }
    throw new ApiError(409, 'Projekt práve upravuje aj niekto iný. Skús dokument pridať znova.');
  } catch (error) { return errorResponse(error); }
}

export async function GET(request: Request) {
  try {
    const personId = await requirePerson();
    const url = new URL(request.url);
    const goalId = url.searchParams.get('goalId'), resourceId = url.searchParams.get('resourceId');
    const board = await readBoard(personId);
    const goal = board.data.goals.find((item) => item.id === goalId && !item.deletedAt);
    const resource = goal?.resources?.find((item) => item.id === resourceId && !item.deletedAt);
    if (!goal || !resource?.file || resource.file.key !== `${prefix(goal.id)}/${resource.id}`) throw new ApiError(404, 'Dokument sa nenašiel.');
    const object = await supabase(`/storage/v1/object/authenticated/${bucket}/${objectPath(resource.file.key)}`);
    if (!object.ok) throw new ApiError(404, 'Dokument momentálne nie je dostupný.');
    return new Response(object.body, { headers: { 'content-type': 'application/octet-stream', 'x-content-type-options': 'nosniff',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(resource.file.name)}`, 'cache-control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
