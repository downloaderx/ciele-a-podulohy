import type { Goal, NoteColor, Task } from './page-model';

export const noteColors: NoteColor[] = ['butter', 'rose', 'mint', 'lavender', 'sky'];
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
