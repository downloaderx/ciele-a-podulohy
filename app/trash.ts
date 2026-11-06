import type { Goal, Task } from './page-model';

// Keep only IDs and deletion markers so stale clients cannot resurrect erased content.
export function purgeTask<T extends Task>(task: T, at: string): T {
  const marker = task.purgedAt ?? at;
  const goal = task as Task & Partial<Goal>;
  return {
    id: task.id, title: '', ownerId: task.ownerId, updatedById: task.updatedById,
    done: false, expanded: false, deletedAt: task.deletedAt ?? marker, purgedAt: marker,
    children: task.children.map((child) => purgeTask(child, marker)),
    ...('description' in task ? { description: '', category: goal.category, spaceId: goal.spaceId,
      importanceByPerson: {}, feasibilityByPerson: {} } : {}),
  } as T;
}
