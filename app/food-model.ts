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

// Use known forms so unrelated ingredients with similar endings stay distinct.
const ingredientForms = new Map([
  ['vajce', 'vajco', 'vajcia', 'vajec', 'vajcu', 'vajcom', 'vajci', 'vajciam', 'vajciach', 'vajcami'],
  ['paradajka', 'paradajky', 'paradajok', 'paradajku', 'paradajkou', 'paradajkam', 'paradajkach', 'paradajkami'],
  ['cibula', 'cibule', 'cibul', 'cibulu', 'cibulou', 'cibuli', 'cibuliam', 'cibuliach', 'cibulami'],
  ['uhorka', 'uhorky', 'uhoriek', 'uhorku', 'uhorkou', 'uhorkam', 'uhorkach', 'uhorkami'],
  ['mrkva', 'mrkvy', 'mrkiev', 'mrkvu', 'mrkvou', 'mrkve', 'mrkvam', 'mrkvach', 'mrkvami'],
  ['paprika', 'papriky', 'paprik', 'papriku', 'paprikou', 'paprike', 'paprikam', 'paprikach', 'paprikami'],
  ['jablko', 'jablka', 'jablk', 'jablku', 'jablkom', 'jablkach', 'jablkami'],
  ['mlieko', 'mlieka', 'mlieku', 'mliekom'],
  ['maslo', 'masla', 'maslu', 'maslom'],
  ['muka', 'muky', 'muku', 'mukou', 'muke'],
  ['ryza', 'ryze', 'ryzu', 'ryzou', 'ryzi'],
  ['sol', 'soli', 'solou'],
  ['zelenina', 'zeleniny', 'zelenine', 'zeleninu', 'zeleninou'],
].flatMap(([base, ...forms]) => [base, ...forms].map((form) => [form, base] as const)));

function ingredientWords(key: string): string[] {
  return key.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function recipeIngredientWords(key: string): string[] {
  const name = key.replace(/\(\s*(?:napriklad|napr\.?)\s+[^()]*\)/gu, ' ')
    .trimStart().replace(/^lubovoln(?:[aeouy]|ej|eho|ych)\s+/u, '');
  return ingredientWords(name);
}

function matchesIngredientWords(first: string[], second: string[]): boolean {
  const [shorter, longer] = first.length <= second.length ? [first, second] : [second, first];
  if (!shorter.length) return false;

  return longer.some((_, start) => start + shorter.length <= longer.length && shorter.every((word, offset) => {
    const other = longer[start + offset];
    if ((ingredientForms.get(word) ?? word) === (ingredientForms.get(other) ?? other)) return true;

    const [prefix, full] = word.length <= other.length ? [word, other] : [other, word];
    return prefix.length >= 4 && !ingredientForms.has(prefix) && full.startsWith(prefix);
  }));
}

export function recipeAvailability(recipe: Goal, pantries: Goal[]) {
  const stock = new Set(liveFoodIngredients(pantries.filter((goal) => goal.category === 'pantry' && (goal.spaceId ?? 'shared') === 'shared')).filter((item) => item.done).map((item) => ingredientKey(item.title)));
  const stockWords = [...stock].map(ingredientWords);
  const ingredients = new Map(liveFoodIngredients([recipe]).map((item) => [ingredientKey(item.title), item]));
  ingredients.delete('');
  const have: Task[] = [], missing: Task[] = [];
  for (const [key, item] of ingredients) {
    const words = recipeIngredientWords(key);
    const available = stock.has(key) || stockWords.some((candidate) => matchesIngredientWords(words, candidate));
    (available ? have : missing).push(item);
  }
  return { have, missing, total: ingredients.size, percent: ingredients.size ? Math.round(have.length / ingredients.size * 100) : null };
}

export function addFoodIngredient(collection: Goal, item: Task): Goal {
  if (!['pantry', 'recipe'].includes(collection.category ?? '') || collection.deletedAt || collection.purgedAt) return collection;
  const existing = collection.children.find((child) => !child.deletedAt && !child.purgedAt && ingredientKey(child.title) === ingredientKey(item.title));
  if (existing && collection.category === 'recipe') return collection;
  return { ...collection, updatedById: item.ownerId, children: existing ? collection.children.map((child) => child.id === existing.id ? { ...child, done: true, updatedById: item.ownerId, foodAmount: item.foodAmount || child.foodAmount || '' } : child) : [...collection.children, item] };
}
