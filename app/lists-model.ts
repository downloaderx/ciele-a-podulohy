import type { Goal, NoteColor, Task } from './page-model';

export const noteColors: NoteColor[] = ['butter', 'rose', 'mint', 'lavender', 'sky'];

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
