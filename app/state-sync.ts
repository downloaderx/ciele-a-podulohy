import { validGratitudeDay } from './gratitude';
import type { AppStateData, Goal, Task } from './page-model';

const personIds = ['person-1', 'person-2'];
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown, max = 20000): value is string => typeof value === 'string' && value.length <= max;
const date = (value: unknown) => value === undefined || (string(value, 64) && Number.isFinite(Date.parse(value)));
const ratings = (value: unknown) => record(value) && Object.entries(value).every(([key, score]) =>
  personIds.includes(key) && typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 5);

export function isValidState(value: unknown): value is AppStateData {
  if (!record(value) || !personIds.includes(String(value.activePersonId)) || !Array.isArray(value.people) ||
      value.people.length !== 2 || !Array.isArray(value.goals) || !Array.isArray(value.activityLog) ||
      value.activityLog.length > 1000 || !record(value.goalRankings)) return false;
  const people = value.people;
  if (!personIds.every((id) => people.filter((person: unknown) => record(person) && person.id === id).length === 1)) return false;
  if (!people.every((person: unknown) => record(person) && string(person.name, 100) && string(person.tone, 64) && string(person.avatarId, 100))) return false;
  const ids = new Set<string>();
  let count = 0;
  function validTask(task: unknown, depth: number): boolean {
    if (++count > 10000 || depth > 30 || !record(task) || !string(task.id, 200) || !task.id || ids.has(task.id) ||
        !string(task.title) || !personIds.includes(String(task.ownerId)) ||
        (task.updatedById !== undefined && !personIds.includes(String(task.updatedById))) ||
        typeof task.done !== 'boolean' || typeof task.expanded !== 'boolean' ||
        (task.kind !== undefined && !['todo', 'rule', 'topic'].includes(String(task.kind))) ||
        (task.choreCadence !== undefined && !['routine', 'occasional'].includes(String(task.choreCadence))) ||
        (task.choreWeight !== undefined && ![1, 3, 5].includes(task.choreWeight as number)) ||
        !date(task.dueAt) || !date(task.deletedAt) || !Array.isArray(task.children)) return false;
    if (task.choreCompletions !== undefined) {
      if (!Array.isArray(task.choreCompletions) || task.choreCompletions.length > 200) return false;
      const completionIds = new Set<string>();
      if (!task.choreCompletions.every((entry: unknown) => {
        if (!record(entry) || !string(entry.id, 200) || !entry.id || completionIds.has(entry.id) ||
            !personIds.includes(String(entry.personId)) || !string(entry.completedAt, 64) || !date(entry.completedAt) || !date(entry.undoneAt)) return false;
        completionIds.add(entry.id); return true;
      })) return false;
    }
    ids.add(task.id);
    return task.children.every((child) => validTask(child, depth + 1));
  }
  if (!value.goals.every((goal: unknown) => {
    if (!validTask(goal, 0) || !record(goal) || !string(goal.description) ||
        (goal.category !== undefined && !['plan', 'chore', 'errand', 'habit', 'activity', 'care'].includes(String(goal.category))) ||
        (goal.spaceId !== undefined && !['shared', ...personIds].includes(String(goal.spaceId))) ||
        !ratings(goal.importanceByPerson) || (goal.feasibilityByPerson !== undefined && !ratings(goal.feasibilityByPerson)) ||
        !date(goal.lastCompletedAt) || !date(goal.recurrenceStartAt)) return false;
    if (goal.recurrenceHistory !== undefined && (!Array.isArray(goal.recurrenceHistory) || goal.recurrenceHistory.length > 20 || !goal.recurrenceHistory.every(date))) return false;
    return ['recurrenceDays', 'recurrenceToleranceDays'].every((key) => goal[key] === undefined ||
      (typeof goal[key] === 'number' && Number.isInteger(goal[key]) && Number(goal[key]) >= 0 && Number(goal[key]) <= 365));
  })) return false;
  if (value.gratitudeEntries !== undefined) {
    if (!Array.isArray(value.gratitudeEntries) || value.gratitudeEntries.length > 20000) return false;
    const entryIds = new Set<string>();
    if (!value.gratitudeEntries.every((entry: unknown) => {
      if (!record(entry) || !personIds.includes(String(entry.personId)) || !validGratitudeDay(entry.day) ||
          entry.id !== entry.personId + ':' + entry.day || entryIds.has(String(entry.id)) ||
          !string(entry.text, 1000) || !entry.text.trim() || entry.text !== entry.text.trim()) return false;
      entryIds.add(String(entry.id)); return true;
    })) return false;
  }
  const activityIds = new Set<string>();
  if (!value.activityLog.every((item: unknown) => {
    if (!record(item) || !string(item.id, 200) || activityIds.has(item.id) || !personIds.includes(String(item.actorId)) ||
        !string(item.action, 500) || !string(item.target) || !string(item.createdAt, 64) || !date(item.createdAt) ||
        (item.spaceId !== undefined && !['shared', ...personIds].includes(String(item.spaceId)))) return false;
    activityIds.add(item.id); return true;
  })) return false;
  return Object.entries(value.goalRankings).every(([id, ranking]) => personIds.includes(id) && Array.isArray(ranking) &&
    ranking.length <= 10000 && ranking.every((item) => string(item, 200)) && new Set(ranking).size === ranking.length);
}

