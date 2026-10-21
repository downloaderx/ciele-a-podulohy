// Only board data: never include unrelated storage, credentials or session keys.
export function collectLocalRecovery(storage: Pick<Storage, 'length' | 'key' | 'getItem'>) {
  const exact = new Set(['ciele-goals', 'ciele-people', 'ciele-activity-log', 'ciele-goal-rankings', 'acorns-state-person-1', 'acorns-state-person-2', 'ciele-state-backups-person-1', 'ciele-state-backups-person-2']);
  const versions: Record<string, unknown> = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key || (!exact.has(key) && !/^acorns-recovery-person-[12]-\d+$/.test(key))) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try { versions[key] = JSON.parse(raw); } catch { versions[key] = raw; }
  }
  return versions;
}

// Preserve both profiles before startup synchronization can refresh their caches.
export function preserveLocalRecovery(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  for (const id of ['person-1', 'person-2']) {
    try {
      const key = 'acorns-recovery-' + id + '-0';
      const raw = storage.getItem('acorns-state-' + id);
      if (raw !== null && storage.getItem(key) === null) storage.setItem(key, raw);
    } catch { /* Storage quota must not interrupt normal loading. */ }
  }
}
