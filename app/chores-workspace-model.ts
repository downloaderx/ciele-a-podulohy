import type { Goal, Task } from './page-model';

const plain = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function pantrySource(goals: Goal[]): Goal | undefined {
  if (goals.some((goal) => !goal.deletedAt && goal.category === 'chore' && plain(goal.title).trim() === 'spajza')) return undefined;
  const hasPantry = (tasks: Task[]): boolean => tasks.some((task) => !task.deletedAt && (plain(task.title).includes('spajz') || hasPantry(task.children)));
  return goals.find((goal) => !goal.deletedAt && goal.category === 'chore' && plain(goal.title).includes('kuchyn') && hasPantry(goal.children));
}

// Move whole task objects, including IDs and history, in one board update.
export function splitPantry(goals: Goal[], sourceId: string, newId: string, personId: string): Goal[] {
  const requested = goals.find((goal) => goal.id === sourceId);
  if (!requested || goals.some((goal) => goal.id === newId)) return goals;
  const source = pantrySource([requested, ...goals.filter((goal) => goal.id !== sourceId &&
    (goal.spaceId ?? 'shared') === (requested.spaceId ?? 'shared') && plain(goal.title).trim() === 'spajza')]);
  if (!source || source.id !== sourceId) return goals;
  const moved: Task[] = [];
  const keep = (tasks: Task[]): Task[] => tasks.flatMap((task) => {
    if (task.deletedAt) return [task];
    if (plain(task.title).includes('spajz')) { moved.push(task); return []; }
    return [{ ...task, children: keep(task.children) }];
  });
  const children = keep(source.children);
  const pantry: Goal = {
    id: newId, title: 'Špajza', description: 'Práce v špajzi.', category: 'chore', kind: 'todo',
    ownerId: personId, updatedById: personId, spaceId: source.spaceId, done: false, expanded: false,
    importanceByPerson: { ...source.importanceByPerson }, children: moved,
  };
  return [...goals.map((goal) => goal.id === sourceId ? { ...goal, title: /spajz/.test(plain(goal.title)) ? 'Kuchyňa' : goal.title, children, updatedById: personId } : goal), pantry];
}
