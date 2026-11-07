import type { ChoreCompletion, Task } from './page-model';

export const choreQuickUndoMs = 30_000;

// A second tap reverses only the latest live execution, and only its author.
export function quickUndoCompletion(task: Task, personId: string, now = Date.now()): ChoreCompletion | undefined {
  const latest = (task.choreCompletions ?? []).filter((entry) => !entry.undoneAt)
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))[0];
  if (!latest || latest.personId !== personId) return;
  const elapsed = now - Date.parse(latest.completedAt);
  return elapsed >= 0 && elapsed < choreQuickUndoMs ? latest : undefined;
}
