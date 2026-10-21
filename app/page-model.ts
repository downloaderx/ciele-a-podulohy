import { gratitudeDay } from './gratitude';
export type Person = {
  id: string;
  name: string;
  tone: string;
  avatarId: string;
};

export type ChoreCompletion = {
  id: string;
  personId: string;
  completedAt: string;
  undoneAt?: string;
};

export type Task = {
  choreCompletions?: ChoreCompletion[];
  id: string;
  title: string;
  ownerId: string;
  updatedById?: string;
  dueAt?: string;
  deletedAt?: string;
  done: boolean;
  expanded: boolean;
  children: Task[];
  kind?: TaskKind;
  choreCadence?: ChoreCadence;
  choreWeight?: ChoreWeight;
  choreIntervalDays?: number;
};

export type BoardSpaceId = 'shared' | string;
export type TaskKind = 'todo' | 'rule' | 'topic';
export type ChoreCadence = 'routine' | 'occasional';
export type ChoreWeight = 1 | 3 | 5;

export type Goal = Task & {
  satisfactionByPerson?: Record<string, number>;
  category?: GoalCategory;
  description: string;
  feasibilityByPerson?: Record<string, number>;
  importanceByPerson: Record<string, number>;
  lastCompletedAt?: string;
  recurrenceHistory?: string[];
  recurrenceDays?: number;
  recurrenceStartAt?: string;
  recurrenceToleranceDays?: number;
  deletedAt?: string;
  spaceId?: BoardSpaceId;
};

export type GoalCategory = 'plan' | 'chore' | 'errand' | 'habit' | 'activity';

export type ActivityItem = {
  id: string;
  actorId: string;
  action: string;
  target: string;
  createdAt: string;
  spaceId?: BoardSpaceId;
};

export type CompletedItem = {
  id: string;
  ownerId: string;
  title: string;
  type: 'goal' | 'task';
};

export type GratitudeEntry = {
  id: string;
  personId: string;
  day: string;
  text: string;
};

export type AppStateData = {
  gratitudeEntries?: GratitudeEntry[];
  activePersonId: string;
  activityLog: ActivityItem[];
  goalRankings: Record<string, string[]>;
  goals: Goal[];
  people: Person[];
};

export type TransferPayload = {
  version: 1;
  exportedAt: string;
  data: AppStateData;
};

