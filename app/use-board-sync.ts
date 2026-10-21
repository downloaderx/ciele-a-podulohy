'use client';

import { preserveLocalRecovery } from './local-recovery';

import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultPeople, type AppStateData } from './page-model';
import { isValidState, mergeStates, mergeInitialBoard, visibleState, stableJson, type MergeConflict, type ConflictChoices } from './state-sync';

const empty = (personId = 'person-1'): AppStateData => ({ activePersonId: personId, people: defaultPeople, goals: [], activityLog: [], goalRankings: {} });
const snapshot = (state: AppStateData) => stableJson({ ...state, activePersonId: '' });
const cacheKey = (personId: string) => `acorns-state-${personId}`;
const legacyMigrationKey = 'acorns-legacy-migrated';
const fetchApi = (url: string, init: RequestInit = {}) => fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(20000) });

type ServerState = { data: AppStateData; revision: number };
function serverState(value: unknown): ServerState {
  const payload = value as Partial<ServerState>;
  if (!payload || !isValidState(payload.data) || !Number.isSafeInteger(payload.revision)) throw new Error('Server vrátil neplatné dáta. Lokálne zmeny sú zachované.');
  return payload as ServerState;
}
async function message(response: Response) {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  return payload.error ?? 'Uloženie zlyhalo. Lokálne zmeny sú zachované.';
}

