import { createRandomIndex, type BoardSpaceId, type Goal, type Task } from './page-model';

export type RuleEntry = { id: string; text: string; sourceId?: string; sourceTitle?: string };

export function collectRules(goals: Goal[], spaceId: BoardSpaceId): RuleEntry[] {
  const rules: RuleEntry[] = [];
  for (const goal of goals) {
    if (goal.deletedAt || (goal.spaceId ?? 'shared') !== spaceId) continue;
    if (goal.category === 'rulebook') {
      if (goal.title.trim()) rules.push({ id: goal.id, text: goal.title });
    } else if (!goal.category || goal.category === 'plan') {
      const visit = (tasks: Task[]) => tasks.forEach((task) => {
        if (task.deletedAt) return;
        if (task.kind === 'rule' && task.title.trim()) rules.push({ id: task.id, text: task.title, sourceId: goal.id, sourceTitle: goal.title });
        visit(task.children);
      });
      visit(goal.children);
    }
  }
  return rules;
}

export function pickRule(rules: RuleEntry[], previousId?: string): RuleEntry | undefined {
  const pool = rules.length > 1 ? rules.filter((rule) => rule.id !== previousId) : rules;
  return pool[createRandomIndex(pool.length)];
}

export function createRule(id: string, text: string, ownerId: string, spaceId: BoardSpaceId): Goal | null {
  const title = text.trim();
  if (!title || title.length > 4000) return null;
  return { id, title, ownerId, updatedById: ownerId, spaceId, category: 'rulebook', kind: 'rule',
    description: '', importanceByPerson: {}, done: false, expanded: false, children: [] };
}
