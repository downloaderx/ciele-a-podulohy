import type { Goal, Task } from './page-model';

export type RoutineRun = {
  id: string;
  startedAt: string;
  paused: boolean;
  steps: Array<{ id: string; title: string }>;
  events: Array<{ id: string; stepId: string; outcome: 'done' | 'skipped' | 'pending'; at: string }>;
};

export function routineProgress(run: RoutineRun) {
  const outcomes = new Map<string, string>();
  [...run.events].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).forEach((event) => outcomes.set(event.stepId, event.outcome));
  const index = run.steps.findIndex((step) => !outcomes.has(step.id) || outcomes.get(step.id) === 'pending');
  return { index, outcomes, done: run.steps.filter((step) => outcomes.get(step.id) === 'done').length, skipped: run.steps.filter((step) => outcomes.get(step.id) === 'skipped').length };
}

export function startRoutine(goal: Goal, id: string, now: string): RoutineRun {
  return { id, startedAt: now, paused: false, steps: goal.children.filter((step) => !step.deletedAt).map(({ id, title }) => ({ id, title })), events: [] };
}

export function advanceRoutine(run: RoutineRun, action: 'done' | 'skipped' | 'back' | 'pause' | 'resume', id: string, now: string): RoutineRun {
  if (action === 'pause' || action === 'resume') return { ...run, paused: action === 'pause' };
  if (run.paused) return run;
  const { index } = routineProgress(run);
  const target = action === 'back' ? (index === -1 ? run.steps.length - 1 : index - 1) : index;
  if (target < 0 || target >= run.steps.length) return run;
  // Ensure sequential actions remain ordered even within the same millisecond.
  const at = new Date(Math.max(Date.parse(now), ...run.events.map((event) => Date.parse(event.at) + 1))).toISOString();
  return { ...run, events: [...run.events, { id, stepId: run.steps[target].id, outcome: action === 'back' ? 'pending' : action, at }] };
}

export function createRoutine(id: string, title: string, steps: Array<{ id: string; title: string }>, ownerId: string, spaceId: string = ownerId): Goal {
  return { id, title: title.trim(), ownerId, spaceId, category: 'routine', description: '', importanceByPerson: {}, done: false, expanded: false,
    children: steps.map((step): Task => ({ id: step.id, title: step.title.trim(), ownerId, done: false, expanded: false, kind: 'todo', children: [] })) };
}

export function validRoutineRun(value: unknown): value is RoutineRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as RoutineRun;
  const text = (v: unknown, limit = 2000) => typeof v === 'string' && v.trim().length > 0 && v.length <= limit;
  if (!text(run.id, 200) || !text(run.startedAt, 50) || !Number.isFinite(Date.parse(run.startedAt)) || typeof run.paused !== 'boolean' || !Array.isArray(run.steps) || !run.steps.length || run.steps.length > 100 || !Array.isArray(run.events) || run.events.length > 5000) return false;
  if (!run.steps.every((step) => step && text(step.id, 200) && text(step.title))) return false;
  const ids = new Set(run.steps.map((step) => step.id));
  return ids.size === run.steps.length && new Set(run.events.map((event) => event?.id)).size === run.events.length && run.events.every((event) => event && text(event.id, 200) && ids.has(event.stepId) && ['done', 'skipped', 'pending'].includes(event.outcome) && text(event.at, 50) && Number.isFinite(Date.parse(event.at)));
}