export function useBoardSync(state: AppStateData, apply: (state: AppStateData) => void) {
  const [loaded, setLoaded] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [mode, setMode] = useState<'profiles' | 'supabase'>('supabase');
  const [status, setStatus] = useState('Overujem prihlásenie…');
  const [conflicts, setConflicts] = useState<MergeConflict[]>([]);
  const [recovery, setRecovery] = useState<string | null>(null);
  const latest = useRef(state);
  const base = useRef(empty());
  const revision = useRef<number | null>(null);
  const identity = useRef<string | null>(null);
  const busy = useRef(false);
  const initializing = useRef(false);
  const generation = useRef(0);
  const conflictRef = useRef<{ base: AppStateData; remote: ServerState } | null>(null);
  const syncRef = useRef<() => Promise<void>>(async () => {});

  const replace = useCallback((data: AppStateData) => { latest.current = data; apply(data); }, [apply]);
  const persist = useCallback(() => {
    if (!identity.current) return;
    try {
      window.localStorage.setItem(cacheKey(identity.current), JSON.stringify({ data: latest.current, base: base.current }));
    } catch { setStatus('Prehliadač nedokáže uložiť lokálnu zálohu. Exportujte dáta; serverová synchronizácia sa ďalej skúša.'); }
  }, []);

  const begin = useCallback(async (personId: string) => {
    preserveLocalRecovery(window.localStorage);
    const currentGeneration = ++generation.current;
    initializing.current = true;
    identity.current = personId;
    conflictRef.current = null; setConflicts([]); revision.current = null;
    let local = empty(personId), baseline = empty(personId);
    let legacyOnly = false;
    try {
      const raw = window.localStorage.getItem(cacheKey(personId));
      if (raw) {
        const cached = JSON.parse(raw) as { data?: unknown; base?: unknown };
        if (!isValidState(cached.data) || !isValidState(cached.base)) throw new Error('Poškodená lokálna záloha');
        local = visibleState(cached.data, personId); baseline = visibleState(cached.base, personId);
      } else {
        // The legacy board belongs to this browser, not to each selected profile.
        const goals = window.localStorage.getItem('ciele-goals');
        if (goals && !window.localStorage.getItem(legacyMigrationKey)) {
          const legacy = { activePersonId: personId, goals: JSON.parse(goals),
            people: JSON.parse(window.localStorage.getItem('ciele-people') ?? JSON.stringify(defaultPeople)),
            activityLog: JSON.parse(window.localStorage.getItem('ciele-activity-log') ?? '[]'),
            goalRankings: JSON.parse(window.localStorage.getItem('ciele-goal-rankings') ?? '{}') };
          if (!isValidState(legacy)) throw new Error('Poškodené staršie dáta');
          local = visibleState(legacy, personId); legacyOnly = true;
          // Import only this person's new audit entries; preserve goals without impersonating a partner.
          local.activityLog = local.activityLog.filter((item) => item.actorId === personId);
        }
      }
    } catch {
      const raw = window.localStorage.getItem(cacheKey(personId)) ?? JSON.stringify({
        goals: window.localStorage.getItem('ciele-goals'), people: window.localStorage.getItem('ciele-people'),
        activityLog: window.localStorage.getItem('ciele-activity-log'), goalRankings: window.localStorage.getItem('ciele-goal-rankings'),
      });
      setRecovery(raw);
      try { window.localStorage.setItem(`acorns-recovery-${personId}-${Date.now()}`, raw); } catch { /* Download remains available in memory. */ }
      setStatus('Lokálna záloha je poškodená. Pôvodný obsah si môžete stiahnuť.');
    }
    latest.current = local; base.current = baseline;
    replace(local); setStatus('Načítavam spoločnú tabuľu…');
    try {
      const response = await fetchApi('/api/state');
      if (!response.ok) throw new Error(await message(response));
      if (generation.current !== currentGeneration) return;
      const remote = serverState(await response.json());
      if (generation.current !== currentGeneration) return;
      // An established server board must never be repopulated by the obsolete pre-sync cache.
      // That untouched cache remains available for explicit recovery.
      const merged = mergeInitialBoard(baseline, latest.current, remote.data, legacyOnly);
      // Keep the legacy source intact as a backup; import it only once per browser.
      window.localStorage.setItem(legacyMigrationKey, '1');
      if (merged.conflicts.length) {
        conflictRef.current = { base: baseline, remote }; setConflicts(merged.conflicts);
        setStatus('Našli sa rozdielne úpravy. Vyberte verziu sporných polí.');
      } else {
        base.current = remote.data; revision.current = remote.revision; replace(merged.state);
        setStatus('Dáta načítané.');
      }
      persist();
    } catch (error) {
      if (generation.current === currentGeneration) setStatus(error instanceof Error ? error.message : 'Server je nedostupný. Zmeny zostávajú lokálne.');
    } finally { if (generation.current === currentGeneration) { initializing.current = false; setAuthenticated(true); setLoaded(true); } }
  }, [persist, replace]);

  useEffect(() => {
    let cancelled = false;
    void fetchApi('/api/session').then(async (response) => {
      if (cancelled) return;
      if (response.ok) {
        const payload = await response.json() as { personId: string | null; mode: 'profiles' | 'supabase' };
        if (cancelled) return;
        setMode(payload.mode);
        if (payload.personId) await begin(payload.personId);
        else { setStatus(''); setLoaded(true); }
      } else {
        setStatus(response.status === 401 ? '' : await message(response)); setLoaded(true);
      }
    }).catch(() => { if (!cancelled) { setStatus('Prihlásenie sa nepodarilo overiť. Skúste znova.'); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [begin]);

  const synchronize = useCallback(async () => {
    if (busy.current || initializing.current || !identity.current || conflictRef.current) return;
    busy.current = true;
    const currentGeneration = generation.current;
    try {
      // Always read before writing; CAS additionally protects the read/write race.
      const response = await fetchApi('/api/state');
      if (generation.current !== currentGeneration) return;
      if (response.status === 401) { identity.current = null; setAuthenticated(false); replace(empty()); throw new Error(await message(response)); }
      if (!response.ok) throw new Error(await message(response));
      const remote = serverState(await response.json());
      if (generation.current !== currentGeneration) return;
      const merged = mergeStates(base.current, latest.current, remote.data);
      if (merged.conflicts.length) {
        conflictRef.current = { base: base.current, remote }; setConflicts(merged.conflicts);
        setStatus('Rovnaké pole bolo upravené na viacerých zariadeniach. Vyberte verziu.'); return;
      }
      base.current = remote.data; revision.current = remote.revision;
      if (snapshot(latest.current) !== snapshot(merged.state)) replace(merged.state);
      if (snapshot(latest.current) === snapshot(base.current)) { setStatus('Všetky zmeny sú uložené.'); persist(); return; }
      const sent = latest.current;
      setStatus('Ukladám zmeny…');
      const saved = await fetchApi('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: sent, revision: revision.current }) });
      if (generation.current !== currentGeneration) return;
      if (saved.status === 409) { setStatus('Na serveri pribudla zmena. Zlučujem pri ďalšom pokuse…'); return; }
      if (!saved.ok) throw new Error(await message(saved));
      const acknowledged = serverState(await saved.json());
      // Edits made while the request was running are rebased, never discarded.
      const rebased = mergeStates(sent, latest.current, acknowledged.data);
      if (rebased.conflicts.length) {
        conflictRef.current = { base: sent, remote: acknowledged }; setConflicts(rebased.conflicts);
        setStatus('Server upravil sporné polia. Vyberte verziu.'); return;
      }
      base.current = acknowledged.data; revision.current = acknowledged.revision; replace(rebased.state); persist();
      setStatus(snapshot(rebased.state) === snapshot(acknowledged.data) ? 'Všetky zmeny sú uložené.' : 'Nové zmeny čakajú na uloženie.');
    } catch (error) {
      if (generation.current === currentGeneration) setStatus(error instanceof Error ? error.message : 'Server je nedostupný. Zmeny zostávajú lokálne.');
    } finally { busy.current = false; }
  }, [persist, replace]);

  useEffect(() => { syncRef.current = synchronize; }, [synchronize]);
  useEffect(() => {
    if (!authenticated) return;
    latest.current = state;
    const backup = window.setTimeout(persist, 0);
    const timer = window.setTimeout(() => void syncRef.current(), 500);
    return () => { window.clearTimeout(backup); window.clearTimeout(timer); };
  }, [state, authenticated, persist]);
  useEffect(() => {
    if (!authenticated) return;
    const run = () => void syncRef.current();
    const interval = window.setInterval(run, 8000);
    window.addEventListener('online', run); window.addEventListener('focus', run);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (conflictRef.current || snapshot(latest.current) !== snapshot(base.current)) { event.preventDefault(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.clearInterval(interval); window.removeEventListener('online', run); window.removeEventListener('focus', run); window.removeEventListener('beforeunload', beforeUnload); };
  }, [authenticated]);

  async function login(email: string, password: string) {
    const response = await fetchApi('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (!response.ok) throw new Error(await message(response));
    const payload = await response.json() as { personId: string }; await begin(payload.personId);
  }
  async function chooseProfile(personId: string) {
    const response = await fetchApi('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ personId }) });
    if (!response.ok) throw new Error(await message(response));
    const payload = await response.json() as { personId: string }; await begin(payload.personId);
  }
  async function logout(keepPending = false) {
    if (!keepPending && (conflictRef.current || snapshot(latest.current) !== snapshot(base.current))) {
      setStatus('Pred odhlásením uložte zmeny alebo exportujte zálohu.'); return;
    }
    const response = await fetchApi('/api/session', { method: 'DELETE' });
    if (!response.ok) { setStatus(await message(response)); return; }
    // Retain the baseline so returning to a profile rebases against the server.
    persist();
    generation.current++; identity.current = null;
    conflictRef.current = null; setConflicts([]);
    replace(empty()); setAuthenticated(false); setStatus('');
  }
  function resolve(prefer: 'local' | 'remote' | ConflictChoices) {
    const pending = conflictRef.current;
    if (!pending) return;
    if (typeof prefer !== 'string' && conflicts.some((conflict) => !prefer[conflict.path])) return;
    const merged = mergeStates(pending.base, latest.current, pending.remote.data, prefer);
    if (typeof prefer !== 'string' && merged.conflicts.some((conflict) => !prefer[conflict.path])) {
      setConflicts(merged.conflicts);
      setStatus('Pribudlo ďalšie sporné pole. Vyberte jeho verziu pred uložením.');
      return;
    }
    base.current = pending.remote.data; revision.current = pending.remote.revision;
    conflictRef.current = null; setConflicts([]); replace(merged.state); persist();
    setStatus('Sporné polia vyriešené. Ukladám zmeny…');
  }
  function conflictVersions() {
    const pending = conflictRef.current;
    return pending ? { local: latest.current, server: pending.remote.data, base: pending.base, serverRevision: pending.remote.revision, conflicts } : null;
  }
  return { loaded, authenticated, mode, status, conflicts, recovery, login, chooseProfile, logout, resolve, conflictVersions, retry: synchronize };
}
