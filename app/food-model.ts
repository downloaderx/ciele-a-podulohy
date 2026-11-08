import type { Goal, Task } from './page-model';

export function ingredientKey(name: string): string {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('sk-SK').trim().replace(/\s+/gu, ' ');
}

export function createFoodCollection(id: string, title: string, category: 'pantry' | 'recipe', ownerId: string): Goal | null {
  const name = title.trim();
  if (!name || name.length > 200) return null;
  return { id, title: name, category, spaceId: 'shared', ownerId, updatedById: ownerId, description: '', importanceByPerson: {}, done: false, expanded: false, children: [], ...(category === 'recipe' ? { foodSelected: false } : {}) };
}

export function createFoodIngredient(id: string, title: string, amount: string, ownerId: string, available = false): Task | null {
  const name = title.trim(), note = amount.trim();
  if (!name || name.length > 200 || note.length > 120) return null;
  return { id, title: name, foodAmount: note, ownerId, updatedById: ownerId, done: available, expanded: false, kind: 'todo', children: [] };
}

export function liveFoodIngredients(collections: Goal[]): Task[] {
  return collections.filter((goal) => !goal.deletedAt && !goal.purgedAt).flatMap((goal) => goal.children.filter((item) => !item.deletedAt && !item.purgedAt));
}

// Match ingredient names, not amounts or guessed synonyms. Duplicate names count once.
export function recipeAvailability(recipe: Goal, pantries: Goal[]) {
  const stock = new Set(liveFoodIngredients(pantries.filter((goal) => goal.category === 'pantry' && (goal.spaceId ?? 'shared') === 'shared')).filter((item) => item.done).map((item) => ingredientKey(item.title)));
  const ingredients = [...new Map(liveFoodIngredients([recipe]).filter((item) => ingredientKey(item.title)).map((item) => [ingredientKey(item.title), item])).values()];
  const have = ingredients.filter((item) => stock.has(ingredientKey(item.title)));
  const missing = ingredients.filter((item) => !stock.has(ingredientKey(item.title)));
  return { have, missing, total: ingredients.length, percent: ingredients.length ? Math.round(have.length / ingredients.length * 100) : null };
}

export function addFoodIngredient(collection: Goal, item: Task): Goal {
  if (!['pantry', 'recipe'].includes(collection.category ?? '') || collection.deletedAt || collection.purgedAt) return collection;
  const existing = collection.children.find((child) => !child.deletedAt && !child.purgedAt && ingredientKey(child.title) === ingredientKey(item.title));
  if (existing && collection.category === 'recipe') return collection;
  return { ...collection, updatedById: item.ownerId, children: existing ? collection.children.map((child) => child.id === existing.id ? { ...child, done: true, updatedById: item.ownerId, foodAmount: item.foodAmount || child.foodAmount || '' } : child) : [...collection.children, item] };
}
