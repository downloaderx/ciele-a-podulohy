'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Person = {
  id: string;
  name: string;
  tone: string;
  avatarId: string;
};

type Task = {
  id: string;
  title: string;
  ownerId: string;
  updatedById?: string;
  done: boolean;
  expanded: boolean;
  children: Task[];
};

type Goal = Task & {
  category?: GoalCategory;
  description: string;
  importanceByPerson: Record<string, number>;
  lastCompletedAt?: string;
  recurrenceDays?: number;
  deletedAt?: string;
};

type GoalCategory = 'plan' | 'chore' | 'errand' | 'habit' | 'activity';

type ActivityItem = {
  id: string;
  actorId: string;
  action: string;
  target: string;
  createdAt: string;
};

type AuthRecord = {
  hash: string;
  salt: string;
};

type CompletedItem = {
  id: string;
  ownerId: string;
  title: string;
  type: 'goal' | 'task';
};

type AppStateData = {
  activePersonId: string;
  activityLog: ActivityItem[];
  authRecords: Record<string, AuthRecord>;
  goalRankings: Record<string, string[]>;
  goals: Goal[];
  people: Person[];
};

type TransferPayload = {
  version: 1;
  exportedAt: string;
  data: AppStateData & {
    sessionPersonId?: string;
  };
};

