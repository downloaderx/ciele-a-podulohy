import type { Goal, NoteColor, Task } from './page-model';

export const noteColors: NoteColor[] = ['butter', 'rose', 'mint', 'lavender', 'sky'];

export function hasCompletedTodoItems(item: Task): boolean {
  return !item.deletedAt && !item.purgedAt && (item.done || item.children.some(hasCompletedTodoItems));
}

export function resetTodoList(list: Goal, personId: string): Goal {
  if (list.category !== 'list' || list.deletedAt || list.purgedAt ||
      !['person-1', 'person-2'].includes(personId) ||
      (list.spaceId && list.spaceId !== 'shared' && list.spaceId !== personId)) return list;
  const reset = (item: Task): Task => {
    if (item.deletedAt || item.purgedAt) return item;
    const children = item.children.map(reset);
    if (!item.done && children.every((child, index) => child === item.children[index])) return item;
    return { ...item, done: false, updatedById: personId, children };
  };
  return reset(list) as Goal;
}

// Moving a list is allowed from a shared space or the actor's own personal space.
// The destination may belong to either person, without granting further edit access.
export function canMoveTodoList(previous: Goal | undefined, next: Goal, personId: string): boolean {
  const source = previous?.spaceId ?? 'shared';
  const destination = next.spaceId ?? 'shared';
  return Boolean(previous && previous.id === next.id && previous.category === 'list' && next.category === 'list' &&
    !previous.deletedAt && !previous.purgedAt && !next.deletedAt && !next.purgedAt &&
    ['person-1', 'person-2'].includes(personId) && (source === 'shared' || source === personId) &&
    ['shared', 'person-1', 'person-2'].includes(destination) && source !== destination);
}

export function canConvertTodoList(list: Goal | undefined, personId: string): list is Goal {
  const source = list?.spaceId ?? 'shared';
  return Boolean(list && list.category === 'list' && !list.deletedAt && !list.purgedAt &&
    ['person-1', 'person-2'].includes(personId) && (source === 'shared' || source === personId));
}

export function convertTodoListToRecipe(list: Goal, personId: string): Goal {
  return { ...list, category: 'recipe', spaceId: 'shared', foodSelected: false, updatedById: personId };
}

export function createTodoList(id: string, title: string, ownerId: string, noteColor: NoteColor = 'butter', spaceId: string = 'shared'): Goal | null {
  const name = title.trim();
  if (!name || name.length > 100 || !noteColors.includes(noteColor)) return null;
  return { id, title: name, ownerId, updatedById: ownerId, category: 'list', spaceId,
    description: '', importanceByPerson: {}, noteColor, done: false, expanded: false, kind: 'todo', children: [] };
}
export function createTodoItem(id: string, title: string, ownerId: string): Task | null {
  const text = title.trim();
  return text && text.length <= 2000 ? { id, title: text, ownerId, updatedById: ownerId, done: false, expanded: false, kind: 'todo', children: [] } : null;
}
