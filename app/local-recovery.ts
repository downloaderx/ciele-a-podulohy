// Only board data: never include unrelated storage, credentials or session keys.
export function collectLocalRecovery(storage: Pick<Storage, 'length' | 'key' | 'getItem'>) {
  const exact = new Set(['acorns-acknowledged-board', 'ciele-goals', 'ciele-people', 'ciele-activity-log', 'ciele-goal-rankings', 'acorns-state-person-1', 'acorns-state-person-2', 'ciele-state-backups-person-1', 'ciele-state-backups-person-2', 'acorns-history-person-1', 'acorns-history-person-2', 'acorns-daily-person-1', 'acorns-daily-person-2']);
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
    archiveLocalVersion(storage, id, Date.now(), true);
    try {
      const key = 'acorns-recovery-' + id + '-0';
      const raw = storage.getItem('acorns-state-' + id);
      if (raw !== null && storage.getItem(key) === null) storage.setItem(key, raw);
    } catch { /* Storage quota must not interrupt normal loading. */ }
  }
}

type LocalVersion = { createdAt: number; raw: string };

// Keep up to 12 recent checkpoints and 7 daily versions, with a byte budget for browser storage.
export function archiveLocalVersion(storage: Pick<Storage, 'getItem' | 'setItem'>, personId: string, now = Date.now(), force = false, previousRaw?: string | null) {
  if (!['person-1', 'person-2'].includes(personId)) return;
  try {
    const raw = previousRaw === undefined ? storage.getItem('acorns-state-' + personId) : previousRaw;
    if (raw === null) return;
    const read = (key: string): LocalVersion[] => {
      try {
        const parsed: unknown = JSON.parse(storage.getItem(key) ?? '[]');
        return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v.raw === 'string' && Number.isFinite(v.createdAt)) : [];
      } catch { return []; }
    };
    const bounded = (versions: LocalVersion[], count: number, budget: number) => {
      const kept: LocalVersion[] = []; let size = 0;
      for (const version of versions.slice(0, count)) {
        if (kept.length && size + version.raw.length > budget) break;
        kept.push(version); size += version.raw.length;
      }
      return kept;
    };
    const key = 'acorns-history-' + personId;
    const history = read(key);
    if (history[0]?.raw !== raw && (force || !history[0] || now - history[0].createdAt >= 60000)) {
      storage.setItem(key, JSON.stringify(bounded([{ createdAt: now, raw }, ...history], 12, 300000)));
    }
    const dailyKey = 'acorns-daily-' + personId;
    const daily = read(dailyKey);
    const day = (timestamp: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp));
    if (!daily[0] || day(daily[0].createdAt) !== day(now)) storage.setItem(dailyKey, JSON.stringify(bounded([{ createdAt: now, raw }, ...daily], 7, 200000)));
  } catch { /* A full browser cache must not prevent server synchronization. */ }
}