const avatarOptions = [
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

const defaultPeople: Person[] = [
  { id: 'person-1', name: 'Rini', tone: '#ff9d4a', avatarId: 'rini-orange' },
  { id: 'person-2', name: 'Fluffy', tone: '#ff9d4a', avatarId: 'fluffy' },
];

function getAvatarOptionsForPerson(personId: string) {
  if (personId === 'person-2') {
    return avatarOptions.filter((avatar) => avatar.id === 'fluffy' || avatar.id.startsWith('fluffy-'));
  }

  return avatarOptions.filter((avatar) => avatar.id.startsWith('rini-'));
}

const authRecordsKey = 'ciele-auth-records';
const sessionPersonKey = 'ciele-session-person';
const goalRankingsKey = 'ciele-goal-rankings';
const minImportance = 1;
const maxImportance = 5;
const goalCategories: Array<{ id: GoalCategory; label: string }> = [
  { id: 'plan', label: 'Dlhodobé ciele vo vzťahu' },
  { id: 'chore', label: 'Chores' },
  { id: 'errand', label: 'Vybaviť' },
  { id: 'habit', label: 'Habits' },
  { id: 'activity', label: 'Activities' },
];
const recurringCategoryIds: GoalCategory[] = ['chore', 'habit'];
const defaultRecurrenceDays = 7;

const starterGoals: Goal[] = [
  {
    id: 'goal-launch',
    title: 'Naplánovať spoločný víkend',
    category: 'plan',
    description: 'Malý spoločný cieľ s výletom, oddychom a dobrým jedlom.',
    ownerId: 'person-1',
    importanceByPerson: {
      'person-1': 5,
      'person-2': 3,
    },
    done: false,
    expanded: true,
    children: [
      {
        id: 'task-research',
        title: 'Ujasniť rozsah prvej verzie',
        ownerId: 'person-1',
        done: true,
        expanded: true,
        children: [
          {
            id: 'task-interviews',
            title: 'Vybrať miesto, kam sa obaja tešíme',
            ownerId: 'person-1',
            done: true,
            expanded: false,
            children: [],
          },
          {
            id: 'task-risks',
            title: 'Pozrieť cestu a počasie',
            ownerId: 'person-2',
            done: false,
            expanded: false,
            children: [],
          },
        ],
      },
      {
        id: 'task-content',
        title: 'Zbaliť deku, termosku a niečo sladké',
        ownerId: 'person-2',
        done: false,
        expanded: false,
        children: [],
      },
    ],
  },
  {
    id: 'goal-marketing',
    title: 'Zútulniť domácnosť',
    category: 'chore',
    description: 'Veci, ktoré spravia spoločný priestor krajší a pokojnejší.',
    ownerId: 'person-2',
    importanceByPerson: {
      'person-1': 3,
      'person-2': 5,
    },
    done: false,
    expanded: true,
    children: [
      {
        id: 'task-copy',
        title: 'Vybrať svetielka alebo lampu',
        ownerId: 'person-2',
        done: false,
        expanded: false,
        children: [],
      },
      {
        id: 'task-review',
        title: 'Dohodnúť, čo upratať ako prvé',
        ownerId: 'person-1',
        done: false,
        expanded: false,
        children: [],
      },
    ],
  },
];

function isOldStarterData(goals: Goal[]) {
  return (
    goals.length === 2 &&
    goals[0]?.id === 'goal-launch' &&
    goals[0]?.title === 'Spustiť klientsky portál' &&
    goals[1]?.id === 'goal-marketing' &&
    goals[1]?.title === 'Dokončiť jesennú kampaň'
  );
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createRandomIndex(length: number) {
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

function calculateProgress(task: Task) {
  const descendants = flattenChildren(task);
  const trackedItems = descendants.length > 0 ? descendants : [task];
  const done = trackedItems.filter((item) => item.done).length;
  const total = trackedItems.length;

  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

function clampImportance(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(maxImportance, Math.max(minImportance, Math.round(value)));
}

function normalizeGoalImportance(goal: Goal, people: Person[]) {
  return people.reduce<Record<string, number>>((ratings, person) => {
    const savedValue = clampImportance(goal.importanceByPerson?.[person.id]);

    ratings[person.id] = savedValue ?? (person.id === goal.ownerId ? 4 : 2);

    return ratings;
  }, {});
}

function normalizeGoals(goals: Goal[], people: Person[]) {
  return goals.map((goal) => ({
    ...goal,
    category: normalizeGoalCategory(goal.category),
    recurrenceDays: recurringCategoryIds.includes(normalizeGoalCategory(goal.category))
      ? normalizeRecurrenceDays(goal.recurrenceDays)
      : undefined,
    importanceByPerson: normalizeGoalImportance(goal, people),
  }));
}

function normalizeGoalCategory(category: Goal['category'] | 'care' | undefined): GoalCategory {
  if (category === 'care') {
    return 'habit';
  }

  return category && goalCategories.some((option) => option.id === category)
    ? category
    : 'plan';
}

function normalizeRecurrenceDays(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return defaultRecurrenceDays;
  }

  return Math.max(1, Math.min(365, Math.round(value)));
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);

  nextDate.setDate(nextDate.getDate() + days);
  nextDate.setHours(0, 0, 0, 0);

  return nextDate;
}

function getNextDueDate(goal: Goal) {
  const category = normalizeGoalCategory(goal.category);
  const recurrenceDays = normalizeRecurrenceDays(goal.recurrenceDays);
  const baseDate = goal.lastCompletedAt ? new Date(goal.lastCompletedAt) : new Date();

  if (!recurringCategoryIds.includes(category)) {
    return null;
  }

  return goal.lastCompletedAt ? addDays(baseDate, recurrenceDays) : addDays(new Date(), 0);
}

function getDaysUntil(date: Date) {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function formatDueLabel(date: Date) {
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

function getWeekDays() {
  const today = new Date();
  const dayIndex = (today.getDay() + 6) % 7;
  const monday = new Date(today);

  monday.setDate(today.getDate() - dayIndex);
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function isSameDay(first: Date, second: Date) {
  return first.toDateString() === second.toDateString();
}

function isCompletedThisWeek(goal: Goal, weekDays: Date[]) {
  if (!goal.lastCompletedAt) {
    return false;
  }

  const completedAt = new Date(goal.lastCompletedAt);

  return weekDays.some((day) => isSameDay(day, completedAt));
}

function normalizePersonRanking(ranking: string[] | undefined, goals: Goal[]) {
  const activeGoalIds = new Set(goals.filter((goal) => !goal.deletedAt).map((goal) => goal.id));
  const savedIds = Array.isArray(ranking)
    ? ranking.filter((goalId) => activeGoalIds.has(goalId))
    : [];
  const missingIds = goals
    .filter((goal) => !goal.deletedAt && !savedIds.includes(goal.id))
    .map((goal) => goal.id);

  return [...savedIds, ...missingIds];
}

function normalizeGoalRankings(
  rankings: Record<string, string[]> | undefined,
  goals: Goal[],
  people: Person[],
) {
  return people.reduce<Record<string, string[]>>((normalized, person) => {
    normalized[person.id] = normalizePersonRanking(rankings?.[person.id], goals);

    return normalized;
  }, {});
}

function getAverageImportance(goal: Goal, people: Person[]) {
  const ratings = goal.importanceByPerson ?? {};
  let total = 0;

  for (const person of people) {
    total += clampImportance(ratings[person.id] ?? minImportance) ?? minImportance;
  }

  return total / Math.max(people.length, 1);
}

function sortGoalsByAverageRanking(
  goals: Goal[],
  people: Person[],
  rankings: Record<string, string[]>,
) {
  const originalIndexById = new Map(goals.map((goal, index) => [goal.id, index]));
  const rankingByPerson = people.map((person) => normalizePersonRanking(rankings[person.id], goals));

  return [...goals].sort((first, second) => {
    const firstImportance = getAverageImportance(first, people);
    const secondImportance = getAverageImportance(second, people);
    const firstAverage =
      rankingByPerson.reduce((sum, ranking) => sum + ranking.indexOf(first.id), 0) /
      Math.max(rankingByPerson.length, 1);
    const secondAverage =
      rankingByPerson.reduce((sum, ranking) => sum + ranking.indexOf(second.id), 0) /
      Math.max(rankingByPerson.length, 1);

    return (
      secondImportance - firstImportance ||
      firstAverage - secondAverage ||
      (originalIndexById.get(first.id) ?? 0) - (originalIndexById.get(second.id) ?? 0)
    );
  });
}

function flattenChildren(task: Task): Task[] {
  return task.children.flatMap((child) => [child, ...flattenChildren(child)]);
}

function collectCompletedItems(goals: Goal[]) {
  return goals.flatMap<CompletedItem>((goal) => {
    const completedGoal = goal.done
      ? [{
          id: goal.id,
          ownerId: goal.ownerId,
          title: goal.title,
          type: 'goal' as const,
        }]
      : [];
    const completedTasks = flattenChildren(goal)
      .filter((task) => task.done)
      .map((task) => ({
        id: task.id,
        ownerId: task.ownerId,
        title: task.title,
        type: 'task' as const,
      }));

    return [...completedGoal, ...completedTasks];
  });
}

function updateTaskTree(
  goals: Goal[],
  id: string,
  update: (task: Task) => Task,
): Goal[] {
  return goals.map((goal) => updateSingleTask(goal, id, update) as Goal);
}

function updateSingleTask(task: Task, id: string, update: (task: Task) => Task): Task {
  if (task.id === id) {
    return update(task);
  }

  return {
    ...task,
    children: task.children.map((child) => updateSingleTask(child, id, update)),
  };
}

function removeTask(goals: Goal[], id: string) {
  if (goals.some((goal) => goal.id === id)) {
    return goals.map((goal) =>
      goal.id === id
        ? {
            ...goal,
            deletedAt: new Date().toISOString(),
            updatedById: goal.updatedById,
          }
        : goal,
    );
  }

  return goals
    .filter((goal) => goal.id !== id)
    .map(
      (goal) =>
        ({
          ...goal,
          children: removeFromChildren(goal.children, id),
        }) as Goal,
    );
}

function removeFromChildren(tasks: Task[], id: string): Task[] {
  return tasks
    .filter((task) => task.id !== id)
    .map((task) => ({
      ...task,
      children: removeFromChildren(task.children, id),
    }));
}

function findTaskById(tasks: Task[], id: string): Task | undefined {
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

function normalizePeople(savedPeople: Person[]) {
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

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function createSalt() {
  const bytes = new Uint8Array(16);

  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
  }

  return createId();
}

async function hashPassword(password: string, salt: string) {
  const payload = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);

  return bytesToHex(new Uint8Array(digest));
}

function readTransferData(parsed: unknown): TransferPayload['data'] | null {
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
    !maybeData.authRecords ||
    typeof maybeData.authRecords !== 'object' ||
    typeof maybeData.activePersonId !== 'string'
  ) {
    return null;
  }

  return {
    activePersonId: maybeData.activePersonId,
    activityLog: maybeData.activityLog,
    authRecords: maybeData.authRecords,
    goalRankings:
      maybeData.goalRankings && typeof maybeData.goalRankings === 'object'
        ? maybeData.goalRankings as Record<string, string[]>
        : {},
    goals: maybeData.goals,
    people: maybeData.people,
    sessionPersonId:
      typeof maybeData.sessionPersonId === 'string' ? maybeData.sessionPersonId : undefined,
  };
}

function readAppStateData(parsed: unknown): AppStateData | null {
  const data = readTransferData(parsed);

  if (!data) {
    return null;
  }

  return {
    activePersonId: data.activePersonId,
    activityLog: data.activityLog,
    authRecords: data.authRecords,
    goalRankings: data.goalRankings,
    goals: data.goals,
    people: data.people,
  };
}

export default function Home() {
  const [goals, setGoals] = useState<Goal[]>(starterGoals);
  const [people, setPeople] = useState<Person[]>(defaultPeople);
  const [activePersonId, setActivePersonId] = useState(defaultPeople[0].id);
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [authRecords, setAuthRecords] = useState<Record<string, AuthRecord>>({});
  const [goalRankings, setGoalRankings] = useState<Record<string, string[]>>({});
  const [authenticated, setAuthenticated] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDescription, setNewGoalDescription] = useState('');
  const [newGoalCategory, setNewGoalCategory] = useState<GoalCategory>('plan');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordPersonId, setPasswordPersonId] = useState(defaultPeople[0].id);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [transferMessage, setTransferMessage] = useState('');
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [previewPersonId, setPreviewPersonId] = useState(defaultPeople[0].id);
  const [randomActivityId, setRandomActivityId] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [priorityRefreshKey, setPriorityRefreshKey] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const activeGoals = useMemo(
    () => goals.filter((goal) => !goal.deletedAt),
    [goals],
  );
  const activityGoals = useMemo(
    () => activeGoals.filter((goal) => normalizeGoalCategory(goal.category) === 'activity'),
    [activeGoals],
  );
  const boardGoals = useMemo(
    () => activeGoals.filter((goal) => normalizeGoalCategory(goal.category) !== 'activity'),
    [activeGoals],
  );
  const rankedActiveGoals = useMemo(
    () => sortGoalsByAverageRanking(boardGoals, people, goalRankings),
    [boardGoals, goalRankings, people],
  );
  const trashedGoals = useMemo(
    () => goals.filter((goal) => goal.deletedAt),
    [goals],
  );

  useEffect(() => {
    let cancelled = false;

    async function restoreState() {
      const savedGoals = window.localStorage.getItem('ciele-goals');
      const savedPerson = window.localStorage.getItem('ciele-active-person');
      const savedPeople = window.localStorage.getItem('ciele-people');
      const savedActivityLog = window.localStorage.getItem('ciele-activity-log');
      const savedAuthRecords = window.localStorage.getItem(authRecordsKey);
      const savedGoalRankings = window.localStorage.getItem(goalRankingsKey);
      const savedSessionPerson = window.localStorage.getItem(sessionPersonKey);
      const localState: AppStateData = {
        activePersonId:
          savedPerson && defaultPeople.some((person) => person.id === savedPerson)
            ? savedPerson
            : defaultPeople[0].id,
        activityLog: savedActivityLog ? JSON.parse(savedActivityLog) as ActivityItem[] : [],
        authRecords: savedAuthRecords
          ? JSON.parse(savedAuthRecords) as Record<string, AuthRecord>
          : {},
        goalRankings: savedGoalRankings
          ? JSON.parse(savedGoalRankings) as Record<string, string[]>
          : {},
        goals: savedGoals ? JSON.parse(savedGoals) as Goal[] : starterGoals,
        people: savedPeople ? JSON.parse(savedPeople) as Person[] : defaultPeople,
      };
      let restoredState = localState;

      try {
        const response = await fetch('/api/state', { cache: 'no-store' });

        if (response.ok) {
          const payload = await response.json() as { data?: unknown };
          const serverState = readAppStateData(payload.data);

          if (serverState) {
            restoredState = serverState;
          }
        }
      } catch {
        restoredState = localState;
      }

      if (cancelled) {
        return;
      }

      const normalizedPeople = normalizePeople(restoredState.people);
      const restoredActivePersonId = normalizedPeople.some(
        (person) => person.id === restoredState.activePersonId,
      )
        ? restoredState.activePersonId
        : normalizedPeople[0]?.id ?? defaultPeople[0].id;
      const normalizedGoals = normalizeGoals(
        isOldStarterData(restoredState.goals) ? starterGoals : restoredState.goals,
        normalizedPeople,
      );
      const normalizedGoalRankings = normalizeGoalRankings(
        restoredState.goalRankings,
        normalizedGoals,
        normalizedPeople,
      );

      setGoals(normalizedGoals);
      setPeople(normalizedPeople);
      setActivePersonId(restoredActivePersonId);
      setPreviewPersonId(restoredActivePersonId);
      setPasswordPersonId(restoredActivePersonId);
      setActivityLog(restoredState.activityLog);
      setAuthRecords(restoredState.authRecords);
      setGoalRankings(normalizedGoalRankings);

      if (savedSessionPerson && restoredState.authRecords[savedSessionPerson]) {
        setActivePersonId(savedSessionPerson);
        setPreviewPersonId(savedSessionPerson);
        setPasswordPersonId(savedSessionPerson);
        setAuthenticated(true);
      }

      setLoaded(true);
    }

    void restoreState();

    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!loaded) {
      return;
    }

    window.localStorage.setItem('ciele-goals', JSON.stringify(goals));
    window.localStorage.setItem('ciele-active-person', activePersonId);
    window.localStorage.setItem('ciele-people', JSON.stringify(people));
    window.localStorage.setItem('ciele-activity-log', JSON.stringify(activityLog));
    window.localStorage.setItem(authRecordsKey, JSON.stringify(authRecords));
    window.localStorage.setItem(goalRankingsKey, JSON.stringify(goalRankings));

    const timeoutId = window.setTimeout(() => {
      void fetch('/api/state', {
        body: JSON.stringify({
          activePersonId,
          activityLog,
          authRecords,
          goalRankings,
          goals,
          people,
        } satisfies AppStateData),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      }).catch(() => {
        // Local storage remains the offline fallback when Supabase is unavailable.
      });
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activePersonId, activityLog, authRecords, goalRankings, goals, loaded, people]);

  const totals = useMemo(() => {
    const allTasks = boardGoals.flatMap((goal) => [goal, ...flattenChildren(goal)]);
    const done = allTasks.filter((task) => task.done).length;
    const total = allTasks.length;

    return {
      done,
      total,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  }, [boardGoals]);
  const completedItems = useMemo(
    () => collectCompletedItems(boardGoals).slice(0, 10),
    [boardGoals],
  );
  const recurringGoals = useMemo(
    () =>
      activeGoals
        .filter((goal) => recurringCategoryIds.includes(normalizeGoalCategory(goal.category)))
        .sort((first, second) => {
          const firstDue = getNextDueDate(first)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const secondDue = getNextDueDate(second)?.getTime() ?? Number.MAX_SAFE_INTEGER;

          return firstDue - secondDue;
        }),
    [activeGoals],
  );
  const randomActivity = useMemo(
    () => activityGoals.find((goal) => goal.id === randomActivityId) ?? null,
    [activityGoals, randomActivityId],
  );

  const goalSnapshots = useMemo(
    () =>
      rankedActiveGoals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        ...calculateProgress(goal),
      })),
    [rankedActiveGoals],
  );
  const activePerson = useMemo(
    () => people.find((person) => person.id === activePersonId) ?? people[0],
    [activePersonId, people],
  );
  const previewPerson = useMemo(
    () => people.find((person) => person.id === previewPersonId) ?? activePerson,
    [activePerson, previewPersonId, people],
  );
  const passwordPerson = useMemo(
    () => people.find((person) => person.id === passwordPersonId) ?? activePerson,
    [activePerson, passwordPersonId, people],
  );

  function addGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newGoalTitle.trim();

    if (!title) {
      return;
    }

    const goalId = createId();

    setGoals((current) => [
      {
        id: goalId,
        title,
        category: newGoalCategory,
        description: newGoalDescription.trim() || 'Malý spoločný plán bez veľkého tlaku.',
        ownerId: activePersonId,
        updatedById: activePersonId,
        importanceByPerson: people.reduce<Record<string, number>>((ratings, person) => {
          ratings[person.id] = person.id === activePersonId ? 4 : 2;

          return ratings;
        }, {}),
        done: false,
        expanded: true,
        children: [],
      },
      ...current,
    ]);
    if (newGoalCategory !== 'activity') {
      setGoalRankings((current) =>
        people.reduce<Record<string, string[]>>((rankings, person) => {
          const currentRanking = normalizePersonRanking(current[person.id], boardGoals);

          rankings[person.id] =
            person.id === activePersonId
              ? [goalId, ...currentRanking]
              : [...currentRanking, goalId];

          return rankings;
        }, { ...current }),
      );
    }
    addActivity('pridal(a) plán', title);
    setNewGoalTitle('');
    setNewGoalDescription('');
    setNewGoalCategory('plan');
  }

  function addSubtask(parentId: string, title: string) {
    const trimmed = title.trim();

    if (!trimmed) {
      return;
    }

    setGoals((current) =>
      updateTaskTree(current, parentId, (task) => ({
        ...task,
        expanded: true,
        children: [
          ...task.children,
          {
            id: createId(),
            title: trimmed,
            ownerId: activePersonId,
            updatedById: activePersonId,
            done: false,
            expanded: true,
            children: [],
          },
        ],
      })),
    );
    addActivity('pridal(a) podúlohu', trimmed);
  }

  function toggleDone(taskId: string) {
    const task = findTaskById(goals, taskId);

    setGoals((current) =>
      updateTaskTree(current, taskId, (task) => ({
        ...task,
        done: !task.done,
        updatedById: activePersonId,
      })),
    );

    if (task) {
      addActivity(task.done ? 'vrátil(a) späť' : 'označil(a) ako hotové', task.title);
    }
  }

  function toggleExpanded(taskId: string) {
    setGoals((current) =>
      updateTaskTree(current, taskId, (task) => ({
        ...task,
        expanded: !task.expanded,
      })),
    );
  }

  function renameTask(taskId: string, title: string) {
    const trimmed = title.trim();
    const task = findTaskById(goals, taskId);

    if (!trimmed || !task || task.title === trimmed) {
      return;
    }

    setGoals((current) =>
      updateTaskTree(current, taskId, (task) => ({
        ...task,
        title: trimmed,
        updatedById: activePersonId,
      })),
    );
    addActivity('premenil(a)', `${task.title} → ${trimmed}`);
  }

  function updateGoalDescription(goalId: string, description: string) {
    const trimmed = description.trim();
    const goal = goals.find((goal) => goal.id === goalId);

    if (!goal || goal.description === trimmed) {
      return;
    }

    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              description: trimmed || 'Bez poznámky.',
              updatedById: activePersonId,
            }
          : goal,
      ),
    );
    addActivity('upravil(a) poznámku', goal.title);
  }

  function changeGoalCategory(goalId: string, category: GoalCategory) {
    const goal = goals.find((goal) => goal.id === goalId);

    if (!goal || goal.category === category) {
      return;
    }

    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              category,
              recurrenceDays: recurringCategoryIds.includes(category)
                ? normalizeRecurrenceDays(goal.recurrenceDays)
                : undefined,
              updatedById: activePersonId,
            }
          : goal,
      ),
    );
    addActivity('zmenil(a) kategóriu', goal.title);
  }

  function changeGoalRecurrence(goalId: string, recurrenceDays: number) {
    const goal = goals.find((goal) => goal.id === goalId);
    const normalizedDays = normalizeRecurrenceDays(recurrenceDays);

    if (!goal || goal.recurrenceDays === normalizedDays) {
      return;
    }

    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              recurrenceDays: normalizedDays,
              updatedById: activePersonId,
            }
          : goal,
      ),
    );
    addActivity('upravil(a) opakovanie', goal.title);
  }

  function completeRecurringGoalToday(goalId: string) {
    const goal = goals.find((goal) => goal.id === goalId);

    if (!goal) {
      return;
    }

    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              lastCompletedAt: new Date().toISOString(),
              updatedById: activePersonId,
            }
          : goal,
      ),
    );
    addActivity('spravil(a) opakovanú vec', goal.title);
  }

  function pickRandomActivity() {
    if (activityGoals.length === 0) {
      setRandomActivityId(null);
      return;
    }

    const nextActivity = activityGoals[createRandomIndex(activityGoals.length)];

    setRandomActivityId(nextActivity.id);
    addActivity('vyžreboval(a) aktivitu', nextActivity.title);
  }

  function deleteTask(taskId: string) {
    const task = findTaskById(goals, taskId);

    setGoals((current) => removeTask(current, taskId));

    if (task) {
      addActivity(
        goals.some((goal) => goal.id === taskId) ? 'presunul(a) plán do koša' : 'zmazal(a)',
        task.title,
      );
    }
  }

  function restoreGoal(goalId: string) {
    const goal = goals.find((goal) => goal.id === goalId);

    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              deletedAt: undefined,
              updatedById: activePersonId,
            }
          : goal,
      ),
    );

    if (goal) {
      addActivity('obnovil(a) plán z koša', goal.title);
    }
  }

  function rateGoalImportance(goalId: string, personId: string, importance: number) {
    const normalizedImportance = clampImportance(importance);
    const goal = goals.find((goal) => goal.id === goalId);
    const personName = people.find((person) => person.id === personId)?.name ?? 'Foxie';

    if (!goal || !normalizedImportance) {
      return;
    }

    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              importanceByPerson: {
                ...normalizeGoalImportance(goal, people),
                [personId]: normalizedImportance,
              },
              updatedById: activePersonId,
            }
          : goal,
      ),
    );
    addActivity('ohodnotil(a) dôležitosť', `${goal.title} · ${personName}: ${normalizedImportance}/5`);
  }

  function moveGoalInRanking(goalId: string, direction: -1 | 1) {
    const activeGoalIds = boardGoals.map((goal) => goal.id);
    const currentRanking = normalizePersonRanking(goalRankings[activePersonId], boardGoals);
    const currentIndex = currentRanking.indexOf(goalId);
    const nextIndex = currentIndex + direction;

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= currentRanking.length) {
      return;
    }

    const nextRanking = [...currentRanking];
    const [movedGoalId] = nextRanking.splice(currentIndex, 1);
    nextRanking.splice(nextIndex, 0, movedGoalId);

    setGoalRankings((current) => ({
      ...current,
      [activePersonId]: [
        ...nextRanking,
        ...(current[activePersonId] ?? []).filter((savedGoalId) => !activeGoalIds.includes(savedGoalId)),
      ],
    }));

    const movedGoal = goals.find((goal) => goal.id === goalId);

    if (movedGoal) {
      addActivity('zoradil(a) priority', movedGoal.title);
    }
  }

  function renamePerson(personId: string, name: string) {
    const fallbackName =
      defaultPeople.find((person) => person.id === personId)?.name ?? 'Foxie';
    const trimmed = name.trim() || fallbackName;
    const oldName = people.find((person) => person.id === personId)?.name.trim() || fallbackName;

    setPeople((current) =>
      current.map((person) =>
        person.id === personId
          ? {
              ...person,
              name: trimmed,
            }
          : person,
      ),
    );

    if (oldName !== trimmed) {
      addActivity('upravil(a) menovku', `${oldName} → ${trimmed}`);
    }
  }

  function changePersonName(personId: string, name: string) {
    setPeople((current) =>
      current.map((person) =>
        person.id === personId
          ? {
              ...person,
              name,
            }
          : person,
      ),
    );
  }

  function changePersonAvatar(personId: string, avatarId: string) {
    const selectedAvatar = getAvatarOptionsForPerson(personId).find(
      (avatar) => avatar.id === avatarId,
    );
    const currentPerson = people.find((person) => person.id === personId);

    if (
      personId !== activePersonId ||
      !selectedAvatar ||
      currentPerson?.avatarId === selectedAvatar.id
    ) {
      return;
    }

    const personName = currentPerson?.name ?? 'Foxie';

    setPeople((current) =>
      current.map((person) =>
        person.id === personId
          ? {
              ...person,
              avatarId: selectedAvatar.id,
              tone: selectedAvatar.tone,
            }
          : person,
      ),
    );

    addActivity('vybral(a) nový avatar', personName);
    setAvatarMenuOpen(false);
  }

  function addActivity(action: string, target: string) {
    setActivityLog((current) => [
      {
        id: createId(),
        actorId: activePersonId,
        action,
        target,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ].slice(0, 80));
  }

  async function authenticatePerson(personId: string, password: string) {
    const trimmed = password.trim();

    if (trimmed.length < 8) {
      return {
        ok: false,
        message: 'Heslo nech má aspoň 8 znakov, nech nie je úplne ľahké uhádnuť.',
      };
    }

    const savedRecord = authRecords[personId];

    if (savedRecord) {
      const attemptHash = await hashPassword(trimmed, savedRecord.salt);

      if (attemptHash !== savedRecord.hash) {
        return { ok: false, message: 'Toto heslo nesedí.' };
      }

      setActivePersonId(personId);
      setPasswordPersonId(personId);
      setAuthenticated(true);
      window.localStorage.setItem(sessionPersonKey, personId);
      return { ok: true, message: '' };
    }

    const salt = createSalt();
    const hash = await hashPassword(trimmed, salt);

    setAuthRecords((current) => ({
      ...current,
      [personId]: { hash, salt },
    }));
    setActivePersonId(personId);
    setPasswordPersonId(personId);
    setAuthenticated(true);
    window.localStorage.setItem(sessionPersonKey, personId);
    addActivity('nastavil(a) heslo', 'svoj vstup do tabule');

    return { ok: true, message: '' };
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newPassword.trim();
    const confirmed = newPasswordConfirm.trim();
    const targetPersonId = activePersonId;
    const targetPerson = people.find((person) => person.id === activePersonId) ?? activePerson;

    setPasswordMessage('');

    if (trimmed.length < 8) {
      setPasswordMessage('Nové heslo nech má aspoň 8 znakov.');
      return;
    }

    if (trimmed !== confirmed) {
      setPasswordMessage('Heslá sa nezhodujú.');
      return;
    }

    setSavingPassword(true);
    const salt = createSalt();
    const hash = await hashPassword(trimmed, salt);

    setAuthRecords((current) => ({
      ...current,
      [targetPersonId]: { hash, salt },
    }));
    setNewPassword('');
    setNewPasswordConfirm('');
    setSavingPassword(false);
    setPasswordMessage(`Hotovo, nové heslo pre ${targetPerson?.name ?? 'Foxie'} je uložené.`);
    addActivity('zmenil(a) heslo', 'svoj vstup');
  }

  function openPasswordModal(personId = activePersonId) {
    if (personId !== activePersonId) {
      return;
    }

    setSettingsOpen(false);
    setPasswordPersonId(activePersonId);
    setNewPassword('');
    setNewPasswordConfirm('');
    setPasswordMessage('');
    setPasswordModalOpen(true);
  }

  function closePasswordModal() {
    setPasswordModalOpen(false);
    setNewPassword('');
    setNewPasswordConfirm('');
    setPasswordMessage('');
  }

  function createTransferPayload(): TransferPayload {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        activePersonId,
        activityLog,
        authRecords,
        goalRankings,
        goals,
        people,
        sessionPersonId: window.localStorage.getItem(sessionPersonKey) ?? undefined,
      },
    };
  }

  function openTransferModal() {
    setSettingsOpen(false);
    setTransferMessage('');
    setImportText('');
    setTransferModalOpen(true);
  }

  function closeTransferModal() {
    setTransferModalOpen(false);
    setTransferMessage('');
    setImportText('');
  }

  function exportData() {
    const payload = createTransferPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `little-acorns-foxies-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setTransferMessage('Záloha je stiahnutá ako JSON súbor.');
  }

  function importData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTransferMessage('');

    try {
      const data = readTransferData(JSON.parse(importText));

      if (!data) {
        setTransferMessage('Tento JSON nevyzerá ako záloha z tejto appky.');
        return;
      }

      const importedPeople = normalizePeople(data.people);
      const importedActivePersonId = importedPeople.some(
        (person) => person.id === data.activePersonId,
      )
        ? data.activePersonId
        : importedPeople[0]?.id ?? defaultPeople[0].id;
      const importedGoals = normalizeGoals(data.goals, importedPeople);
      const importedGoalRankings = normalizeGoalRankings(
        data.goalRankings,
        importedGoals,
        importedPeople,
      );

      setGoals(importedGoals);
      setPeople(importedPeople);
      setActivityLog(data.activityLog);
      setAuthRecords(data.authRecords);
      setGoalRankings(importedGoalRankings);
      setActivePersonId(importedActivePersonId);
      setPreviewPersonId(importedActivePersonId);
      setPasswordPersonId(importedActivePersonId);

      window.localStorage.setItem('ciele-goals', JSON.stringify(importedGoals));
      window.localStorage.setItem('ciele-active-person', importedActivePersonId);
      window.localStorage.setItem('ciele-people', JSON.stringify(importedPeople));
      window.localStorage.setItem('ciele-activity-log', JSON.stringify(data.activityLog));
      window.localStorage.setItem(authRecordsKey, JSON.stringify(data.authRecords));
      window.localStorage.setItem(goalRankingsKey, JSON.stringify(importedGoalRankings));

      if (data.sessionPersonId && data.authRecords[data.sessionPersonId]) {
        window.localStorage.setItem(sessionPersonKey, data.sessionPersonId);
        setAuthenticated(true);
      }

      setImportText('');
      setTransferMessage('Dáta sú importované. Táto verzia appky ich už vidí.');
    } catch {
      setTransferMessage('JSON sa nepodarilo prečítať. Skontroluj, či je celý skopírovaný.');
    }
  }

  function logout() {
    window.localStorage.removeItem(sessionPersonKey);
    setAuthenticated(false);
    setSettingsOpen(false);
    setPasswordModalOpen(false);
    setTransferModalOpen(false);
    setAvatarMenuOpen(false);
    setTrashOpen(false);
    setPreviewPersonId(activePersonId);
    setNewPassword('');
    setNewPasswordConfirm('');
    setPasswordMessage('');
    setTransferMessage('');
  }

  const recentActivity = activityLog.slice(0, 12);

  if (!loaded) {
    return null;
  }

  if (!authenticated) {
    return (
      <AuthGate
        authRecords={authRecords}
        onAuthenticate={authenticatePerson}
        people={people}
      />
    );
  }

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Prehľad tímu">
        <div className="brand-lockup">
          <div className="fox-pair" aria-hidden="true">
            <img alt="" className="foxies-logo" src="/foxies-logo.png" />
          </div>
          <div>
            <p className="eyebrow">Virtuálna tabuľa plánov</p>
            <h1 className="brand-title">
              <span>Little</span>
              <span className="crossed-word">acorns</span>
              <span>Foxies</span>
            </h1>
          </div>
        </div>
        <div className="team-switcher" aria-label="Aktívny používateľ">
          {people.map((person) => (
            <div
              key={person.id}
              className={[
                'person-card',
                person.id === activePersonId ? 'active' : '',
                person.id === previewPersonId && person.id !== activePersonId ? 'previewed' : '',
              ].filter(Boolean).join(' ')}
              style={{ '--person-tone': person.tone } as React.CSSProperties}
            >
              <button
                aria-label={
                  person.id === activePersonId
                    ? `Prihlásená osoba ${person.name}`
                    : `Ikonka osoby ${person.name}`
                }
                className="person-fox"
                onClick={() => setPreviewPersonId(person.id)}
                title={person.id === activePersonId ? 'Toto je prihlásená líštička' : 'Zobraziť náhľad tejto líštičky'}
                type="button"
              >
                <AvatarFox person={person} size="medium" />
              </button>
              <div className="person-details">
                <div className="person-name-row">
                  <input
                    aria-label={`Meno osoby ${person.name}`}
                    className="person-name"
                    onChange={(event) => changePersonName(person.id, event.target.value)}
                    onBlur={(event) => renamePerson(person.id, event.target.value)}
                    value={person.name}
                  />
                  {person.id === activePersonId ? (
                    <span className="signed-in-badge">prihlásený</span>
                  ) : person.id === previewPersonId ? (
                    <span className="signed-in-badge preview">náhľad</span>
                  ) : null}
                </div>
                {person.id === activePersonId ? (
                  <div className="person-actions">
                    <div className="avatar-dropdown">
                      <button
                        aria-expanded={avatarMenuOpen}
                        className="avatar-dropdown-button"
                        onClick={() => setAvatarMenuOpen((open) => !open)}
                        type="button"
                      >
                        Zmeniť ikonku
                      </button>
                      {avatarMenuOpen ? (
                        <div className="avatar-picker" aria-label={`Avatar pre ${person.name}`}>
                          {getAvatarOptionsForPerson(person.id).map((avatar) => (
                            <button
                              aria-label={avatar.label}
                              className={avatar.id === person.avatarId ? 'avatar-choice active' : 'avatar-choice'}
                              key={avatar.id}
                              onClick={() => changePersonAvatar(person.id, avatar.id)}
                              style={{ '--avatar-tone': avatar.tone } as React.CSSProperties}
                              title={avatar.label}
                              type="button"
                            >
                              <img alt="" src={avatar.src} />
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button
                      className="person-password-button"
                      onClick={() => openPasswordModal(person.id)}
                      type="button"
                    >
                      Heslo
                    </button>
                  </div>
                ) : (
                  <span className="avatar-owner-note">klik neodhlasuje, len ukáže náhľad</span>
                )}
              </div>
            </div>
          ))}
          <label className="preview-select">
            Náhľad ako
            <select
              onChange={(event) => setPreviewPersonId(event.target.value)}
              value={previewPersonId}
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <div className="trash-menu">
            <button
              aria-expanded={trashOpen}
              aria-label="Kôš plánov"
              className="settings-button"
              onClick={() => {
                setSettingsOpen(false);
                setTrashOpen((open) => !open);
              }}
              title="Kôš"
              type="button"
            >
              🗑
            </button>
            {trashOpen ? (
              <div className="trash-popover">
                <div className="trash-popover-heading">
                  <strong>Kôš</strong>
                  <span>{trashedGoals.length}</span>
                </div>
                {trashedGoals.length > 0 ? (
                  <div className="trash-popover-list">
                    {trashedGoals.map((goal) => (
                      <button
                        key={goal.id}
                        onClick={() => {
                          restoreGoal(goal.id);
                          setTrashOpen(false);
                        }}
                        type="button"
                      >
                        <span>{goal.title}</span>
                        <small>Obnoviť</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>Kôš je prázdny.</p>
                )}
              </div>
            ) : null}
          </div>
          <div className="settings-menu">
            <button
              aria-expanded={settingsOpen}
              aria-label="Nastavenia"
              className="settings-button"
              onClick={() => setSettingsOpen((open) => !open)}
              title="Nastavenia"
              type="button"
            >
              ⚙
            </button>
            {settingsOpen ? (
              <div className="settings-popover">
                <button onClick={() => openPasswordModal(activePersonId)} type="button">
                  Zmeniť moje heslo
                </button>
                <button onClick={openTransferModal} type="button">
                  Prenos dát
                </button>
                <button onClick={logout} type="button">
                  Odhlásiť
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {previewPersonId !== activePersonId ? (
        <section className="preview-notice" aria-label="Náhľad inej líštičky">
          Pozeráš náhľad ako <strong>{previewPerson?.name ?? 'Foxie'}</strong>. Úpravy a hlasovanie sa stále ukladajú ako <strong>{activePerson?.name ?? 'Foxie'}</strong>.
        </section>
      ) : null}

      {passwordModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-label="Zmena hesla"
            aria-modal="true"
            className="password-modal"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <span className="label">Heslo</span>
                <h2>Heslo pre {passwordPerson?.name ?? 'Foxie'}</h2>
              </div>
              <button
                aria-label="Zatvoriť zmenu hesla"
                className="icon-button compact"
                onClick={closePasswordModal}
                type="button"
              >
                ×
              </button>
            </div>
            <form className="password-form" onSubmit={changePassword}>
              <label>
                Nové heslo
                <input
                  autoComplete="new-password"
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Aspoň 8 znakov"
                  type="password"
                  value={newPassword}
                />
              </label>
              <label>
                Ešte raz
                <input
                  autoComplete="new-password"
                  onChange={(event) => setNewPasswordConfirm(event.target.value)}
                  placeholder="Zopakuj heslo"
                  type="password"
                  value={newPasswordConfirm}
                />
              </label>
              {passwordMessage ? <strong className="password-message">{passwordMessage}</strong> : null}
              <button disabled={savingPassword} type="submit">
                Uložiť nové heslo
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {transferModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-label="Prenos dát"
            aria-modal="true"
            className="password-modal data-modal"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <span className="label">Prenos dát</span>
                <h2>Export a import</h2>
              </div>
              <button
                aria-label="Zatvoriť prenos dát"
                className="icon-button compact"
                onClick={closeTransferModal}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="transfer-actions">
              <button onClick={exportData} type="button">
                Stiahnuť zálohu
              </button>
            </div>
            <form className="transfer-form" onSubmit={importData}>
              <label>
                Vložiť JSON zálohu
                <textarea
                  onChange={(event) => setImportText(event.target.value)}
                  placeholder='{"version":1,"data":{...}}'
                  value={importText}
                />
              </label>
              <p>
                Import prepíše lokálne dáta v tomto prehliadači. Heslá zostanú iba ako uložené hash záznamy zo zálohy.
              </p>
              {transferMessage ? <strong className="transfer-message">{transferMessage}</strong> : null}
              <button disabled={!importText.trim()} type="submit">
                Importovať dáta
              </button>
            </form>
          </section>
        </div>
      ) : null}

      <section className="summary-grid" aria-label="Celkový stav">
        <div className="summary-panel">
          <span className="label">Stav na tabuli</span>
          <strong>{totals.percent}%</strong>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${totals.percent}%` }} />
          </div>
          <GrowthBranch percent={totals.percent} />
          <p>
            Hotovo {totals.done} z {totals.total} drobných krokov vo vašich spoločných plánoch.
          </p>
        </div>
        <form className="new-goal" onSubmit={addGoal}>
          <ProjectProgressStrip goals={goalSnapshots} />
          <label>
            Nový spoločný plán
            <input
              onChange={(event) => setNewGoalTitle(event.target.value)}
              placeholder="Napr. spraviť filmový večer"
              value={newGoalTitle}
            />
          </label>
          <label>
            Malá poznámka
            <input
              onChange={(event) => setNewGoalDescription(event.target.value)}
              placeholder="Čo by malo byť hotové alebo milé"
              value={newGoalDescription}
            />
          </label>
          <label>
            Kategória
            <select
              onChange={(event) => setNewGoalCategory(event.target.value as GoalCategory)}
              value={newGoalCategory}
            >
              {goalCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Pridať plán</button>
        </form>
      </section>

      {recentActivity.length > 0 ? (
        <RecentActivityPanel activityLog={recentActivity} people={people} />
      ) : null}

      <CompletedWorkPanel completedItems={completedItems} people={people} />

      <ActivityWheelPanel
        activitiesOpen={activitiesOpen}
        activities={activityGoals}
        onToggleActivities={() => setActivitiesOpen((open) => !open)}
        onPickRandom={pickRandomActivity}
        selectedActivity={randomActivity}
      />

      <RecurringCalendarPanel
        goals={recurringGoals}
        onChangeRecurrence={changeGoalRecurrence}
        onCompleteToday={completeRecurringGoalToday}
      />

      <PriorityPoll
        activePersonId={activePersonId}
        goals={boardGoals}
        goalRankings={goalRankings}
        onRefreshOrder={() => setPriorityRefreshKey((key) => key + 1)}
        onMoveGoal={moveGoalInRanking}
        people={people}
        refreshKey={priorityRefreshKey}
        rankedGoals={rankedActiveGoals}
      />

      <section className="board" aria-label="Zoznam cieľov">
        {rankedActiveGoals.map((goal) => (
          <GoalPanel
            activePersonId={activePersonId}
            goal={goal}
            key={goal.id}
            onAddSubtask={addSubtask}
            onChangeCategory={changeGoalCategory}
            onChangeRecurrence={changeGoalRecurrence}
            onCompleteRecurring={completeRecurringGoalToday}
            onDelete={deleteTask}
            onRateImportance={rateGoalImportance}
            onRenameDescription={updateGoalDescription}
            onRename={renameTask}
            people={people}
            toggleDone={toggleDone}
            toggleExpanded={toggleExpanded}
          />
        ))}
      </section>
    </main>
  );
}