export function visibleState(state: AppStateData, personId: string): AppStateData {
  const visible = (space: string | undefined) => !space || space === 'shared' || state.people.some((person) => person.id === space);
  const goals = state.goals.filter((goal) => visible(goal.spaceId));
  const ids = new Set(goals.map((goal) => goal.id));
  return { ...state, activePersonId: personId, goals,
    activityLog: state.activityLog.filter((item) => visible(item.spaceId)),
    goalRankings: Object.fromEntries(Object.entries(state.goalRankings).map(([id, ranking]) => [id, ranking.filter((goalId) => ids.has(goalId))])),
  };
}

export type MergeConflict = { path: string; local: unknown; remote: unknown };
export function stableJson(value: unknown): string | undefined {
  const ordered = (item: unknown): unknown => Array.isArray(item) ? item.map(ordered) : record(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, ordered(item[key])])) : item;
  return JSON.stringify(ordered(value));
}
const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);

// Merge changes against the last acknowledged server version, by field and item ID.
// Conflicting edits require an explicit choice before another write is attempted.
export function mergeStates(base: AppStateData, local: AppStateData, remote: AppStateData, prefer: 'local' | 'remote' = 'local') {
  const conflicts: MergeConflict[] = [];
  function merge(b: unknown, l: unknown, r: unknown, path: string): unknown {
    if (same(l, b)) return r;
    if (same(r, b) || same(l, r)) return l;
    if (record(b) && record(l) && record(r) && typeof b.id === 'string' &&
        ((l.deletedAt !== b.deletedAt && !same(r, b)) || (r.deletedAt !== b.deletedAt && !same(l, b)))) {
      conflicts.push({ path, local: l, remote: r });
      return prefer === 'local' ? l : r;
    }
    if (Array.isArray(l) && Array.isArray(r) && [...l, ...r].every((item) => record(item) && string(item.id))) {
      const byId = (items: unknown) => new Map((Array.isArray(items) ? items : []).map((item) => [(item as { id: string }).id, item]));
      const bm = byId(b), lm = byId(l), rm = byId(r);
      const items = [...new Set([...lm.keys(), ...rm.keys(), ...bm.keys()])]
        .map((id) => merge(bm.get(id), lm.get(id), rm.get(id), `${path}/${id}`)).filter((item) => item !== undefined);
      return path.endsWith('/choreCompletions') ? items.sort((a, b) => String((b as { completedAt: string }).completedAt).localeCompare(String((a as { completedAt: string }).completedAt))).slice(0, 200) : items;
    }
    if (record(l) && record(r) && (b === undefined || record(b))) {
      return Object.fromEntries([...new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(record(b) ? b : {})])]
        .map((key) => [key, merge(record(b) ? b[key] : undefined, l[key], r[key], `${path}/${key}`)]));
    }
    // Expansion is a view preference; merging it must not block substantive edits.
    if (path.endsWith('/recurrenceHistory') && Array.isArray(l) && Array.isArray(r)) {
      return [...new Set([...l, ...r])].sort((a, b) => Date.parse(String(b)) - Date.parse(String(a))).slice(0, 20);
    }
    if (path.endsWith('/lastCompletedAt') && typeof l === 'string' && typeof r === 'string') return Date.parse(l) > Date.parse(r) ? l : r;
    if (!['/expanded', '/activePersonId', '/updatedById'].some((field) => path.endsWith(field))) conflicts.push({ path, local: l, remote: r });
    return prefer === 'local' ? l : r;
  }
  const state = merge(base, local, remote, '') as AppStateData;
  state.activePersonId = local.activePersonId;
  state.activityLog = [...state.activityLog].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 80);
  return { state, conflicts };
}

export function allTasks(task: Task): Task[] { return task.children.flatMap((child) => [child, ...allTasks(child)]); }

// Remove deleted descendants from presentation/calculations, retain them in storage.
export function liveGoal(goal: Goal): Goal {
  const children = (tasks: Task[]): Task[] => tasks.filter((task) => !task.deletedAt).map((task) => ({ ...task, children: children(task.children) }));
  return { ...goal, children: children(goal.children) };
}
