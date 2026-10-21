import { choreElapsedDays, isCompletableTask, normalizeGoalCategory, type ChoreCadence, type Goal, type Task } from './page-model';

export type ChorePick = { task: Task; goalId: string; goalTitle: string; path: string[]; cadence: ChoreCadence; doneToday: boolean };
export type ChoreReveal = { taskId: string; path: string[] };

export function choreRandomizerItems(goals: Goal[], now = new Date()): ChorePick[] {
  return goals.filter((goal) => !goal.deletedAt && normalizeGoalCategory(goal.category) === 'chore').flatMap((goal) => {
    const collect = (tasks: Task[], path: string[]): ChorePick[] => tasks.flatMap((task) => {
      if (task.deletedAt) return [];
      const nextPath = [...path, task.id];
      const own: ChorePick[] = isCompletableTask(task) ? [{ task, goalId: goal.id, goalTitle: goal.title, path: nextPath, cadence: task.choreCadence ?? 'routine', doneToday: choreElapsedDays(task, now) === 0 }] : [];
      return [...own, ...collect(task.children, nextPath)];
    });
    return collect(goal.children, [goal.id]);
  });
}

export function chorePickOptions(items: ChorePick[], cadence: ChoreCadence, previousId?: string): ChorePick[] {
  const eligible = items.filter((item) => item.cadence === cadence && !item.doneToday);
  return eligible.length > 1 ? eligible.filter((item) => item.task.id !== previousId) : eligible;
}