function AuthGate({
  authRecords,
  onAuthenticate,
  people,
}: {
  authRecords: Record<string, AuthRecord>;
  onAuthenticate: (personId: string, password: string) => Promise<{ ok: boolean; message: string }>;
  people: Person[];
}) {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [foxName, setFoxName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const selectedPerson = selectedPersonId
    ? people.find((person) => person.id === selectedPersonId) ?? null
    : null;
  const hasPassword = selectedPersonId ? Boolean(authRecords[selectedPersonId]) : false;

  function normalizeAnswer(value: string) {
    return value
      .trim()
      .toLocaleLowerCase('sk-SK')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function matchPerson(value: string) {
    const answer = normalizeAnswer(value);

    if (!answer) {
      return undefined;
    }

    return people.find((person) => {
      const personName = normalizeAnswer(person.name);

      return answer === personName || answer === person.id || personName.includes(answer);
    });
  }

  function choosePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const matchedPerson = matchPerson(foxName);

    if (!matchedPerson) {
      setMessage('Napíš prosím Rini alebo Fluffy.');
      return;
    }

    setSelectedPersonId(matchedPerson.id);
    setPassword('');
    setPasswordConfirm('');
    setMessage('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    if (!selectedPersonId) {
      setSubmitting(false);
      return;
    }

    if (!hasPassword && password.trim() !== passwordConfirm.trim()) {
      setMessage('Heslá sa nezhodujú.');
      setSubmitting(false);
      return;
    }

    const result = await onAuthenticate(selectedPersonId, password);

    if (!result.ok) {
      setMessage(result.message);
      setSubmitting(false);
      return;
    }

    setPassword('');
    setPasswordConfirm('');
    setSubmitting(false);
  }

  function goBackToQuestion() {
    setSelectedPersonId(null);
    setPassword('');
    setPasswordConfirm('');
    setMessage('');
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-label="Prihlásenie do tabule">
        <div className="auth-brand">
          <div className="fox-pair" aria-hidden="true">
            <img alt="" className="foxies-logo" src="/foxies-logo.png" />
          </div>
          <div>
            <p className="eyebrow">Little acorns Foxies</p>
            <h1>Ktorá líštička ide plánovať?</h1>
          </div>
        </div>

        {!selectedPerson ? (
          <form className="auth-form" onSubmit={choosePerson}>
            <label>
              Ktorá líštička si?
              <input
                autoComplete="username"
                autoFocus
                onChange={(event) => {
                  setFoxName(event.target.value);
                  setMessage('');
                }}
                placeholder="Rini alebo Fluffy"
                value={foxName}
              />
            </label>
            <p>Najprv povedz, ktorá líštička prišla k tabuli.</p>
            {message ? <strong className="auth-error">{message}</strong> : null}
            <button type="submit">Pokračovať</button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label>
              {hasPassword ? 'Tvoje heslo' : 'Nastav si heslo'}
              <input
                autoComplete={hasPassword ? 'current-password' : 'new-password'}
                autoFocus
                onChange={(event) => setPassword(event.target.value)}
                placeholder={hasPassword ? 'Napíš svoje heslo' : 'Aspoň 8 znakov'}
                type="password"
                value={password}
              />
            </label>
            {!hasPassword ? (
              <label>
                Ešte raz
                <input
                  autoComplete="new-password"
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  placeholder="Zopakuj heslo"
                  type="password"
                  value={passwordConfirm}
                />
              </label>
            ) : null}
            <p>
              {hasPassword
                ? 'Ak heslo sedí, otvorí sa tvoja tabuľa.'
                : 'Vyzerá to, že si heslo ešte nenastavovala. Ulož si ho a vojdeš dovnútra.'}
            </p>
            {message ? <strong className="auth-error">{message}</strong> : null}
            <button disabled={submitting} type="submit">
              {hasPassword ? 'Vojsť do tabule' : 'Uložiť heslo a vojsť'}
            </button>
            <button className="auth-link-button" onClick={goBackToQuestion} type="button">
              Nie som {selectedPerson.name}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function RecentActivityPanel({
  activityLog,
  people,
}: {
  activityLog: ActivityItem[];
  people: Person[];
}) {
  return (
    <section className="activity-panel" aria-label="Posledné zmeny na tabuli">
      <div className="activity-heading">
        <div>
          <span className="label">Posledné zmeny</span>
          <h2>Čo sa pohlo na tabuli</h2>
        </div>
      </div>
      <ol className="activity-list">
        {activityLog.map((item) => {
          const actor = people.find((person) => person.id === item.actorId);

          return (
            <li
              key={item.id}
              style={{ '--activity-tone': actor?.tone ?? '#35d0ba' } as React.CSSProperties}
            >
              <span className="activity-actor">
                {actor ? <AvatarFox person={actor} size="small" /> : null}
                {actor?.name ?? 'Foxie'}
              </span>
              <span>{item.action}</span>
              <strong>{item.target}</strong>
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString('sk-SK', {
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  month: '2-digit',
                })}
              </time>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function GrowthBranch({ percent }: { percent: number }) {
  const markers = [20, 40, 60, 80, 100];

  return (
    <div className="growth-branch" aria-label={`Vetvička plánov je na ${percent}%`}>
      <span className="branch-line" />
      {markers.map((marker, index) => (
        <span
          className={percent >= marker ? 'branch-marker active' : 'branch-marker'}
          key={marker}
          style={{ '--marker-index': index } as React.CSSProperties}
        >
          <span className="leaf" />
          <span className="acorn" />
        </span>
      ))}
    </div>
  );
}

function CompletedWorkPanel({
  completedItems,
  people,
}: {
  completedItems: CompletedItem[];
  people: Person[];
}) {
  return (
    <section className="completed-panel" aria-label="Hotové veci">
      <div className="completed-heading">
        <div>
          <span className="label">Hotové veci</span>
          <h2>Čo ste už porobili</h2>
        </div>
        <strong>{completedItems.length}</strong>
      </div>
      {completedItems.length > 0 ? (
        <ol className="completed-list">
          {completedItems.map((item) => {
            const owner = people.find((person) => person.id === item.ownerId);

            return (
              <li key={item.id}>
                <span className="completed-owner">
                  {owner ? <AvatarFox person={owner} size="small" /> : null}
                  {owner?.name ?? 'Foxie'}
                </span>
                <strong>{item.title}</strong>
                <small>{item.type === 'goal' ? 'celý plán' : 'krok'}</small>
              </li>
            );
          })}
        </ol>
      ) : (
        <p>Zatiaľ tu čaká prvá odškrtnutá vec.</p>
      )}
    </section>
  );
}

function ActivityWheelPanel({
  activitiesOpen,
  activities,
  onToggleActivities,
  onPickRandom,
  selectedActivity,
}: {
  activitiesOpen: boolean;
  activities: Goal[];
  onToggleActivities: () => void;
  onPickRandom: () => void;
  selectedActivity: Goal | null;
}) {
  return (
    <section className="special-panel activity-wheel" aria-label="Náhodný výber aktivity">
      <div className="special-heading">
        <div className="wheel-title">
          <span className="wheel-icon" aria-hidden="true">
            <span />
          </span>
          <div>
            <span className="label">Activities</span>
            <h2>Koleso čo ísť robiť</h2>
          </div>
        </div>
        <button disabled={activities.length === 0} onClick={onPickRandom} type="button">
          Zatočiť
        </button>
      </div>
      {activities.length > 0 ? (
        <button className="activity-list-toggle" onClick={onToggleActivities} type="button">
          {activitiesOpen ? 'Skryť aktivity' : 'Ukázať aktivity'}
        </button>
      ) : null}
      {activitiesOpen ? (
        <div className="activity-options">
          {activities.map((activity) => (
            <span key={activity.id}>{activity.title}</span>
          ))}
        </div>
      ) : null}
      {selectedActivity ? (
        <div className="activity-result">
          <span>Vybrané</span>
          <strong>{selectedActivity.title}</strong>
          <p>{selectedActivity.description}</p>
        </div>
      ) : (
        <p>
          Pridaj položky v kategórii Activities a tu sa z nich bude dať náhodne vybrať, čo ísť robiť.
        </p>
      )}
    </section>
  );
}

function RecurringCalendarPanel({
  goals,
  onChangeRecurrence,
  onCompleteToday,
}: {
  goals: Goal[];
  onChangeRecurrence: (goalId: string, recurrenceDays: number) => void;
  onCompleteToday: (goalId: string) => void;
}) {
  const weekDays = getWeekDays();

  return (
    <section className="special-panel recurring-calendar" aria-label="Kalendár chores a habits">
      <div className="special-heading">
        <div>
          <span className="label">Chores calendar</span>
          <h2>Čo je kedy na rade</h2>
        </div>
      </div>
      {goals.length > 0 ? (
        <ol className="recurring-list">
          {goals.map((goal) => {
            const dueDate = getNextDueDate(goal);
            const dueLabel = dueDate ? formatDueLabel(dueDate) : 'bez termínu';
            const doneThisWeek = isCompletedThisWeek(goal, weekDays);
            const category = goalCategories.find(
              (category) => category.id === normalizeGoalCategory(goal.category),
            );

            return (
              <li key={goal.id}>
                <div className="recurring-copy">
                  <strong>{goal.title}</strong>
                  <span>
                    {category?.label ?? 'Opakované'} · každých {normalizeRecurrenceDays(goal.recurrenceDays)} dní
                  </span>
                </div>
                <div className="week-graph" aria-label={`Týždenný stav pre ${goal.title}`}>
                  {weekDays.map((day) => {
                    const isDueDay = dueDate ? isSameDay(day, dueDate) : false;
                    const isDoneDay = goal.lastCompletedAt
                      ? isSameDay(day, new Date(goal.lastCompletedAt))
                      : false;

                    return (
                      <span
                        className={[
                          isDueDay ? 'due' : '',
                          isDoneDay ? 'done' : '',
                          isSameDay(day, new Date()) ? 'today' : '',
                        ].filter(Boolean).join(' ')}
                        key={day.toISOString()}
                        title={day.toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', weekday: 'short' })}
                      >
                        {day.toLocaleDateString('sk-SK', { weekday: 'short' }).slice(0, 2)}
                      </span>
                    );
                  })}
                </div>
                <label className="mini-recurrence">
                  každých
                  <input
                    min={1}
                    onChange={(event) => onChangeRecurrence(goal.id, Number(event.target.value))}
                    type="number"
                    value={normalizeRecurrenceDays(goal.recurrenceDays)}
                  />
                  dní
                </label>
                <time className={doneThisWeek ? 'done' : ''}>
                  {doneThisWeek ? 'hotové tento týždeň' : dueLabel}
                </time>
                <button onClick={() => onCompleteToday(goal.id)} type="button">
                  Dnes hotovo
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p>Chores alebo habits dostanú opakovanie a objavia sa tu ako malý kalendár.</p>
      )}
    </section>
  );
}

function PriorityPoll({
  activePersonId,
  goals,
  goalRankings,
  onRefreshOrder,
  onMoveGoal,
  people,
  refreshKey,
  rankedGoals,
}: {
  activePersonId: string;
  goals: Goal[];
  goalRankings: Record<string, string[]>;
  onRefreshOrder: () => void;
  onMoveGoal: (goalId: string, direction: -1 | 1) => void;
  people: Person[];
  refreshKey: number;
  rankedGoals: Goal[];
}) {
  const activePerson = people.find((person) => person.id === activePersonId) ?? people[0];
  const activeRanking = normalizePersonRanking(goalRankings[activePersonId], goals);
  const groupedGoals = goalCategories
    .filter((category) => category.id !== 'activity')
    .map((category) => ({
      ...category,
      goals: rankedGoals.filter((goal) => normalizeGoalCategory(goal.category) === category.id),
    }))
    .filter((category) => category.goals.length > 0);

  return (
    <section className="priority-poll" aria-label="Anketa priorít">
      <div className="priority-poll-heading">
        <div>
          <span className="label">Anketa priorít</span>
          <h2>Čo je teraz najdôležitejšie</h2>
        </div>
        <div className="priority-heading-actions">
          <button className="refresh-order-button" onClick={onRefreshOrder} type="button">
            Obnoviť poradie
          </button>
          <button
            aria-label="Ako funguje anketa priorít"
            className="info-button"
            title="Poradie vychádza najprv z priemernej dôležitosti 1-5 od oboch líštičiek. Ak majú veci rovnakú dôležitosť, rozhodne ich poradie v ankete."
            type="button"
          >
            i
          </button>
        </div>
      </div>
      {refreshKey > 0 ? (
        <p className="priority-refresh-note">Poradie je prepočítané podľa aktuálnych hlasov.</p>
      ) : null}
      {groupedGoals.length > 0 ? (
        <div className="priority-groups">
          {groupedGoals.map((category) => (
            <section className="priority-group" key={category.id}>
              <h3>{category.label}</h3>
              <ol className="priority-list">
                {category.goals.map((goal, index) => {
                  const activeIndex = activeRanking.indexOf(goal.id);
                  const averageImportance = getAverageImportance(goal, people);

                  return (
                    <li key={goal.id}>
                      <span className="priority-rank">{index + 1}</span>
                      <div className="priority-copy">
                        <strong>{goal.title}</strong>
                        <span>Priemer dôležitosti {averageImportance.toFixed(1)}/5</span>
                      </div>
                      <div className="priority-votes" aria-label={`Poradie pre ${goal.title}`}>
                        {people.map((person) => (
                          <span
                            key={person.id}
                            style={{ '--person-tone': person.tone } as React.CSSProperties}
                          >
                            <AvatarFox person={person} size="small" />
                            {clampImportance(goal.importanceByPerson?.[person.id]) ?? minImportance}/5
                          </span>
                        ))}
                      </div>
                      <div className="priority-controls" aria-label={`Zmeniť poradie pre ${activePerson?.name}`}>
                        <button
                          aria-label={`Posunúť ${goal.title} vyššie v mojom poradí`}
                          disabled={activeIndex <= 0}
                          onClick={() => onMoveGoal(goal.id, -1)}
                          title="Vyššie v mojom poradí"
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`Posunúť ${goal.title} nižšie v mojom poradí`}
                          disabled={activeIndex < 0 || activeIndex >= activeRanking.length - 1}
                          onClick={() => onMoveGoal(goal.id, 1)}
                          title="Nižšie v mojom poradí"
                          type="button"
                        >
                          ↓
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <p>Keď pribudnú plány, tu si ich každá líštička zoradí podľa dôležitosti.</p>
      )}
    </section>
  );
}

function ProjectProgressStrip({
  goals,
}: {
  goals: Array<{ id: string; title: string; done: number; total: number; percent: number }>;
}) {
  const visibleGoals = goals.slice(0, 4);

  return (
    <div className="project-strip" aria-label="Progres jednotlivých plánov">
      <div className="project-strip-heading">
        <span className="label">Plány na očiach</span>
        <strong>{goals.length}</strong>
      </div>
      {visibleGoals.length > 0 ? (
        <div className="project-bars">
          {visibleGoals.map((goal) => (
            <div className="project-bar" key={goal.id}>
              <div className="project-bar-copy">
                <span>{goal.title}</span>
                <strong>
                  {goal.percent}% · {goal.done}/{goal.total}
                </strong>
              </div>
              <div className="meter mini" aria-hidden="true">
                <span style={{ width: `${goal.percent}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p>Prvý plán si nájde miesto hneď tu.</p>
      )}
    </div>
  );
}

type GoalPanelProps = {
  activePersonId: string;
  goal: Goal;
  onAddSubtask: (parentId: string, title: string) => void;
  onChangeCategory: (goalId: string, category: GoalCategory) => void;
  onChangeRecurrence: (goalId: string, recurrenceDays: number) => void;
  onCompleteRecurring: (goalId: string) => void;
  onDelete: (taskId: string) => void;
  onRateImportance: (goalId: string, personId: string, importance: number) => void;
  onRename: (taskId: string, title: string) => void;
  onRenameDescription: (goalId: string, description: string) => void;
  people: Person[];
  toggleDone: (taskId: string) => void;
  toggleExpanded: (taskId: string) => void;
};

function GoalPanel(props: GoalPanelProps) {
  const progress = calculateProgress(props.goal);
  const importanceByPerson = normalizeGoalImportance(props.goal, props.people);
  const category = normalizeGoalCategory(props.goal.category);
  const isRecurring = recurringCategoryIds.includes(category);

  return (
    <article className="goal-panel">
      <div className="goal-header">
        <button
          aria-label={props.goal.expanded ? 'Zbaliť cieľ' : 'Rozbaliť cieľ'}
          className="icon-button"
          onClick={() => props.toggleExpanded(props.goal.id)}
          type="button"
        >
          {props.goal.expanded ? '−' : '+'}
        </button>
        <div className="goal-title-block">
          <input
            aria-label="Názov cieľa"
            className="title-input"
            defaultValue={props.goal.title}
            onBlur={(event) => props.onRename(props.goal.id, event.target.value)}
            title="Klikni a uprav názov"
          />
          <input
            aria-label="Poznámka k cieľu"
            className="description-input"
            defaultValue={props.goal.description}
            onBlur={(event) => props.onRenameDescription(props.goal.id, event.target.value)}
            placeholder="Poznámka k plánu"
            title="Klikni a uprav poznámku"
          />
        </div>
        <div className="progress-badge">
          <strong>{progress.percent}%</strong>
          <span>
            {progress.done}/{progress.total}
          </span>
        </div>
        <button
          aria-label="Presunúť plán do koša"
          className="icon-button danger"
          onClick={() => props.onDelete(props.goal.id)}
          type="button"
        >
          ×
        </button>
      </div>

      <div className="goal-meta">
        <label className="check-row">
          <input
            checked={props.goal.done}
            onChange={() => props.toggleDone(props.goal.id)}
            type="checkbox"
          />
          Plán označený ako hotový
        </label>
        <ItemMeta
          createdById={props.goal.ownerId}
          people={props.people}
          updatedById={props.goal.updatedById}
        />
        <label className="category-select">
          Kategória
          <select
            onChange={(event) => props.onChangeCategory(props.goal.id, event.target.value as GoalCategory)}
            value={props.goal.category ?? 'plan'}
          >
            {goalCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        {isRecurring ? (
          <label className="category-select recurrence-select">
            Opakovať
            <input
              min={1}
              onChange={(event) => props.onChangeRecurrence(props.goal.id, Number(event.target.value))}
              type="number"
              value={normalizeRecurrenceDays(props.goal.recurrenceDays)}
            />
            dní
          </label>
        ) : null}
      </div>

      {isRecurring ? (
        <div className="recurrence-summary">
          <span>
            Nabudúce: {getNextDueDate(props.goal) ? formatDueLabel(getNextDueDate(props.goal) as Date) : 'bez termínu'}
          </span>
          <button onClick={() => props.onCompleteRecurring(props.goal.id)} type="button">
            Dnes hotovo
          </button>
        </div>
      ) : null}

      <div className="meter slim" aria-hidden="true">
        <span style={{ width: `${progress.percent}%` }} />
      </div>

      <ImportancePanel
        activePersonId={props.activePersonId}
        goalId={props.goal.id}
        importanceByPerson={importanceByPerson}
        onRateImportance={props.onRateImportance}
        people={props.people}
      />

      {props.goal.expanded ? (
        <div className="children-list">
          {props.goal.children.map((child) => (
            <TaskRow
              {...props}
              key={child.id}
              task={child}
              depth={1}
            />
          ))}
          <AddTaskForm
            label="Pridať podúlohu k cieľu"
            onSubmit={(title) => props.onAddSubtask(props.goal.id, title)}
          />
        </div>
      ) : null}
    </article>
  );
}

function ImportancePanel({
  activePersonId,
  goalId,
  importanceByPerson,
  onRateImportance,
  people,
}: {
  activePersonId: string;
  goalId: string;
  importanceByPerson: Record<string, number>;
  onRateImportance: (goalId: string, personId: string, importance: number) => void;
  people: Person[];
}) {
  const sortedPeople = [...people].sort(
    (first, second) =>
      (importanceByPerson[second.id] ?? minImportance) -
      (importanceByPerson[first.id] ?? minImportance),
  );
  const highestImportance = sortedPeople[0]
    ? importanceByPerson[sortedPeople[0].id] ?? minImportance
    : minImportance;
  const leadPeople = sortedPeople.filter(
    (person) => (importanceByPerson[person.id] ?? minImportance) === highestImportance,
  );
  const leadNames = leadPeople.map((person) => person.name).join(' + ');
  const summary =
    leadPeople.length === people.length
      ? 'Je rovnako dôležité pre oboch'
      : `Je dôležitejšie pre: ${leadNames}`;

  return (
    <section
      className="importance-panel"
      aria-label="Dôležitosť plánu pre jednotlivé líštičky"
    >
      <div className="importance-heading">
        <span>{summary}</span>
        <button
          aria-label="Ako čítať dôležitosť"
          className="info-button"
          title="1 znamená skôr vedľajšia vec, 5 znamená veľmi dôležitá vec. Ak je plán pre niekoho väčšou prioritou, mal(a) by okolo neho viac iniciovať, pripomínať ho a plánovať ďalšie kroky."
          type="button"
        >
          i
        </button>
      </div>
      <div className="importance-rows">
        {people.map((person) => {
          const importance = importanceByPerson[person.id] ?? minImportance;
          const canEdit = person.id === activePersonId;

          return (
            <div
              className="importance-row"
              key={person.id}
              style={{ '--person-tone': person.tone } as React.CSSProperties}
            >
              <span className="importance-person">
                <AvatarFox person={person} size="small" />
                {person.name}
              </span>
              <div
                className="importance-meter"
                aria-label={`${person.name}: dôležitosť ${importance} z 5`}
              >
                {Array.from({ length: maxImportance }, (_, index) => {
                  const value = index + 1;

                  return (
                    <button
                      aria-label={
                        canEdit
                          ? `${person.name}: nastaviť dôležitosť ${value} z 5`
                          : `${person.name}: dôležitosť ${value} z 5`
                      }
                      className={value <= importance ? 'active' : ''}
                      disabled={!canEdit}
                      key={value}
                      onClick={() => onRateImportance(goalId, person.id, value)}
                      title={
                        canEdit
                          ? `${person.name}: nastaviť ${value}/5`
                          : `${person.name}: toto hodnotenie si mení iba ${person.name}`
                      }
                      type="button"
                    />
                  );
                })}
              </div>
              <strong>{importance}/5</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AvatarFox({ person, size = 'small' }: { person: Person; size?: 'small' | 'medium' }) {
  const avatar =
    avatarOptions.find((option) => option.id === person.avatarId) ?? avatarOptions[0];

  return (
    <img
      alt=""
      className={`avatar-fox ${size}`}
      src={avatar.src}
    />
  );
}

type TaskRowProps = GoalPanelProps & {
  depth: number;
  task: Task;
};

function TaskRow(props: TaskRowProps) {
  const [adding, setAdding] = useState(false);
  const progress = calculateProgress(props.task);
  const hasChildren = props.task.children.length > 0;

  return (
    <div className="task-branch" style={{ '--depth': props.depth } as React.CSSProperties}>
      <div className={props.task.done ? 'task-row done' : 'task-row'}>
        <button
          aria-label={props.task.expanded ? 'Zbaliť podúlohu' : 'Rozbaliť podúlohu'}
          className="icon-button compact"
          disabled={!hasChildren}
          onClick={() => props.toggleExpanded(props.task.id)}
          type="button"
        >
          {hasChildren ? (props.task.expanded ? '−' : '+') : '•'}
        </button>
        <label className="checkbox-only" aria-label="Označiť ako hotové">
          <input
            checked={props.task.done}
            onChange={() => props.toggleDone(props.task.id)}
            type="checkbox"
          />
        </label>
        <input
          aria-label="Názov podúlohy"
          className="task-title"
          defaultValue={props.task.title}
          onBlur={(event) => props.onRename(props.task.id, event.target.value)}
          title="Klikni a uprav podúlohu"
        />
        <ItemMeta
          createdById={props.task.ownerId}
          people={props.people}
          updatedById={props.task.updatedById}
        />
        <span className="mini-progress">
          {progress.percent}% · {progress.done}/{progress.total}
        </span>
        <button className="text-button" onClick={() => setAdding(!adding)} type="button">
          + podúloha
        </button>
        <button
          aria-label="Vymazať podúlohu"
          className="icon-button compact danger"
          onClick={() => props.onDelete(props.task.id)}
          type="button"
        >
          ×
        </button>
      </div>

      {adding ? (
        <AddTaskForm
          label="Názov ďalšej podúlohy"
          onSubmit={(title) => {
            props.onAddSubtask(props.task.id, title);
            setAdding(false);
          }}
        />
      ) : null}

      {props.task.expanded && hasChildren ? (
        <div className="nested">
          {props.task.children.map((child) => (
            <TaskRow
              {...props}
              depth={props.depth + 1}
              key={child.id}
              task={child}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ItemMeta({
  createdById,
  people,
  updatedById,
}: {
  createdById: string;
  people: Person[];
  updatedById?: string;
}) {
  const creator = people.find((person) => person.id === createdById)?.name ?? 'Foxie';
  const editor = updatedById
    ? people.find((person) => person.id === updatedById)?.name ?? 'Foxie'
    : null;

  return (
    <span className="item-meta">
      pridal(a) <strong>{creator}</strong>
      {editor && editor !== creator ? (
        <>
          {' '}
          · menil(a) <strong>{editor}</strong>
        </>
      ) : null}
    </span>
  );
}

function AddTaskForm({
  label,
  onSubmit,
}: {
  label: string;
  onSubmit: (title: string) => void;
}) {
  const [title, setTitle] = useState('');

  return (
    <form
      className="add-task"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(title);
        setTitle('');
      }}
    >
      <label>
        {label}
        <input
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Napíšte názov"
          value={title}
        />
      </label>
      <button type="submit">Pridať</button>
    </form>
  );
}
