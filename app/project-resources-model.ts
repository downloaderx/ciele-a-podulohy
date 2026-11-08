export type ProjectResource = {
  id: string;
  kind: 'link' | 'document' | 'note';
  title: string;
  content: string;
  ownerId: string;
  createdAt: string;
  deletedAt?: string;
  localPath?: string;
  file?: { key: string; name: string; size: number; mime: string };
};

export const projectFileMaxBytes = 3_000_000;
export const projectFileTypes: Record<string, string> = {
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function projectFileMime(name: string) { return projectFileTypes[name.split('.').pop()?.toLowerCase() ?? '']; }

export function projectFileUrl(goalId: string, resourceId: string) {
  return `/api/project-files?goalId=${encodeURIComponent(goalId)}&resourceId=${encodeURIComponent(resourceId)}`;
}

export function resourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    return url.href;
  } catch { return; }
}

export function validProjectResources(value: unknown): value is ProjectResource[] {
  if (!Array.isArray(value) || value.length > 100) return false;
  const ids = new Set<string>();
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const r = item as ProjectResource;
    if (typeof r.id !== 'string' || !r.id || r.id.length > 200 || ids.has(r.id) ||
      !['link', 'document', 'note'].includes(r.kind) || !['person-1', 'person-2'].includes(r.ownerId) ||
      typeof r.title !== 'string' || !r.title.trim() || r.title.length > 200 ||
      typeof r.content !== 'string' || (!r.file && !r.content.trim()) || r.content.length > 10000 ||
      typeof r.createdAt !== 'string' || r.createdAt.length > 64 || !Number.isFinite(Date.parse(r.createdAt)) ||
      (r.deletedAt !== undefined && (typeof r.deletedAt !== 'string' || r.deletedAt.length > 64 || !Number.isFinite(Date.parse(r.deletedAt)))) ||
      (!r.file && r.kind !== 'note' && (r.content.length > 2048 || !resourceUrl(r.content)))) return false;
    if (r.localPath !== undefined && (typeof r.localPath !== 'string' || !r.localPath.trim() || r.localPath.length > 1000 || /[\r\n\x00]/.test(r.localPath) || !r.file)) return false;
    if (r.file && (r.kind !== 'document' || typeof r.file.key !== 'string' || !/^[a-f0-9]{64}\/[a-f0-9-]{36}$/.test(r.file.key) ||
      typeof r.file.name !== 'string' || !r.file.name || r.file.name.length > 255 || /[\r\n\x00]/.test(r.file.name) ||
      !Number.isInteger(r.file.size) || r.file.size < 1 || r.file.size > projectFileMaxBytes ||
      typeof r.file.mime !== 'string' || !projectFileMime(r.file.name) || r.file.mime !== projectFileMime(r.file.name))) return false;
    ids.add(r.id);
    return true;
  });
}

// Older clients omitting this new field must never erase attached material.
export function retainProjectResources(previous: ProjectResource[] = [], incoming: ProjectResource[] = []): ProjectResource[] {
  const resources = new Map(previous.map((item) => [item.id, item]));
  incoming.forEach((item) => resources.set(item.id, item));
  return [...resources.values()];
}
