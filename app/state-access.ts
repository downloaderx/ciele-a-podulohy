import { gratitudeDay } from './gratitude';
import { normalizeGoals } from './page-model';
import { ApiError } from './server-storage';
import type { AppStateData, Goal, Task } from './page-model';
import { stableJson } from './state-sync';

function retainRemoved(previous: Task[], next: Task[]): Task[] {
  const ids = new Set(next.map((task) => task.id));
  return [...next.map((task) => {
    const old = previous.find((item) => item.id === task.id);
    return { ...task, children: retainRemoved(old?.children ?? [], task.children) };
  }), ...previous.filter((task) => !ids.has(task.id)).map((task) => ({ ...task, deletedAt: task.deletedAt ?? new Date().toISOString() }))];
}

export function authorizedState(previous: AppStateData, incoming: AppStateData, personId: string): AppStateData {
  const allowedSpace = (id: string | undefined) => !id || id === 'shared' || id === personId;
  const previousVisible = { ...previous, goals: previous.goals.filter((goal) => allowedSpace(goal.spaceId)) };
  const hiddenGoals = previous.goals.filter((goal) => !allowedSpace(goal.spaceId));
  const hiddenIds = new Set<string>();
  const collect = (task: Task) => { hiddenIds.add(task.id); task.children.forEach(collect); };
  hiddenGoals.forEach(collect);
  const check = (task: Task) => {
    if (hiddenIds.has(task.id)) throw new ApiError(403, 'Položka patrí do neprístupnej tabule.');
    task.children.forEach(check);
  };
  for (const goal of incoming.goals) {
    if (!allowedSpace(goal.spaceId)) {
      const old = previous.goals.find((item) => item.id === goal.id);
      if (!old || stableJson(normalizeGoals([old], previous.people)) !== stableJson(normalizeGoals([goal], previous.people))) throw new ApiError(403, 'Osobné ciele druhej osoby sú iba na prezeranie.');
      continue;
    }
    const old = previous.goals.find((item) => item.id === goal.id);
    if (old && (old.spaceId ?? 'shared') !== (goal.spaceId ?? 'shared')) throw new ApiError(403, 'Zmena priestoru existujúceho cieľa nie je povolená.');
    check(goal);
  }
  const otherId = personId === 'person-1' ? 'person-2' : 'person-1';
  const previousTasks = new Map<string, Task>();
  const index = (task: Task) => { previousTasks.set(task.id, task); task.children.forEach(index); };
  previousVisible.goals.forEach(index);
  const stamp = (task: Task): Task => {
    const old = previousTasks.get(task.id);
    const completions = new Map((old?.choreCompletions ?? []).map((entry) => [entry.id, entry]));
    for (const entry of task.choreCompletions ?? []) {
      const prior = completions.get(entry.id);
      if (prior && (entry.personId !== prior.personId || entry.completedAt !== prior.completedAt ||
          (entry.undoneAt !== prior.undoneAt && prior.personId !== personId))) throw new ApiError(403, 'Zrušiť môžeš iba svoje vykonanie chores.');
      if (!prior && entry.personId !== personId) throw new ApiError(403, 'Neplatný autor vykonania chores.');
      completions.set(entry.id, prior?.undoneAt ? prior : entry);
    }
    return { ...task, ...(old?.choreCompletions || task.choreCompletions ? { choreCompletions: [...completions.values()].sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 200) } : {}), ownerId: old?.ownerId ?? personId,
      updatedById: stableJson(task) === stableJson(old) ? old?.updatedById : personId,
      children: task.children.map(stamp) };
  };
  const goals = (retainRemoved(previousVisible.goals, incoming.goals.filter((goal) => allowedSpace(goal.spaceId))) as Goal[]).map((goal) => {
    const old = previous.goals.find((item) => item.id === goal.id);
    return { ...goal, ...stamp(goal),
      importanceByPerson: { ...goal.importanceByPerson, [otherId]: old?.importanceByPerson[otherId] ?? 2 },
      feasibilityByPerson: { ...goal.feasibilityByPerson, [otherId]: old?.feasibilityByPerson?.[otherId] ?? 3 },
    };
  });
  const visibleGoalIds = new Set(previousVisible.goals.map((goal) => goal.id));
  const people = previous.people.map((person) => person.id === personId ? incoming.people.find((item) => item.id === personId)! : person);
  const oldLog = new Map(previous.activityLog.map((item) => [item.id, item]));
  const log = incoming.activityLog.map((item) => {
    const old = oldLog.get(item.id);
    if (old) return old;
    if (item.actorId !== personId || !allowedSpace(item.spaceId)) throw new ApiError(403, 'Neplatný autor zmeny.');
    return item;
  });
  const gratitudeEntries = new Map((previous.gratitudeEntries ?? []).map((entry) => [entry.id, entry]));
  const today = gratitudeDay();
  for (const entry of incoming.gratitudeEntries ?? []) {
    const old = gratitudeEntries.get(entry.id);
    if (stableJson(entry) === stableJson(old)) continue;
    if (entry.personId !== personId || entry.day !== today) throw new ApiError(403, 'Upravovať môžeš iba svoj dnešný zápis vďačnosti.');
    gratitudeEntries.set(entry.id, entry);
  }
  const mergedLog = new Map([...previous.activityLog, ...log].map((item) => [item.id, item]));
  return { activePersonId: personId, people, gratitudeEntries: [...gratitudeEntries.values()], goals: [...goals, ...hiddenGoals],
    activityLog: [...mergedLog.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 80),
    goalRankings: { ...previous.goalRankings, [personId]: [
      ...(incoming.goalRankings[personId] ?? []),
      ...(previous.goalRankings[personId] ?? []).filter((id) => !visibleGoalIds.has(id) && !incoming.goalRankings[personId]?.includes(id)),
    ] },
  };
}