export const avatarOptions = [
  {
    id: 'rini-orange',
    label: 'Oranžová líštička s náramkom',
    src: '/avatar-rini-orange.png',
    tone: '#ff9d4a',
  },
  {
    id: 'fluffy',
    label: 'Fluffyho líštička',
    src: '/avatar-fluffy.png',
    tone: '#ff9d4a',
  },
  {
    id: 'fluffy-red-orange',
    label: 'Fluffy oranžový s červeným náhrdelníkom',
    src: '/avatar-fluffy-red-orange.png',
    tone: '#ff9d4a',
  },
  {
    id: 'fluffy-red-mint',
    label: 'Fluffy mätový s červeným náhrdelníkom',
    src: '/avatar-fluffy-red-mint.png',
    tone: '#58dcca',
  },
  {
    id: 'fluffy-red-light-blue',
    label: 'Fluffy svetlomodrý s červeným náhrdelníkom',
    src: '/avatar-fluffy-red-light-blue.png',
    tone: '#6c9fff',
  },
  {
    id: 'fluffy-red-lavender',
    label: 'Fluffy levanduľový s červeným náhrdelníkom',
    src: '/avatar-fluffy-red-lavender.png',
    tone: '#a98dff',
  },
  {
    id: 'fluffy-red-pink',
    label: 'Fluffy ružový s červeným náhrdelníkom',
    src: '/avatar-fluffy-red-pink.png',
    tone: '#ff7eb6',
  },
  {
    id: 'fluffy-red-yellow',
    label: 'Fluffy žltý s červeným náhrdelníkom',
    src: '/avatar-fluffy-red-yellow.png',
    tone: '#f4d84d',
  },
  {
    id: 'fluffy-red-gray',
    label: 'Fluffy sivý s červeným náhrdelníkom',
    src: '/avatar-fluffy-red-gray.png',
    tone: '#9ca8bd',
  },
  {
    id: 'fluffy-red-navy',
    label: 'Fluffy tmavomodrý s červeným náhrdelníkom',
    src: '/avatar-fluffy-red-navy.png',
    tone: '#4d67c4',
  },
  {
    id: 'fluffy-red-green',
    label: 'Fluffy zelený s červeným náhrdelníkom',
    src: '/avatar-fluffy-red-green.png',
    tone: '#8fe36b',
  },
  {
    id: 'fluffy-red-turquoise',
    label: 'Fluffy tyrkysový s červeným náhrdelníkom',
    src: '/avatar-fluffy-red-turquoise.png',
    tone: '#35d0ba',
  },
  {
    id: 'rini-pink',
    label: 'Ružová líštička s náramkom',
    src: '/avatar-rini-pink.png',
    tone: '#ff7eb6',
  },
  {
    id: 'rini-silver',
    label: 'Strieborná líštička s náramkom',
    src: '/avatar-rini-silver.png',
    tone: '#9ca8bd',
  },
  {
    id: 'rini-green',
    label: 'Zelená líštička s náramkom',
    src: '/avatar-rini-green.png',
    tone: '#8fe36b',
  },
  {
    id: 'rini-blue-pearl',
    label: 'Bledomodrá líštička s perličkami',
    src: '/avatar-rini-blue-pearl.png',
    tone: '#6c9fff',
  },
  {
    id: 'rini-yellow',
    label: 'Žltá líštička s náramkom',
    src: '/avatar-rini-yellow.png',
    tone: '#f4d84d',
  },
  {
    id: 'rini-mint-pearl',
    label: 'Tyrkysová líštička s perličkami',
    src: '/avatar-rini-mint-pearl.png',
    tone: '#35d0ba',
  },
  {
    id: 'rini-mint',
    label: 'Mätová líštička s náramkom',
    src: '/avatar-rini-mint.png',
    tone: '#58dcca',
  },
  {
    id: 'rini-lavender',
    label: 'Levanduľová líštička s náramkom',
    src: '/avatar-rini-lavender.png',
    tone: '#a98dff',
  },
  {
    id: 'rini-navy',
    label: 'Modrá líštička s perličkami',
    src: '/avatar-rini-navy.png',
    tone: '#4d67c4',
  },
];

export const defaultPeople: Person[] = [
  { id: 'person-1', name: 'Rini', tone: '#ff9d4a', avatarId: 'rini-orange' },
  { id: 'person-2', name: 'Fluffy', tone: '#ff9d4a', avatarId: 'fluffy' },
];

export function getAvatarOptionsForPerson(personId: string) {
  if (personId === 'person-2') {
    return avatarOptions.filter((avatar) => avatar.id === 'fluffy' || avatar.id.startsWith('fluffy-'));
  }

  return avatarOptions.filter((avatar) => avatar.id.startsWith('rini-'));
}

export const sessionPersonKey = 'ciele-session-person';
export const goalRankingsKey = 'ciele-goal-rankings';
export const boardSpaceKey = 'ciele-board-space';
export const sharedSpaceId = 'shared';
export const minImportance = 1;
export const maxImportance = 5;
export const goalCategories: Array<{ id: GoalCategory; label: string }> = [
  { id: 'plan', label: 'Dlhodobé ciele vo vzťahu' },
  { id: 'chore', label: 'Chores' },
  { id: 'errand', label: 'Vybaviť' },
  { id: 'habit', label: 'Habits' },
  { id: 'activity', label: 'Activities' },
];
export const taskKinds: Array<{ id: TaskKind; label: string }> = [
  { id: 'todo', label: 'Úloha' },
  { id: 'rule', label: 'Pravidlo' },
  { id: 'topic', label: 'Téma' },
];
export const recurringCategoryIds: GoalCategory[] = ['chore', 'habit'];
export const defaultRecurrenceDays = 7;
export const defaultRecurrenceToleranceDays = 5;

export const starterGoals: Goal[] = [];

export function isStarterGoal(goal: Goal) {
  if (goal.id === 'goal-launch') {
    return (
      goal.title === 'Spustiť klientsky portál' ||
      goal.title === 'Naplánovať spoločný víkend'
    );
  }

  if (goal.id === 'goal-marketing') {
    return (
      goal.title === 'Dokončiť jesennú kampaň' ||
      goal.title === 'Zútulniť domácnosť'
    );
  }

  return false;
}

export function isOldStarterData(goals: Goal[]) {
  if (goals.length !== 2) {
    return false;
  }

  const firstGoal = goals[0];
  const secondGoal = goals[1];

  return Boolean(firstGoal && secondGoal && isStarterGoal(firstGoal) && isStarterGoal(secondGoal));
}
export function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createRandomIndex(length: number) {
  if (length <= 1) {
    return 0;
  }

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint32Array(1);

    crypto.getRandomValues(bytes);

    return bytes[0] % length;
  }

  return Date.now() % length;
}

export function calculateProgress(task: Task) {
  const descendants = flattenChildren(task);
  const trackedItems = descendants.length > 0
    ? descendants.filter(isCompletableTask)
    : [task].filter(isCompletableTask);
  if ((task as Goal).category === 'chore') return calculateChoreProgress(descendants.length ? task.children : [task], 'routine');
  const done = trackedItems.filter((item) => item.done).length;
  const total = trackedItems.length;

  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export function choreDone(task: Task, day = gratitudeDay()) {
  if (!task.choreCompletions) return task.choreCadence === 'occasional' && task.done;
  const start = new Date(`${day}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  const firstDay = start.toISOString().slice(0, 10);
  return task.choreCompletions.some((entry) => {
    if (entry.undoneAt) return false;
    if (task.choreCadence === 'occasional') return true;
    const completedDay = gratitudeDay(new Date(entry.completedAt));
    return completedDay >= firstDay && completedDay <= day;
  });
}

export function getChoreIntervalDays(task: Task): number {
  return Number.isInteger(task.choreIntervalDays) && task.choreIntervalDays! >= 1 && task.choreIntervalDays! <= 3650 ? task.choreIntervalDays! : 30;
}

export function choreElapsedDays(task: Task, now = new Date()): number | undefined {
  const latest = (task.choreCompletions ?? []).filter((entry) => !entry.undoneAt && Date.parse(entry.completedAt) <= now.getTime())
    .map((entry) => entry.completedAt).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  if (!latest) return undefined;
  return Math.round((Date.parse(gratitudeDay(now)) - Date.parse(gratitudeDay(new Date(latest)))) / 86400000);
}

export function choreElapsedLabel(task: Task, now = new Date()): string {
  const days = choreElapsedDays(task, now);
  if (days === undefined) return task.done && !task.choreCompletions ? 'Posledné vykonanie: dátum neznámy' : 'Zatiaľ bez záznamu vykonania';
  if (days === 0) return 'Vykonané dnes';
  return `Nerobené ${days} ${days === 1 ? 'deň' : days < 5 ? 'dni' : 'dní'}`;
}

// Reminder intervals and elapsed time use Bratislava calendar days, including DST changes.
export function choreAttention(task: Task, now = new Date()): string | undefined {
  if (task.deletedAt || !isCompletableTask(task)) return undefined;
  if (task.choreCadence === 'occasional') {
    const days = choreElapsedDays(task, now);
    if (days === undefined) return task.done && !task.choreCompletions ? 'Dátum posledného vykonania nie je známy · skontroluj, či je práca na rade' : 'Zatiaľ bez záznamu vykonania · skontroluj, či je práca na rade';
    const interval = getChoreIntervalDays(task);
    return days >= interval ? `${choreElapsedLabel(task, now)} · nastavené opakovanie každých ${interval} dní` : undefined;
  }
  const completions = (task.choreCompletions ?? []).filter((entry) => !entry.undoneAt && Date.parse(entry.completedAt) <= now.getTime());
  return choreDone({ ...task, choreCompletions: completions }, gratitudeDay(now)) ? undefined : 'Pripomenutie bežnej práce';
}

export function choreAttentionCount(tasks: Task[], now = new Date(), cadence?: ChoreCadence): number {
  return tasks.reduce((count, task) => task.deletedAt ? count : count + ((!cadence || (task.choreCadence ?? 'routine') === cadence) && choreAttention(task, now) ? 1 : 0) + choreAttentionCount(task.children, now, cadence), 0);
}

export function choreView<T extends Task>(task: T, day: string): T {
  return { ...task, done: task.choreCompletions ? choreDone(task, day) : task.done, children: task.children.map((child) => choreView(child, day)) };
}

export function choreHistorySummary(tasks: Task[]) {
  const collect = (items: Task[]): Task[] => items.flatMap((task) => task.deletedAt ? [] : [task, ...collect(task.children)]);
  const tracked = collect(tasks).filter(isCompletableTask);
  const entries = tracked.flatMap((task) => task.choreCompletions ?? []).filter((entry) => !entry.undoneAt);
  return {
    lastCompletedAt: entries.map((entry) => entry.completedAt).sort((a, b) => Date.parse(b) - Date.parse(a))[0],
    undatedCount: tracked.filter((task) => task.done && !task.choreCompletions).length,
  };
}

export function calculateChoreProgress(tasks: Task[], cadence: ChoreCadence) {
  const collect = (items: Task[]): Task[] => items.flatMap((task) => task.deletedAt ? [] : [task, ...collect(task.children)]);
  const tracked = collect(tasks).filter((task) => isCompletableTask(task) && (task.choreCadence ?? 'routine') === cadence);
  const totalWeight = tracked.reduce((sum, task) => sum + (task.choreWeight ?? 1), 0);
  const doneWeight = tracked.reduce((sum, task) => sum + (choreDone(task) ? task.choreWeight ?? 1 : 0), 0);
  return { done: tracked.filter((task) => choreDone(task)).length, total: tracked.length, totalWeight, doneWeight, percent: totalWeight ? Math.round(doneWeight / totalWeight * 100) : 0 };
}

export function calculateCategoryProgress(goals: Goal[], category: 'plan' | 'chore', day = gratitudeDay()) {
  const collect = (tasks: Task[]): Task[] => tasks.flatMap((task) => task.deletedAt ? [] : [task, ...collect(task.children)]);
  const tracked = goals.filter((goal) => !goal.deletedAt && normalizeGoalCategory(goal.category) === category).flatMap((goal) => {
    const items = category === 'chore' && goal.children.length ? collect(goal.children) : collect([goal]);
    return items.filter((task) => isCompletableTask(task) && (category !== 'chore' || (task.choreCadence ?? 'routine') === 'routine'));
  });
  const completed = (task: Task) => category === 'chore' ? choreDone(task, day) : task.done;
  const weight = (task: Task) => category === 'chore' ? task.choreWeight ?? 1 : 1;
  const totalWeight = tracked.reduce((sum, task) => sum + weight(task), 0);
  const doneWeight = tracked.reduce((sum, task) => sum + (completed(task) ? weight(task) : 0), 0);
  return { done: tracked.filter(completed).length, total: tracked.length, totalWeight, doneWeight, percent: totalWeight ? Math.round(doneWeight / totalWeight * 100) : 0 };
}

export function occasionalChoreSchedule(goals: Goal[]) {
  const collect = (tasks: Task[]): Task[] => tasks.flatMap((task) => task.deletedAt ? [] : [task, ...collect(task.children)]);
  return goals.filter((goal) => !goal.deletedAt && normalizeGoalCategory(goal.category) === 'chore').flatMap((goal) =>
    collect(goal.children).filter((task) => isCompletableTask(task) && task.choreCadence === 'occasional').map((task) => ({
      goalId: goal.id, goalTitle: goal.title, taskId: task.id, title: task.title, dueAt: task.dueAt,
      lastCompletedAt: (task.choreCompletions ?? []).filter((entry) => !entry.undoneAt).map((entry) => entry.completedAt).sort((a, b) => Date.parse(b) - Date.parse(a))[0],
      undated: task.done && !task.choreCompletions,
    }))).sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity) || a.title.localeCompare(b.title, 'sk'));
}

export function normalizeTaskKind(kind: Task['kind'] | undefined): TaskKind {
  return kind && taskKinds.some((option) => option.id === kind) ? kind : 'todo';
}

export function isCompletableTask(task: Task) {
  return normalizeTaskKind(task.kind) === 'todo';
}

export function clampImportance(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(maxImportance, Math.max(minImportance, Math.round(value)));
}

export function normalizeGoalImportance(goal: Goal, people: Person[]) {
  return people.reduce<Record<string, number>>((ratings, person) => {
    const savedValue = clampImportance(goal.importanceByPerson?.[person.id]);

    ratings[person.id] = savedValue ?? (person.id === goal.ownerId ? 4 : 2);

    return ratings;
  }, {});
}

export function normalizeGoalFeasibility(goal: Goal, people: Person[]) {
  return people.reduce<Record<string, number>>((ratings, person) => {
    const savedValue = clampImportance(goal.feasibilityByPerson?.[person.id]);

    ratings[person.id] = savedValue ?? 3;

    return ratings;
  }, {});
}

export function normalizeGoals(goals: Goal[], people: Person[]): Goal[] {
  return goals.map((goal) => {
    const category = normalizeGoalCategory(goal.category);
    const normalizedGoal = normalizeTask(goal);

    return {
      ...normalizedGoal,
      category,
      recurrenceDays: recurringCategoryIds.includes(category)
      ? normalizeRecurrenceDays(goal.recurrenceDays)
      : undefined,
      recurrenceHistory: recurringCategoryIds.includes(category)
      ? (Array.isArray(goal.recurrenceHistory) ? goal.recurrenceHistory.filter(Boolean).slice(0, 20) : [])
      : undefined,
      recurrenceStartAt: recurringCategoryIds.includes(category)
      ? normalizeDateTimeInput(goal.recurrenceStartAt)
      : undefined,
      recurrenceToleranceDays: recurringCategoryIds.includes(category)
      ? normalizeRecurrenceToleranceDays(goal.recurrenceToleranceDays)
      : undefined,
      feasibilityByPerson: normalizeGoalFeasibility(goal, people),
      importanceByPerson: normalizeGoalImportance(goal, people),
      spaceId: goal.spaceId ?? sharedSpaceId,
    };
  });
}

export function normalizeTask<T extends Task>(task: T): T {
  const kind = normalizeTaskKind(task.kind);

  return {
    ...task,
    done: kind === 'todo' ? task.done : false,
    kind,
    children: task.children.map(normalizeTask),
  };
}

export function normalizeGoalCategory(category: Goal['category'] | 'care' | undefined): GoalCategory {
  if (category === 'care') {
    return 'habit';
  }

  return category && goalCategories.some((option) => option.id === category)
    ? category
    : 'plan';
}

export function normalizeRecurrenceDays(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return defaultRecurrenceDays;
  }

  return Math.max(1, Math.min(365, Math.round(value)));
}

export function normalizeRecurrenceToleranceDays(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return defaultRecurrenceToleranceDays;
  }

  return Math.max(0, Math.min(60, Math.round(value)));
}

export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);

  nextDate.setDate(nextDate.getDate() + days);
  nextDate.setHours(0, 0, 0, 0);

  return nextDate;
}

export function getNextDueDate(goal: Goal) {
  const category = normalizeGoalCategory(goal.category);
  const recurrenceDays = normalizeRecurrenceDays(goal.recurrenceDays);
  const anchorDate = goal.lastCompletedAt ?? goal.recurrenceStartAt;

  if (!recurringCategoryIds.includes(category)) {
    return null;
  }

  return anchorDate ? addDays(new Date(anchorDate), recurrenceDays) : addDays(new Date(), 0);
}

export function getDaysUntil(date: Date) {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

export function formatDueLabel(date: Date) {
  const daysUntil = getDaysUntil(date);

  if (daysUntil < 0) {
    return `mešká ${Math.abs(daysUntil)} d`;
  }

  if (daysUntil === 0) {
    return 'dnes';
  }

  if (daysUntil === 1) {
    return 'zajtra';
  }

  return `o ${daysUntil} dní`;
}

export function normalizeDateTimeInput(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed || undefined;
}

export function formatDeadlineLabel(value: string | undefined) {
  if (!value) {
    return 'bez termínu';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'neplatný termín';
  }

  return date.toLocaleString('sk-SK', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function getWeekDays() {
  const today = new Date();
  const dayIndex = (today.getDay() + 6) % 7;
  const monday = new Date(today);

  monday.setDate(today.getDate() - dayIndex);
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function isSameDay(first: Date, second: Date) {
  return first.toDateString() === second.toDateString();
}

export function isCompletedThisWeek(goal: Goal, weekDays: Date[]) {
  if (!goal.lastCompletedAt) {
    return false;
  }

  const completedAt = new Date(goal.lastCompletedAt);

  return weekDays.some((day) => isSameDay(day, completedAt));
}

export function normalizePersonRanking(ranking: string[] | undefined, goals: Goal[]) {
  const activeGoalIds = new Set(goals.filter((goal) => !goal.deletedAt).map((goal) => goal.id));
  const savedIds = Array.isArray(ranking)
    ? ranking.filter((goalId) => activeGoalIds.has(goalId))
    : [];
  const missingIds = goals
    .filter((goal) => !goal.deletedAt && !savedIds.includes(goal.id))
    .map((goal) => goal.id);

  return [...savedIds, ...missingIds];
}

export function normalizeGoalRankings(
  rankings: Record<string, string[]> | undefined,
  goals: Goal[],
  people: Person[],
) {
  return people.reduce<Record<string, string[]>>((normalized, person) => {
    normalized[person.id] = normalizePersonRanking(rankings?.[person.id], goals);

    return normalized;
  }, {});
}

export function getAverageImportance(goal: Goal, people: Person[]) {
  const ratings = goal.importanceByPerson ?? {};
  let total = 0;

  for (const person of people) {
    total += clampImportance(ratings[person.id] ?? minImportance) ?? minImportance;
  }

  return total / Math.max(people.length, 1);
}

export function getAverageFeasibility(goal: Goal, people: Person[]) {
  const ratings = goal.feasibilityByPerson ?? {};
  let total = 0;

  for (const person of people) {
    total += clampImportance(ratings[person.id] ?? 3) ?? 3;
  }

  return total / Math.max(people.length, 1);
}

export function getPriorityScore(goal: Goal, people: Person[]) {
  return getAverageImportance(goal, people) * 0.75 + getAverageFeasibility(goal, people) * 0.25;
}

export function sortGoalsByAverageRanking(
  goals: Goal[],
  people: Person[],
  rankings: Record<string, string[]>,
) {
  const originalIndexById = new Map(goals.map((goal, index) => [goal.id, index]));
  const rankingByPerson = people.map((person) => normalizePersonRanking(rankings[person.id], goals));

  return [...goals].sort((first, second) => {
    const firstScore = getPriorityScore(first, people);
    const secondScore = getPriorityScore(second, people);
    const firstAverage =
      rankingByPerson.reduce((sum, ranking) => sum + ranking.indexOf(first.id), 0) /
      Math.max(rankingByPerson.length, 1);
    const secondAverage =
      rankingByPerson.reduce((sum, ranking) => sum + ranking.indexOf(second.id), 0) /
      Math.max(rankingByPerson.length, 1);

    return (
      secondScore - firstScore ||
      firstAverage - secondAverage ||
      (originalIndexById.get(first.id) ?? 0) - (originalIndexById.get(second.id) ?? 0)
    );
  });
}

export function flattenChildren(task: Task): Task[] {
  return task.children.flatMap((child) => [child, ...flattenChildren(child)]);
}

export function collectCompletedItems(goals: Goal[]) {
  return goals.flatMap<CompletedItem>((goal) => {
    const completedGoal = normalizeGoalCategory(goal.category) !== 'chore' && goal.done && isCompletableTask(goal)
      ? [{
          id: goal.id,
          ownerId: goal.ownerId,
          title: goal.title,
          type: 'goal' as const,
        }]
      : [];
    const completedTasks = flattenChildren(goal)
      .filter((task) => task.done && isCompletableTask(task))
      .map((task) => ({
        id: task.id,
        ownerId: task.ownerId,
        title: task.title,
        type: 'task' as const,
      }));

    return [...completedGoal, ...completedTasks];
  });
}

export function updateTaskTree(
  goals: Goal[],
  id: string,
  update: (task: Task) => Task,
): Goal[] {
  return goals.map((goal) => updateSingleTask(goal, id, update) as Goal);
}

export function updateSingleTask(task: Task, id: string, update: (task: Task) => Task): Task {
  if (task.id === id) {
    return update(task);
  }

  return {
    ...task,
    children: task.children.map((child) => updateSingleTask(child, id, update)),
  };
}

export function removeTask(goals: Goal[], id: string) {
  return updateTaskTree(goals, id, (task) => ({ ...task, deletedAt: new Date().toISOString() }));
}

export function removeFromChildren(tasks: Task[], id: string): Task[] {
  return tasks
    .filter((task) => task.id !== id)
    .map((task) => ({
      ...task,
      children: removeFromChildren(task.children, id),
    }));
}

export function findTaskById(tasks: Task[], id: string): Task | undefined {
  for (const task of tasks) {
    if (task.id === id) {
      return task;
    }

    const child = findTaskById(task.children, id);

    if (child) {
      return child;
    }
  }
}

export function normalizePeople(savedPeople: Person[]) {
  return defaultPeople.map((defaultPerson) => {
    const savedPerson = savedPeople.find((person) => person.id === defaultPerson.id);
    const savedName = savedPerson?.name.trim();
    const savedAvatar = getAvatarOptionsForPerson(defaultPerson.id).find(
      (avatar) => avatar.id === savedPerson?.avatarId,
    );
    const oldDefaultName =
      (defaultPerson.id === 'person-1' && savedName === 'Ja') ||
      (defaultPerson.id === 'person-2' && savedName === 'Ty');

    return {
      ...defaultPerson,
      name: savedName && !oldDefaultName ? savedName : defaultPerson.name,
      avatarId: savedAvatar?.id ?? defaultPerson.avatarId,
      tone: savedAvatar?.tone ?? savedPerson?.tone ?? defaultPerson.tone,
    };
  });
}

export function readTransferData(parsed: unknown): TransferPayload['data'] | null {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const maybeWrapped = parsed as Partial<TransferPayload>;
  const data =
    maybeWrapped.data && typeof maybeWrapped.data === 'object'
      ? maybeWrapped.data
      : parsed;
  const maybeData = data as Partial<TransferPayload['data']>;

  if (
    !Array.isArray(maybeData.goals) ||
    !Array.isArray(maybeData.people) ||
    !Array.isArray(maybeData.activityLog) ||
    typeof maybeData.activePersonId !== 'string'
  ) {
    return null;
  }

  return {
    activePersonId: maybeData.activePersonId,
    activityLog: maybeData.activityLog,
    gratitudeEntries: maybeData.gratitudeEntries,
    goalRankings:
      maybeData.goalRankings && typeof maybeData.goalRankings === 'object'
        ? maybeData.goalRankings as Record<string, string[]>
        : {},
    goals: maybeData.goals,
    people: maybeData.people,
  };
}

export function readAppStateData(parsed: unknown): AppStateData | null {
  const data = readTransferData(parsed);

  if (!data) {
    return null;
  }

  return {
    activePersonId: data.activePersonId,
    activityLog: data.activityLog,
    gratitudeEntries: data.gratitudeEntries,
    goalRankings: data.goalRankings,
    goals: data.goals,
    people: data.people,
  };
}

