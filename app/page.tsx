'use client';

import { GratitudePanel } from './gratitude-panel';
import { gratitudeDay } from './gratitude';

import Image from 'next/image';
import { useBoardSync } from './use-board-sync';
import { useReminders } from './use-reminders';
import { allTasks, liveGoal, isValidState, visibleState } from './state-sync';
import { ThemePicker } from './theme-picker';
import { EditableInput } from './editable-input';
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  avatarOptions,
  calculateProgress,
  calculateChoreProgress,
  choreView,
  clampImportance,
  collectCompletedItems,
  createId,
  createRandomIndex,
  defaultPeople,
  findTaskById,
  flattenChildren,
  getAverageFeasibility,
  formatDueLabel,
  getAverageImportance,
  getPriorityScore,
  getAvatarOptionsForPerson,
  getNextDueDate,
  goalCategories,
  isCompletableTask,
  maxImportance,
  minImportance,
  normalizeDateTimeInput,
  normalizeGoalCategory,
  normalizeGoalFeasibility,
  normalizeGoalImportance,
  normalizeGoalRankings,
  normalizeGoals,
  normalizePeople,
  normalizePersonRanking,
  normalizeRecurrenceDays,
  normalizeRecurrenceToleranceDays,
  readTransferData,
  recurringCategoryIds,
  removeTask,
  sharedSpaceId,
  sortGoalsByAverageRanking,
  starterGoals,
  taskKinds,
  updateTaskTree,
  type ActivityItem,
  type AppStateData,
  type GratitudeEntry,
  type BoardSpaceId,
  type CompletedItem,
  type Goal,
  type GoalCategory,
  type Person,
  type Task,
  type TaskKind,
  type ChoreCadence,
  type ChoreWeight,
  type TransferPayload,
} from './page-model';

const enabledGoalCategories = goalCategories.filter((category) => category.id !== 'errand' && category.id !== 'habit');

function saveInputOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
    return;
  }

  event.preventDefault();
  event.currentTarget.blur();
}

function getGoalSpaceId(goal: Goal) {
  return goal.spaceId ?? sharedSpaceId;
}

function getCategoryLabel(category: GoalCategory, boardSpaceId: BoardSpaceId) {
  if (category === 'plan' && boardSpaceId !== sharedSpaceId) {
    return 'Projekty';
  }

  return goalCategories.find((option) => option.id === category)?.label ?? 'Projekty';
}

function getBoardSpaces(people: Person[]) {
  return [
    { id: sharedSpaceId, label: 'Spoločné' },
    ...people.map((person) => ({
      id: person.id,
      label: `${person.name} osobné`,
    })),
  ];
}

function toDateInputValue(value: string | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function shiftDateByDays(date: Date, days: number) {
  const shiftedDate = new Date(date);

  shiftedDate.setDate(shiftedDate.getDate() + days);
  shiftedDate.setHours(0, 0, 0, 0);

  return shiftedDate;
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit' });
}

function formatRecurrenceWindow(dueDate: Date | null, toleranceDays: number) {
  if (!dueDate) {
    return 'bez termínu';
  }

  if (toleranceDays <= 0) {
    return `termín ${formatShortDate(dueDate)}`;
  }

  const windowStart = shiftDateByDays(dueDate, -toleranceDays);
  const windowEnd = shiftDateByDays(dueDate, toleranceDays);

  return `${formatShortDate(windowStart)} - ${formatShortDate(windowEnd)}`;
}

function isDateInRecurrenceWindow(date: Date, dueDate: Date, toleranceDays: number) {
  const checkedDate = shiftDateByDays(date, 0);
  const windowStart = shiftDateByDays(dueDate, -toleranceDays);
  const windowEnd = shiftDateByDays(dueDate, toleranceDays);

  return checkedDate >= windowStart && checkedDate <= windowEnd;
}

function getCurrentRecurrenceStatus(dueDate: Date | null, toleranceDays: number) {
  if (!dueDate) {
    return { className: 'neutral', label: 'bez termínu' };
  }

  return isDateInRecurrenceWindow(new Date(), dueDate, toleranceDays)
    ? { className: 'ok', label: 'v okne' }
    : { className: 'muted', label: 'mimo okna' };
}

function getRecurringHistoryStatus(
  completedAt: string,
  previousAnchor: string | undefined,
  recurrenceDays: number,
  toleranceDays: number,
) {
  if (!previousAnchor) {
    return { className: 'muted', label: 'bez štartu' };
  }

  const completedDate = new Date(completedAt);
  const dueDate = shiftDateByDays(new Date(previousAnchor), recurrenceDays);

  if (Number.isNaN(completedDate.getTime()) || Number.isNaN(dueDate.getTime())) {
    return { className: 'muted', label: 'nejasné' };
  }

  return isDateInRecurrenceWindow(completedDate, dueDate, toleranceDays)
    ? { className: 'ok', label: 'v okne' }
    : { className: 'muted', label: 'mimo okna' };
}

function saveStateBackup(label: string, state: AppStateData) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const backupKey = `ciele-state-backups-${state.activePersonId}`;
    const rawBackups = window.localStorage.getItem(backupKey);
    const backups = rawBackups ? JSON.parse(rawBackups) as unknown[] : [];
    const nextBackups = [
      {
        createdAt: new Date().toISOString(),
        data: state,
        label,
      },
      ...backups,
    ].slice(0, 10);

    window.localStorage.setItem(backupKey, JSON.stringify(nextBackups));
  } catch {
    // Backups are a best-effort safety net; normal sync should not depend on them.
  }
}

function splitTextByLength(text: string, targetParts: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const totalLength = words.reduce((total, word) => total + word.length + 1, 0);
  const targetLength = Math.ceil(totalLength / targetParts);
  const chunks: string[] = [];
  let current = '';

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;

    if (current && next.length > targetLength && chunks.length < targetParts - 1) {
      chunks.push(current);
      current = word;
      return;
    }

    current = next;
  });

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function balanceTextPieces(pieces: string[], targetParts: number) {
  const chunkCount = Math.min(Math.max(targetParts, 2), 3, pieces.length);
  const chunks: string[] = [];
  let index = 0;

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const remainingPieces = pieces.length - index;
    const remainingChunks = chunkCount - chunkIndex;
    const take = Math.ceil(remainingPieces / remainingChunks);
    const chunk = pieces.slice(index, index + take).join(' ').trim();

    if (chunk) {
      chunks.push(chunk);
    }

    index += take;
  }

  return chunks;
}

function splitLongDescription(description: string) {
  const cleaned = description.replace(/\s+/g, ' ').trim();

  if (cleaned.length < 110) {
    return [];
  }

  const sentences = cleaned
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((piece) => piece.trim())
    .filter((piece) => piece.length > 0) ?? [];
  const punctuationPieces = cleaned
    .split(/\s*(?:;|,|→|->|\s+-\s+)\s*/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
  const connectorPieces = cleaned
    .split(/\s+(?:a zároveň|zároveň|prípadne|poprípade|potom|následne|ale|aby|keď|kedy|kde|lebo|pretože|plus|alebo|a)\s+/iu)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
  const pieces =
    sentences.length > 1
      ? sentences
      : punctuationPieces.length > 1
        ? punctuationPieces
        : connectorPieces.length > 1
          ? connectorPieces
          : splitTextByLength(cleaned, cleaned.length > 230 ? 3 : 2);
  const targetParts = cleaned.length > 230 || pieces.length > 4 ? 3 : 2;
  const chunks = balanceTextPieces(pieces, targetParts).filter((chunk) => chunk.length >= 12);

  return chunks.length > 1 ? chunks : [];
}

export default function Home() {
  const [choreDay, setChoreDay] = useState(() => gratitudeDay());
  useEffect(() => {
    const refresh = () => setChoreDay(gratitudeDay());
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const [goals, setGoals] = useState<Goal[]>(starterGoals);
  const [people, setPeople] = useState<Person[]>(defaultPeople);
  const [activePersonId, setActivePersonId] = useState(defaultPeople[0].id);
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [gratitudeEntries, setGratitudeEntries] = useState<GratitudeEntry[]>([]);
  const [goalRankings, setGoalRankings] = useState<Record<string, string[]>>({});
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDescription, setNewGoalDescription] = useState('');
  const [newGoalCategory, setNewGoalCategory] = useState<GoalCategory>('plan');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [boardSpaceId, setBoardSpaceId] = useState<BoardSpaceId>(sharedSpaceId);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [transferMessage, setTransferMessage] = useState('');
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [randomActivityId, setRandomActivityId] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [priorityRefreshKey, setPriorityRefreshKey] = useState(0);
  const state = useMemo(() => ({ goals, people, activePersonId, activityLog, goalRankings, gratitudeEntries }), [goals, people, activePersonId, activityLog, goalRankings, gratitudeEntries]);
  const applyState = useCallback((data: AppStateData) => {
    setGoals(data.goals); setPeople(data.people); setActivePersonId(data.activePersonId);
    setActivityLog(data.activityLog); setGoalRankings(data.goalRankings); setGratitudeEntries(data.gratitudeEntries ?? []);
    setBoardSpaceId((current) => current === sharedSpaceId || data.people.some((person) => person.id === current) ? current : sharedSpaceId);
  }, []);
  const sync = useBoardSync(state, applyState);
  const { loaded, authenticated } = sync;
  const reminders = useReminders(goals, activePersonId, authenticated);

  const boardSpaces = useMemo(() => getBoardSpaces(people), [people]);
  const canEditBoard = boardSpaceId === sharedSpaceId || boardSpaceId === activePersonId;
  const boardSpaceLabel =
    boardSpaces.find((space) => space.id === boardSpaceId)?.label ?? 'Spoločné';
  const activeGoals = useMemo(
    () => goals.filter((goal) => !goal.deletedAt).map(liveGoal).map((goal) => normalizeGoalCategory(goal.category) === 'chore' ? choreView(goal, choreDay) : goal),
    [goals, choreDay],
  );
  const visibleGoals = useMemo(
    () => activeGoals.filter((goal) => getGoalSpaceId(goal) === boardSpaceId && enabledGoalCategories.some((category) => category.id === normalizeGoalCategory(goal.category))),
    [activeGoals, boardSpaceId],
  );
  const activityGoals = useMemo(
    () => visibleGoals.filter((goal) => normalizeGoalCategory(goal.category) === 'activity'),
    [visibleGoals],
  );
  const boardGoals = useMemo(
    () => visibleGoals.filter((goal) => normalizeGoalCategory(goal.category) !== 'activity'),
    [visibleGoals],
  );
  const boardGoalGroups = useMemo(
    () =>
      enabledGoalCategories
        .filter((category) => category.id !== 'activity')
        .map((category) => ({
          ...category,
          goals: sortGoalsByAverageRanking(boardGoals.filter((goal) => normalizeGoalCategory(goal.category) === category.id), people, goalRankings),
        }))
        .filter((category) => category.goals.length > 0),
    [boardGoals, people, goalRankings],
  );
  const rankedActiveGoals = useMemo(
    () => sortGoalsByAverageRanking(boardGoals, people, goalRankings),
    [boardGoals, goalRankings, people],
  );
  const trashedGoals = useMemo(() => goals
    .filter((goal) => canEditBoard && getGoalSpaceId(goal) === boardSpaceId)
    .flatMap((goal) => goal.deletedAt ? [goal] : allTasks(goal).filter((task) => task.deletedAt)), [boardSpaceId, goals, canEditBoard]);

  const totals = useMemo(() => {
    const trackedTasks = boardGoals.flatMap((goal) => {
      const chore = normalizeGoalCategory(goal.category) === 'chore';
      const tasks = chore && goal.children.length ? flattenChildren(goal) : [goal, ...flattenChildren(goal)];
      return tasks.filter((task) => isCompletableTask(task) && (!chore || (task.choreCadence ?? 'routine') === 'routine')).map((task) => ({ task, weight: chore ? task.choreWeight ?? 1 : 1 }));
    });
    const done = trackedTasks.filter(({ task }) => task.done).length;
    const total = trackedTasks.length;
    const weight = trackedTasks.reduce((sum, item) => sum + item.weight, 0);
    const doneWeight = trackedTasks.reduce((sum, item) => sum + (item.task.done ? item.weight : 0), 0);
    return { done, total, percent: weight ? Math.round(doneWeight / weight * 100) : 0 };
  }, [boardGoals]);
  const completedItems = useMemo(
    () => collectCompletedItems(boardGoals).slice(0, 10),
    [boardGoals],
  );
  const recurringGoals = useMemo(
    () =>
      visibleGoals
        .filter((goal) => recurringCategoryIds.includes(normalizeGoalCategory(goal.category)))
        .sort((first, second) => {
          const firstDue = getNextDueDate(first)?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const secondDue = getNextDueDate(second)?.getTime() ?? Number.MAX_SAFE_INTEGER;

          return firstDue - secondDue;
        }),
    [visibleGoals],
  );
  const randomActivity = useMemo(
    () => activityGoals.find((goal) => goal.id === randomActivityId) ?? null,
    [activityGoals, randomActivityId],
  );

  const goalSnapshots = useMemo(
    () =>
      rankedActiveGoals.map((goal) => ({
        id: goal.id,
        categoryLabel: getCategoryLabel(normalizeGoalCategory(goal.category), boardSpaceId),
        isChore: normalizeGoalCategory(goal.category) === 'chore',
        title: normalizeGoalCategory(goal.category) === 'chore' ? `${goal.title} · bežné chores` : goal.title,
        ...calculateProgress(goal),
      })),
    [rankedActiveGoals, boardSpaceId],
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
        feasibilityByPerson: people.reduce<Record<string, number>>((ratings, person) => {
          ratings[person.id] = 3;

          return ratings;
        }, {}),
        ownerId: activePersonId,
        updatedById: activePersonId,
        importanceByPerson: people.reduce<Record<string, number>>((ratings, person) => {
          ratings[person.id] = person.id === activePersonId ? 4 : 2;

          return ratings;
        }, {}),
        done: false,
        expanded: true,
        kind: recurringCategoryIds.includes(newGoalCategory) ? 'rule' : 'topic',
        spaceId: boardSpaceId,
        children: [],
      },
      ...current,
    ]);
    if (newGoalCategory !== 'activity') {
      setGoalRankings((current) =>
        people.reduce<Record<string, string[]>>((rankings, person) => {
          const currentRanking = normalizePersonRanking(current[person.id], activeGoals.filter((goal) => normalizeGoalCategory(goal.category) !== 'activity'));

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

  function addSubtask(parentId: string, title: string, dueAt?: string, kind: TaskKind = 'todo', choreCadence?: ChoreCadence, choreWeight?: ChoreWeight) {
    const trimmed = title.trim();
    const normalizedDueAt = normalizeDateTimeInput(dueAt);

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
            dueAt: normalizedDueAt,
            ownerId: activePersonId,
            updatedById: activePersonId,
            done: false,
            expanded: true,
            kind,
            choreCadence: choreCadence ?? task.choreCadence,
            choreWeight,
            children: [],
          },
        ],
      })),
    );
    addActivity('pridal(a) podúlohu', trimmed);
  }

  function toggleDone(taskId: string) {
    const task = findTaskById(goals, taskId);

    if (task && !isCompletableTask(task)) {
      return;
    }

    const chore = goals.find((goal) => normalizeGoalCategory(goal.category) === 'chore' && allTasks(goal).some((item) => item.id === taskId));
    if (task && chore) {
      const completion = { id: createId(), personId: activePersonId, completedAt: new Date().toISOString() };
      setGoals((current) => updateTaskTree(current, taskId, (item) => ({ ...item, done: false, updatedById: activePersonId,
        choreCompletions: [completion, ...(item.choreCompletions ?? [])].slice(0, 200) })));
      addActivity('vykonal(a) chore', task.title);
      return;
    }
    setGoals((current) =>
      updateTaskTree(current, taskId, (task) => ({
        ...task,
        done: isCompletableTask(task) ? !task.done : false,
        updatedById: activePersonId,
      })),
    );

    if (task) {
      addActivity(task.done ? 'vrátil(a) späť' : 'označil(a) ako hotové', task.title);
    }
  }

  function undoChoreCompletion(taskId: string, completionId: string) {
    const task = findTaskById(goals, taskId);
    const entry = task?.choreCompletions?.find((item) => item.id === completionId);
    if (!task || !entry || entry.personId !== activePersonId || entry.undoneAt) return;
    const undoneAt = new Date().toISOString();
    setGoals((current) => updateTaskTree(current, taskId, (item) => ({ ...item, updatedById: activePersonId,
      choreCompletions: item.choreCompletions?.map((entry) => entry.id === completionId ? { ...entry, undoneAt } : entry) })));
    addActivity('zrušil(a) vykonanie chore', task.title);
  }

  function changeTaskKind(taskId: string, kind: TaskKind) {
    const task = findTaskById(goals, taskId);

    setGoals((current) =>
      updateTaskTree(current, taskId, (task) => ({
        ...task,
        done: kind === 'todo' ? task.done : false,
        kind,
        updatedById: activePersonId,
      })),
    );

    if (task) {
      addActivity('zmenil(a) typ položky', task.title);
    }
  }

  function changeChoreWeight(taskId: string, choreWeight: ChoreWeight) {
    const task = findTaskById(goals, taskId);
    if (!task || (task.choreWeight ?? 1) === choreWeight) return;
    setGoals((current) => updateTaskTree(current, taskId, (item) => ({ ...item, choreWeight, updatedById: activePersonId })));
    addActivity('zmenil(a) náročnosť chores', task.title);
  }

  function changeChoreCadence(taskId: string, choreCadence: ChoreCadence) {
    const task = findTaskById(goals, taskId);
    if (!task || (task.choreCadence ?? 'routine') === choreCadence) return;
    setGoals((current) => updateTaskTree(current, taskId, (item) => ({ ...item, choreCadence, updatedById: activePersonId })));
    addActivity('zmenil(a) skupinu chores', task.title);
  }

  function toggleExpanded(taskId: string) {
    setGoals((current) =>
      updateTaskTree(current, taskId, (task) => ({
        ...task,
        expanded: !task.expanded,
      })),
    );
  }

  function changeDeadline(taskId: string, value: string) {
    const task = findTaskById(goals, taskId);
    const dueAt = normalizeDateTimeInput(value);
    if (!task || task.dueAt === dueAt) return;
    setGoals((current) => updateTaskTree(current, taskId, (item) => ({ ...item, dueAt, updatedById: activePersonId })));
    addActivity(dueAt ? 'nastavil(a) termín' : 'zrušil(a) termín', task.title);
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
              recurrenceHistory: recurringCategoryIds.includes(category)
                ? (goal.recurrenceHistory ?? [])
                : undefined,
              recurrenceStartAt: recurringCategoryIds.includes(category)
                ? goal.recurrenceStartAt
                : undefined,
              recurrenceToleranceDays: recurringCategoryIds.includes(category)
                ? normalizeRecurrenceToleranceDays(goal.recurrenceToleranceDays)
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

  function changeGoalRecurrenceStart(goalId: string, recurrenceStartAt: string) {
    const goal = goals.find((goal) => goal.id === goalId);
    const normalizedStart = normalizeDateTimeInput(recurrenceStartAt);

    if (!goal || goal.recurrenceStartAt === normalizedStart) {
      return;
    }

    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              recurrenceStartAt: normalizedStart,
              updatedById: activePersonId,
            }
          : goal,
      ),
    );
    addActivity(
      normalizedStart ? 'nastavil(a) začiatok opakovania' : 'zrušil(a) začiatok opakovania',
      goal.title,
    );
  }

  function changeGoalRecurrenceTolerance(goalId: string, toleranceDays: number) {
    const goal = goals.find((goal) => goal.id === goalId);
    const normalizedTolerance = normalizeRecurrenceToleranceDays(toleranceDays);

    if (!goal || goal.recurrenceToleranceDays === normalizedTolerance) {
      return;
    }

    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              recurrenceToleranceDays: normalizedTolerance,
              updatedById: activePersonId,
            }
          : goal,
      ),
    );
    addActivity('upravil(a) toleranciu opakovania', `${goal.title} · ±${normalizedTolerance} dní`);
  }

  function completeRecurringGoalToday(goalId: string) {
    const goal = goals.find((goal) => goal.id === goalId);
    const completedAt = new Date().toISOString();

    if (!goal) {
      return;
    }

    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              lastCompletedAt: completedAt,
              recurrenceHistory: [completedAt, ...(goal.recurrenceHistory ?? [])].slice(0, 20),
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
    if (canEditBoard) addActivity('vyžreboval(a) aktivitu', nextActivity.title);
  }

  function deleteTask(taskId: string) {
    const task = findTaskById(goals, taskId);

    setGoals((current) => updateTaskTree(removeTask(current, taskId), taskId, (task) => ({ ...task, updatedById: activePersonId })));

    if (task) {
      addActivity(
        goals.some((goal) => goal.id === taskId) ? 'presunul(a) plán do koša' : 'presunul(a) podúlohu do koša',
        task.title,
      );
    }
  }

  function restoreGoal(goalId: string) {
    const task = findTaskById(goals, goalId);
    setGoals((current) => updateTaskTree(current, goalId, (item) => ({ ...item, deletedAt: undefined, updatedById: activePersonId })));
    if (task) addActivity('obnovil(a) položku z koša', task.title);
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

  function rateGoalFeasibility(goalId: string, personId: string, feasibility: number) {
    const normalizedFeasibility = clampImportance(feasibility);
    const goal = goals.find((goal) => goal.id === goalId);
    const personName = people.find((person) => person.id === personId)?.name ?? 'Foxie';

    if (!goal || !normalizedFeasibility) {
      return;
    }

    setGoals((current) =>
      current.map((goal) =>
        goal.id === goalId
          ? {
              ...goal,
              feasibilityByPerson: {
                ...normalizeGoalFeasibility(goal, people),
                [personId]: normalizedFeasibility,
              },
              updatedById: activePersonId,
            }
          : goal,
      ),
    );
    addActivity('ohodnotil(a) reálnosť riešenia', `${goal.title} · ${personName}: ${normalizedFeasibility}/5`);
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
        spaceId: boardSpaceId,
      },
      ...current,
    ].slice(0, 80));
  }

  function createTransferPayload(): TransferPayload {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        activePersonId,
        activityLog,
        gratitudeEntries,
        goalRankings,
        goals,
        people,
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

      if (!isValidState(data)) { setTransferMessage('Záloha obsahuje neplatné položky. Existujúce dáta zostali zachované.'); return; }
      saveStateBackup('Pred importom', state);
      const scoped = visibleState(data, activePersonId);
      const importedPeople = normalizePeople(scoped.people).map((person) => person.id === activePersonId ? person : people.find((item) => item.id === person.id)!);
      const importedActivePersonId = activePersonId;
      const importedGoals = normalizeGoals(scoped.goals, importedPeople);
      const importedGoalRankings = normalizeGoalRankings(
        data.goalRankings,
        importedGoals,
        importedPeople,
      );

      setGoals(importedGoals);
      setPeople(importedPeople);
      setActivityLog(scoped.activityLog.filter((item) => item.actorId === activePersonId));
      setGoalRankings(importedGoalRankings);
      setActivePersonId(importedActivePersonId);

      setImportText('');
      setTransferMessage('Dáta sú importované. Táto verzia appky ich už vidí.');
    } catch {
      setTransferMessage('JSON sa nepodarilo prečítať. Skontroluj, či je celý skopírovaný.');
    }
  }

  const recentActivity = activityLog
    .filter((item) => (item.spaceId ?? sharedSpaceId) === boardSpaceId)
    .slice(0, 12);

  if (!loaded) {
    return null;
  }

  if (!authenticated) {
    return (
      <AuthGate
        onAuthenticate={sync.login}
        onChooseProfile={sync.chooseProfile}
        mode={sync.mode}
        status={sync.status}
        people={people}
      />
    );
  }

  return (
    <main className="app-shell">
      <section className="sync-status" role="status" aria-live="polite">
        <span>{sync.status}</span>
        <button type="button" onClick={() => void sync.retry()}>Skúsiť synchronizáciu</button>
        <button type="button" onClick={() => void reminders.toggle()}>{reminders.enabled ? 'Vypnúť pripomienky' : 'Zapnúť pripomienky'}</button>
        <button type="button" onClick={() => void sync.logout().catch(() => setTransferMessage('Odhlásenie zlyhalo. Skúste znova.'))}>{sync.mode === 'profiles' ? 'Zmeniť líštičku' : 'Odhlásiť sa'}</button>
        {sync.recovery ? <button type="button" onClick={() => downloadJson(sync.recovery!, 'foxies-povodna-zaloha.json')}>Stiahnuť poškodenú zálohu</button> : null}
        {reminders.message ? <span>{reminders.message}</span> : null}
      </section>
      {sync.conflicts.length > 0 ? <section className="sync-conflicts" role="alert">
        <h2>Rozdielne úpravy tej istej položky</h2>
        <p>Nezávislé zmeny sa zlúčia. Pri poliach nižšie vyberte, ktorú verziu zachovať. Pred výberom si môžete stiahnuť obe verzie.</p>
        <ul>{sync.conflicts.map((conflict) => <li key={conflict.path}><strong>{conflictLabel(conflict.path, state)}</strong><br />Toto zariadenie: {conflictValue(conflict.local)}<br />Server: {conflictValue(conflict.remote)}</li>)}</ul>
        <button type="button" onClick={() => downloadJson(JSON.stringify({ local: state, conflicts: sync.conflicts }, null, 2), 'foxies-rozdielne-upravy.json')}>Stiahnuť verzie</button>
        <button type="button" onClick={() => sync.resolve('local')}>Zachovať moje sporné polia</button>
        <button type="button" onClick={() => sync.resolve('remote')}>Zachovať serverové sporné polia</button>
      </section> : null}
      <section className="topbar" aria-label="Prehľad tímu">
        <div className="brand-lockup">
          <div className="fox-pair" aria-hidden="true">
            <Image
              alt=""
              className="foxies-logo"
              height={74}
              priority
              src="/foxies-logo.png"
              width={98}
            />
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
                disabled={person.id !== activePersonId}
                title={person.id === activePersonId ? 'Toto je prihlásená líštička' : 'Ikonka druhej líštičky'}
                type="button"
              >
                <AvatarFox person={person} size="medium" />
              </button>
              <div className="person-details">
                <div className="person-name-row">
                  {person.id === activePersonId ? (
                    <input
                      aria-label={`Meno osoby ${person.name}`}
                      className="person-name"
                      onChange={(event) => changePersonName(person.id, event.target.value)}
                      onBlur={(event) => renamePerson(person.id, event.target.value)}
                      onKeyDown={saveInputOnEnter}
                      value={person.name}
                    />
                  ) : (
                    <span
                      aria-label={`Meno osoby ${person.name}`}
                      className="person-name person-name-static"
                    >
                      {person.name}
                    </span>
                  )}
                  {person.id === activePersonId ? (
                    <span className="signed-in-badge">{sync.mode === 'profiles' ? 'zvolená' : 'prihlásený'}</span>
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
                              <Image alt="" height={21} src={avatar.src} width={21} />
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <span className="avatar-owner-note">meno je iba text</span>
                )}
              </div>
            </div>
          ))}
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
                <ThemePicker />
                <button onClick={openTransferModal} type="button">
                  Prenos dát
                </button>
                <button type="button" onClick={() => {
                  exportData();
                  void sync.logout(true).catch(() => setTransferMessage('Odhlásenie zlyhalo. Lokálna záloha je zachovaná.'));
                }}>Stiahnuť zálohu a opustiť profil</button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {transferModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-label="Prenos dát"
            aria-modal="true"
            className="dialog-card data-modal"
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
                Import prepíše lokálne dáta v tomto prehliadači.
              </p>
              {transferMessage ? <strong className="transfer-message">{transferMessage}</strong> : null}
              <button disabled={!importText.trim()} type="submit">
                Importovať dáta
              </button>
            </form>
          </section>
        </div>
      ) : null}

      <section className="board-space-switcher" aria-label="Výber tabule">
        {boardSpaces.map((space) => (
          <button
            aria-pressed={space.id === boardSpaceId}
            className={space.id === boardSpaceId ? 'active' : ''}
            key={space.id}
            onClick={() => {
              setRandomActivityId(null);
              setBoardSpaceId(space.id);
            }}
            type="button"
          >
            {space.label}
          </button>
        ))}
      </section>

      <section className="summary-grid" aria-label="Celkový stav">
        <div className="summary-panel">
          <span className="label">Stav na tabuli</span>
          <strong>{totals.percent}%</strong>
          <div className="meter" aria-hidden="true">
            <span style={{ width: `${totals.percent}%` }} />
          </div>
          <GrowthBranch percent={totals.percent} />
          <p>
            Hotovo {totals.done} z {totals.total} drobných krokov v tejto tabuľke.
          </p>
          <GratitudePanel entries={gratitudeEntries} people={people} activePersonId={activePersonId} onSave={(day, text) => {
            if (day !== gratitudeDay()) return;
            const entry = { id: activePersonId + ':' + day, personId: activePersonId, day, text };
            setGratitudeEntries((current) => [...current.filter((item) => item.id !== entry.id), entry]);
          }} />
        </div>
        {!canEditBoard ? <p className="personal-readonly-note">Osobná tabuľa druhej osoby — iba na prezeranie.</p> : null}
        <fieldset disabled={!canEditBoard} className="board-edit-controls"><form className="new-goal" onSubmit={addGoal}>
          {boardGoals.some((goal) => normalizeGoalCategory(goal.category) === 'chore') ? <p className="chore-progress-note">Bežné chores sa počítajú za dnešok podľa náročnosti. Vykonanie môžeš zaznamenať opakovane; občasné chores majú vlastný priebeh.</p> : null}
          <ProjectProgressStrip key={boardSpaceId + '-plans-' + goalSnapshots.filter((goal) => !goal.isChore).map((goal) => goal.id).join(',')} subtitle={[...new Set(goalSnapshots.filter((goal) => !goal.isChore).map((goal) => goal.categoryLabel))].join(' · ') || getCategoryLabel('plan', boardSpaceId)} goals={goalSnapshots.filter((goal) => !goal.isChore)} />
          {goalSnapshots.some((goal) => goal.isChore) ? <ProjectProgressStrip key={boardSpaceId + '-chores-' + goalSnapshots.filter((goal) => goal.isChore).map((goal) => goal.id).join(',')} heading="Chores" goals={goalSnapshots.filter((goal) => goal.isChore)} /> : null}
          <label>
            Nový plán v tabuľke {boardSpaceLabel}
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
              {enabledGoalCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {getCategoryLabel(category.id, boardSpaceId)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Pridať plán</button>
        </form></fieldset>
      </section>

      {recentActivity.length > 0 ? (
        <RecentActivityPanel activityLog={recentActivity} people={people} />
      ) : null}

      <CompletedWorkPanel completedItems={completedItems} people={people} />

      <ActivityWheelPanel key={boardSpaceId + activePersonId}
        activitiesOpen={activitiesOpen}
        activities={activityGoals}
        onToggleActivities={() => setActivitiesOpen((open) => !open)}
        onPickRandom={pickRandomActivity}
        selectedActivity={randomActivity}
      />

      <fieldset disabled={!canEditBoard} className="board-edit-controls"><RecurringCalendarPanel
        boardSpaceId={boardSpaceId}
        goals={recurringGoals}
        onChangeRecurrence={changeGoalRecurrence}
        onChangeRecurrenceStart={changeGoalRecurrenceStart}
        onChangeRecurrenceTolerance={changeGoalRecurrenceTolerance}
        onCompleteToday={completeRecurringGoalToday}
      />

      </fieldset>
      <PriorityPoll
        onRefreshOrder={() => setPriorityRefreshKey((key) => key + 1)}
        boardSpaceId={boardSpaceId}
        people={people}
        refreshKey={priorityRefreshKey}
        rankedGoals={rankedActiveGoals}
      />

      <section className="board" aria-label="Zoznam cieľov">
        {boardGoalGroups.length > 0 ? (
          boardGoalGroups.map((category) => (
            <section className="board-category" key={category.id}>
              <div className="board-category-heading">
                <h2>{getCategoryLabel(category.id, boardSpaceId)}</h2>
                <span>{category.goals.length}</span>
              </div>
              <div className="board-category-list">
                {category.goals.map((goal) => (
                  <GoalPanel
                    activePersonId={activePersonId}
                    goal={goal}
                    key={goal.id}
                    boardSpaceId={boardSpaceId}
                    onAddSubtask={addSubtask}
                    onChangeCategory={changeGoalCategory}
                    onChangeRecurrence={changeGoalRecurrence}
                    onChangeTaskKind={changeTaskKind}
                    onChangeChoreCadence={changeChoreCadence}
                    onChangeChoreWeight={changeChoreWeight}
                    onChangeDeadline={changeDeadline}
                    onCompleteRecurring={completeRecurringGoalToday}
                    onDelete={deleteTask}
                    onRateFeasibility={rateGoalFeasibility}
                    onRateImportance={rateGoalImportance}
                    onRenameDescription={updateGoalDescription}
                    onRename={renameTask}
                    people={people}
                    toggleDone={toggleDone}
                    undoChoreCompletion={undoChoreCompletion}
                    toggleExpanded={toggleExpanded}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="empty-board">Prvý plán si nájde miesto hneď tu.</p>
        )}
      </section>
    </main>
  );
}

function downloadJson(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function conflictLabel(path: string, state: AppStateData) {
  const parts = path.split('/');
  const task = [...parts].reverse().map((id) => findTaskById(state.goals, id)).find(Boolean);
  const person = state.people.find((person) => parts.includes(person.id));
  const names: Record<string, string> = { gratitudeEntries: 'vďačnosti', text: 'zápis vďačnosti', title: 'názov', description: 'poznámka', done: 'dokončenie', deletedAt: 'vymazanie', category: 'kategória', dueAt: 'termín', choreCadence: 'skupina chores', choreWeight: 'náročnosť chores', recurrenceDays: 'interval', recurrenceStartAt: 'začiatok opakovania', recurrenceToleranceDays: 'tolerancia', name: 'meno', avatarId: 'avatar', goalRankings: 'poradie', importanceByPerson: 'dôležitosť', feasibilityByPerson: 'reálnosť' };
  const field = [...parts].reverse().find((part) => names[part]);
  return `${task?.title ?? person?.name ?? 'Tabuľa'} · ${field ? names[field] : 'položka'}`;
}

function conflictValue(value: unknown): string {
  if (value === undefined) return 'bez hodnoty / odstránené';
  if (typeof value === 'boolean') return value ? 'áno' : 'nie';
  if (value && typeof value === 'object' && 'title' in value) return `${String(value.title)}${'deletedAt' in value && value.deletedAt ? ' (v koši)' : ''}`;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function AuthGate({ onAuthenticate, onChooseProfile, mode, people, status }: {
  onAuthenticate: (email: string, password: string) => Promise<void>;
  onChooseProfile: (personId: string) => Promise<void>;
  mode: 'profiles' | 'supabase';
  people: Person[];
  status: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <main className="auth-shell"><section className="auth-card" aria-label="Prihlásenie do tabule">
    <Image alt="Little acorns Foxies" className="foxies-logo" src="/foxies-logo.png" width={98} height={74} priority />
    <h1>Vitaj doma, líštička</h1>
    <p>{mode === 'profiles' ? 'Ktorá líštička ide plánovať?' : 'Prihlás sa do svojho účtu. Uvidíš spoločnú a svoju osobnú tabuľu.'}</p>
    {mode === 'profiles' ? <div className="auth-people">
      {people.map((person) => <button className="auth-person" type="button" disabled={busy} key={person.id} onClick={async () => {
        setBusy(true); setError('');
        try { await onChooseProfile(person.id); }
        catch (error) { setError(error instanceof Error ? error.message : 'Výber sa nepodaril. Skús znova.'); }
        finally { setBusy(false); }
      }}><AvatarFox person={person} size="medium" /><span>{person.name}</span></button>)}
      {error || status ? <p role="alert">{error || status}</p> : null}
    </div> : <form className="login-form" onSubmit={async (event) => {
      event.preventDefault(); setError(''); setBusy(true);
      try { await onAuthenticate(email, password); setPassword(''); }
      catch (error) { setError(error instanceof Error ? error.message : 'Prihlásenie zlyhalo. Skús znova.'); }
      finally { setBusy(false); }
    }}>
      <label>E-mail<input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Heslo<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button type="submit" disabled={busy}>{busy ? 'Prihlasujem…' : 'Prihlásiť sa'}</button>
      {error || status ? <p role="alert">{error || status}</p> : null}
    </form>}
  </section></main>;
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
              <span className="activity-action">{item.action}</span>
              <strong className="activity-target">{item.target}</strong>
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

function ActivityWheelPanel({ activitiesOpen, activities, onToggleActivities, onPickRandom, selectedActivity }: {
  activitiesOpen: boolean; activities: Goal[]; onToggleActivities: () => void; onPickRandom: () => void; selectedActivity: Goal | null;
}) {
  const [spinning, setSpinning] = useState(false);
  const [ready, setReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  function spin() {
    if (spinning || !ready || activities.length === 0) return;
    if (imageFailed) { onPickRandom(); return; }
    setSpinning(true);
  }
  return <section className="special-panel activity-wheel" aria-label="Náhodný výber aktivity">
    <div className="special-heading">
      <div><span className="label">Activities</span><h2>Koleso čo ísť robiť</h2></div>
      <button disabled={activities.length === 0 || spinning || !ready} onClick={spin} type="button">{spinning ? 'Točí sa…' : 'Zatočiť'}</button>
    </div>
    <div className="activity-wheel-stage" aria-busy={spinning}>
      <div className="wheel-frames-window" aria-hidden="true">
        <Image className={spinning ? 'wheel-frames spinning' : 'wheel-frames'} src="/activity-wheel/frames.webp" alt="" width={7872} height={280} unoptimized loading="eager"
          onLoad={() => setReady(true)} onError={() => { setImageFailed(true); setReady(true); }}
          onAnimationEnd={(event) => { if (event.animationName === 'wheel-frames-spin') { setSpinning(false); onPickRandom(); } }} />
      </div>
      <p className="wheel-spin-status" role="status">{spinning ? 'Koleso sa točí…' : !ready ? 'Načítavam koleso…' : imageFailed ? 'Animáciu sa nepodarilo načítať. Výber aktivity je dostupný.' : activities.length ? 'Zatoč a nechaj vybrať koleso.' : 'Najprv pridaj aktivity do kategórie Activities.'}</p>
    </div>
    {activities.length > 0 ? <button className="activity-list-toggle" onClick={onToggleActivities} type="button">{activitiesOpen ? 'Skryť aktivity' : 'Ukázať aktivity'}</button> : null}
    {activitiesOpen ? <div className="activity-options">{activities.map((activity) => <span key={activity.id}>{activity.title}</span>)}</div> : null}
    {!spinning && selectedActivity ? <div className="activity-result" role="status"><span>Vybrané</span><strong>{selectedActivity.title}</strong><p>{selectedActivity.description}</p></div> : null}
  </section>;
}

function RecurringCalendarPanel({
  boardSpaceId,
  goals,
  onChangeRecurrence,
  onChangeRecurrenceStart,
  onChangeRecurrenceTolerance,
  onCompleteToday,
}: {
  boardSpaceId: BoardSpaceId;
  goals: Goal[];
  onChangeRecurrence: (goalId: string, recurrenceDays: number) => void;
  onChangeRecurrenceStart: (goalId: string, recurrenceStartAt: string) => void;
  onChangeRecurrenceTolerance: (goalId: string, toleranceDays: number) => void;
  onCompleteToday: (goalId: string) => void;
}) {
  return (
    <section className="special-panel recurring-calendar" aria-label="Kalendár chores">
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
            const recurrenceDays = normalizeRecurrenceDays(goal.recurrenceDays);
            const toleranceDays = normalizeRecurrenceToleranceDays(goal.recurrenceToleranceDays);
            const dueLabel = formatRecurrenceWindow(dueDate, toleranceDays);
            const history = goal.recurrenceHistory ?? (goal.lastCompletedAt ? [goal.lastCompletedAt] : []);
            const currentStatus = getCurrentRecurrenceStatus(dueDate, toleranceDays);
            const category = normalizeGoalCategory(goal.category);

            return (
              <li key={goal.id}>
                <div className="recurring-copy">
                  <strong>{goal.title}</strong>
                  <span>
                    {getCategoryLabel(category, boardSpaceId)} · každých {recurrenceDays} dní
                  </span>
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
                <label className="mini-recurrence">
                  tolerancia
                  <input
                    min={0}
                    onChange={(event) => onChangeRecurrenceTolerance(goal.id, Number(event.target.value))}
                    type="number"
                    value={toleranceDays}
                  />
                  dní
                </label>
                <label className="mini-recurrence start-date">
                  od
                  <input
                    onChange={(event) => onChangeRecurrenceStart(goal.id, event.target.value)}
                    type="date"
                    value={toDateInputValue(goal.recurrenceStartAt)}
                  />
                </label>
                <time>
                  {dueLabel}
                </time>
                <span className={`recurring-status ${currentStatus.className}`}>
                  ✓ {currentStatus.label}
                </span>
                <details className="recurring-history">
                  <summary title="História dokončení">✓ {history.length}</summary>
                  <ol>
                    {history.length > 0 ? (
                      history.slice(0, 8).map((completedAt, index) => {
                        const status = getRecurringHistoryStatus(
                          completedAt,
                          history[index + 1] ?? goal.recurrenceStartAt,
                          recurrenceDays,
                          toleranceDays,
                        );

                        return (
                          <li key={completedAt}>
                            <span className={`history-check ${status.className}`} title={status.label}>✓</span>
                            {new Date(completedAt).toLocaleDateString('sk-SK', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                          </li>
                        );
                      })
                    ) : (
                      <li>Zatiaľ nič</li>
                    )}
                  </ol>
                </details>
                <button onClick={() => onCompleteToday(goal.id)} type="button">
                  Dnes hotovo
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p>Chores dostanú opakovanie a objavia sa tu ako malý kalendár.</p>
      )}
    </section>
  );
}

function PriorityPoll({
  boardSpaceId,
  onRefreshOrder,
  people,
  refreshKey,
  rankedGoals,
}: {
  boardSpaceId: BoardSpaceId;
  onRefreshOrder: () => void;
  people: Person[];
  refreshKey: number;
  rankedGoals: Goal[];
}) {
  const groupedGoals = enabledGoalCategories
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
          <p className="priority-poll-help">
            Dôležitosť = ako veľmi danej osobe aktuálny stav vyhovuje alebo nevyhovuje.
            Reálnosť = ako reálne daný človek vidí, že sa problém vie vyriešiť.
          </p>
        </div>
        <div className="priority-heading-actions">
          <button className="refresh-order-button" onClick={onRefreshOrder} type="button">
            Obnoviť poradie
          </button>
          <button
            aria-label="Ako funguje anketa priorít"
            className="info-button"
            title="Poradie používa kombinované skóre: dôležitosť má väčšiu váhu, reálnosť riešenia pomáha rozlíšiť podobne dôležité veci."
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
              <h3>{getCategoryLabel(category.id, boardSpaceId)}</h3>
              <ol className="priority-list">
                {category.goals.map((goal, index) => {
                  const averageFeasibility = getAverageFeasibility(goal, people);
                  const averageImportance = getAverageImportance(goal, people);
                  const priorityScore = getPriorityScore(goal, people);

                  return (
                    <li key={goal.id}>
                      <span className="priority-rank">{index + 1}</span>
                      <div className="priority-copy">
                        <strong>{goal.title}</strong>
                        <span>
                          Skóre {priorityScore.toFixed(1)}/5 · dôležitosť {averageImportance.toFixed(1)} · reálnosť {averageFeasibility.toFixed(1)}
                        </span>
                      </div>
                      <div className="priority-votes" aria-label={`Poradie pre ${goal.title}`}>
                        {people.map((person) => (
                          <span
                            key={person.id}
                            style={{ '--person-tone': person.tone } as React.CSSProperties}
                          >
                            <AvatarFox person={person} size="small" />
                            {clampImportance(goal.importanceByPerson?.[person.id]) ?? minImportance}/
                            {clampImportance(goal.feasibilityByPerson?.[person.id]) ?? 3}
                          </span>
                        ))}
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
  heading = 'Plány na očiach',
  subtitle,
}: {
  goals: Array<{ id: string; title: string; done: number; total: number; percent: number }>;
  heading?: string;
  subtitle?: string;
}) {
  const [start, setStart] = useState(0);
  const [shuffledIds, setShuffledIds] = useState<string[] | null>(null);
  const [auto, setAuto] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const ordered = shuffledIds ? shuffledIds.map((id) => goals.find((goal) => goal.id === id)!).filter(Boolean) : goals;
  const canSlide = ordered.length > 4;
  const visibleGoals = Array.from({ length: Math.min(4, ordered.length) }, (_, index) => ordered[(start + index) % ordered.length]);
  const move = (direction: number) => setStart((current) => (current + direction + ordered.length) % ordered.length);
  useEffect(() => {
    if (!auto || paused || !canSlide) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setStart((current) => (current + 1) % goals.length);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [auto, paused, canSlide, goals.length]);
  function shuffle() {
    const ids = goals.map((goal) => goal.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = createRandomIndex(i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setShuffledIds(ids); setStart(0);
  }
  return (
    <div className="project-strip" aria-label={heading === 'Chores' ? 'Progres chores' : 'Progres jednotlivých plánov'}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
      <div className="project-strip-heading">
        <div className="project-strip-title"><span className="label">{heading}</span>{subtitle ? <span className="project-strip-subtitle">{subtitle}</span> : null}</div>
        <div className="project-strip-controls">
          <button type="button" title="Predchádzajúce položky" aria-label={heading + ': predchádzajúce položky'} disabled={!canSlide} onClick={() => move(-1)}>‹</button>
          <button type="button" title="Náhodný výber" aria-label={heading + ': náhodný výber'} disabled={goals.length < 2} onClick={shuffle}>🔀</button>
          <button type="button" title={auto ? 'Zastaviť automatické posúvanie' : 'Automaticky posúvať každých 15 sekúnd'} aria-label={heading + ': automatické posúvanie'} aria-pressed={auto} disabled={!canSlide} onClick={(event) => { setAuto((value) => !value); if (event.detail > 0) event.currentTarget.blur(); }}>{auto ? '⏸' : '▶'}</button>
          <button type="button" title="Ďalšie položky" aria-label={heading + ': ďalšie položky'} disabled={!canSlide} onClick={() => move(1)}>›</button>
          <strong title="Celkový počet položiek">{goals.length}</strong>
        </div>
      </div>
      {shuffledIds ? <button type="button" className="project-order-reset" onClick={() => { setShuffledIds(null); setStart(0); }}>Podľa ankety</button> : null}
      {visibleGoals.length > 0 ? (
        <div className="project-bars" aria-live={auto ? 'off' : 'polite'}>
          {visibleGoals.map((goal) => (
            <div className="project-bar" key={goal.id}>
              <div className="project-bar-copy">
                <span title={goal.title}>{goal.title}</span>
                <strong>{goal.percent}% · {goal.done}/{goal.total}</strong>
              </div>
              <div className="meter mini" aria-hidden="true"><span style={{ width: goal.percent + '%' }} /></div>
            </div>
          ))}
        </div>
      ) : <p>Prvý plán si nájde miesto hneď tu.</p>}
    </div>
  );
}

type GoalPanelProps = {
  activePersonId: string;
  boardSpaceId: BoardSpaceId;
  goal: Goal;
  onAddSubtask: (parentId: string, title: string, dueAt?: string, kind?: TaskKind, choreCadence?: ChoreCadence, choreWeight?: ChoreWeight) => void;
  onChangeCategory: (goalId: string, category: GoalCategory) => void;
  onChangeRecurrence: (goalId: string, recurrenceDays: number) => void;
  onChangeTaskKind: (taskId: string, kind: TaskKind) => void;
  onChangeChoreCadence: (taskId: string, cadence: ChoreCadence) => void;
  onChangeChoreWeight: (taskId: string, weight: ChoreWeight) => void;
  onChangeDeadline: (taskId: string, value: string) => void;
  onCompleteRecurring: (goalId: string) => void;
  onDelete: (taskId: string) => void;
  onRateFeasibility: (goalId: string, personId: string, feasibility: number) => void;
  onRateImportance: (goalId: string, personId: string, importance: number) => void;
  onRename: (taskId: string, title: string) => void;
  onRenameDescription: (goalId: string, description: string) => void;
  people: Person[];
  toggleDone: (taskId: string) => void;
  undoChoreCompletion: (taskId: string, completionId: string) => void;
  toggleExpanded: (taskId: string) => void;
};

function GoalPanel(props: GoalPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [descriptionChunks, setDescriptionChunks] = useState<string[]>([]);
  const progress = calculateProgress(props.goal);
  const feasibilityByPerson = normalizeGoalFeasibility(props.goal, props.people);
  const importanceByPerson = normalizeGoalImportance(props.goal, props.people);
  const category = normalizeGoalCategory(props.goal.category);
  const isRecurring = recurringCategoryIds.includes(category);
  const occasionalProgress = calculateChoreProgress(props.goal.children, 'occasional');
  const isCompletable = isCompletableTask(props.goal);
  const suggestedDescriptionChunks = useMemo(
    () => splitLongDescription(props.goal.description),
    [props.goal.description],
  );

  function addDescriptionChunksAsSubtasks() {
    descriptionChunks.forEach((chunk) => props.onAddSubtask(props.goal.id, chunk));
    setDescriptionChunks([]);
  }

  if (props.boardSpaceId !== sharedSpaceId && props.boardSpaceId !== props.activePersonId) return <ReadOnlyGoal goal={props.goal} people={props.people} />;

  return (
    <article className={`goal-panel${expanded ? '' : ' goal-panel-collapsed'}`}>
      <div className="goal-header">
        <button
          aria-label={expanded ? 'Zbaliť cieľ' : 'Rozbaliť cieľ'}
          aria-expanded={expanded}
          title={expanded ? 'Zbaliť cieľ' : 'Rozbaliť cieľ'}
          className="icon-button"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? '▾' : '▸'}
        </button>
        <div className="goal-title-block">
          <EditableInput
            aria-label="Názov cieľa"
            className="title-input"
            value={props.goal.title}
            onCommit={(value) => props.onRename(props.goal.id, value)}
            onKeyDown={saveInputOnEnter}
            title="Klikni a uprav názov"
          />
          {expanded ? <>
          <span className="description-tooltip-wrap">
            <EditableInput
              aria-label="Poznámka k cieľu"
              className="description-input"
              value={props.goal.description}
              onCommit={(value) => props.onRenameDescription(props.goal.id, value)}
              onKeyDown={saveInputOnEnter}
              placeholder="Poznámka k plánu"
              title="Klikni a uprav poznámku"
            />
            {props.goal.description.trim() ? (
              <span className="description-tooltip" role="tooltip">
                {props.goal.description}
              </span>
            ) : null}
          </span>
          {descriptionChunks.length > 0 ? (
            <div className="description-split-preview">
              <span>Navrhnuté podúlohy</span>
              <ol>
                {descriptionChunks.map((chunk, index) => (
                  <li key={`${index}-${chunk}`}>{chunk}</li>
                ))}
              </ol>
              <div className="description-split-actions">
                <button onClick={addDescriptionChunksAsSubtasks} type="button">
                  Pridať ako podúlohy
                </button>
                <button onClick={() => setDescriptionChunks([])} type="button">
                  Zrušiť
                </button>
              </div>
            </div>
          ) : suggestedDescriptionChunks.length > 1 ? (
            <button
              className="description-split-button"
              onClick={() => setDescriptionChunks(suggestedDescriptionChunks)}
              type="button"
            >
              Rozkúskovať poznámku
            </button>
          ) : null}
          </> : null}
        </div>
        <div className="progress-badge">
          {category === 'chore' ? <><strong>Dnes: {progress.total ? `${progress.percent}%` : '—'}</strong><span>Občasné: {occasionalProgress.total ? `${occasionalProgress.percent}%` : '—'}</span></> : <strong>{progress.percent}%</strong>}
          <span>
            {progress.done}/{progress.total}
          </span>
        </div>
        {expanded ? <button
          aria-label="Presunúť plán do koša"
          className="icon-button danger"
          onClick={() => props.onDelete(props.goal.id)}
          type="button"
        >
          ×
        </button> : null}
      </div>

      {expanded ? <>
      <div className="goal-meta">
        <label className="deadline-field">Termín
          <input aria-label="Termín plánu" type="datetime-local" value={deadlineInput(props.goal.dueAt)} onChange={(event) => props.onChangeDeadline(props.goal.id, event.target.value)} />
        </label>
        {isCompletable ? (
          <label className="check-row">
            <input
              checked={props.goal.done}
              onChange={() => props.toggleDone(props.goal.id)}
              type="checkbox"
            />
            Plán označený ako hotový
          </label>
        ) : (
          <span className="non-checkable-note">Bez checkboxu</span>
        )}
        <ItemMeta
          createdById={props.goal.ownerId}
          people={props.people}
          updatedById={props.goal.updatedById}
        />
        <label className="category-select kind-select">
          Typ
          <select
            onChange={(event) => props.onChangeTaskKind(props.goal.id, event.target.value as TaskKind)}
            value={props.goal.kind ?? 'todo'}
          >
            {taskKinds.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.label}
              </option>
            ))}
          </select>
        </label>
        <label className="category-select">
          Kategória
          <select
            onChange={(event) => props.onChangeCategory(props.goal.id, event.target.value as GoalCategory)}
            value={props.goal.category ?? 'plan'}
          >
            {enabledGoalCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {getCategoryLabel(category.id, props.boardSpaceId)}
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
        feasibilityByPerson={feasibilityByPerson}
        goalId={props.goal.id}
        importanceByPerson={importanceByPerson}
        onRateFeasibility={props.onRateFeasibility}
        onRateImportance={props.onRateImportance}
        people={props.people}
      />

        <div className="children-list">
          <TaskList {...props} tasks={props.goal.children} parentId={props.goal.id} depth={1} />
          <AddTaskForm
            label="Pridať podúlohu k cieľu"
            onSubmit={(title, dueAt) => props.onAddSubtask(props.goal.id, title, dueAt)}
          />
        </div>
      </> : null}
    </article>
  );
}

function ImportancePanel({
  activePersonId,
  feasibilityByPerson,
  goalId,
  importanceByPerson,
  onRateFeasibility,
  onRateImportance,
  people,
}: {
  activePersonId: string;
  feasibilityByPerson: Record<string, number>;
  goalId: string;
  importanceByPerson: Record<string, number>;
  onRateFeasibility: (goalId: string, personId: string, feasibility: number) => void;
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
      aria-label="Dôležitosť a reálnosť plánu pre jednotlivé líštičky"
    >
      <div className="importance-heading">
        <span>{summary}</span>
        <button
          aria-label="Ako čítať dôležitosť"
          className="info-button"
          title="Dôležitosť má v poradí väčšiu váhu. Reálnosť riešenia pomáha rozlíšiť, či už vidíte uskutočniteľný ďalší krok: 1 zatiaľ ťažko, 5 veľmi reálne."
          type="button"
        >
          i
        </button>
      </div>
      <div className="importance-rows">
        {people.map((person) => {
          const importance = importanceByPerson[person.id] ?? minImportance;
          const feasibility = feasibilityByPerson[person.id] ?? 3;
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
              <div className="rating-stack">
                <span>Dôležitosť</span>
                <RatingMeter
                  activeTone="importance"
                  canEdit={canEdit}
                  label={`${person.name}: dôležitosť`}
                  onRate={(value) => onRateImportance(goalId, person.id, value)}
                  personName={person.name}
                  value={importance}
                />
              </div>
              <div className="rating-stack">
                <span>Reálnosť</span>
                <RatingMeter
                  activeTone="feasibility"
                  canEdit={canEdit}
                  label={`${person.name}: reálnosť riešenia`}
                  onRate={(value) => onRateFeasibility(goalId, person.id, value)}
                  personName={person.name}
                  value={feasibility}
                />
              </div>
              <strong>{importance}/{feasibility}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RatingMeter({
  activeTone,
  canEdit,
  label,
  onRate,
  personName,
  value,
}: {
  activeTone: 'importance' | 'feasibility';
  canEdit: boolean;
  label: string;
  onRate: (value: number) => void;
  personName: string;
  value: number;
}) {
  return (
    <div
      className={`importance-meter ${activeTone}`}
      aria-label={`${label} ${value} z 5`}
    >
      {Array.from({ length: maxImportance }, (_, index) => {
        const rating = index + 1;

        return (
          <button
            aria-label={
              canEdit
                ? `${label}: nastaviť ${rating} z 5`
                : `${label}: ${rating} z 5`
            }
            className={rating <= value ? 'active' : ''}
            disabled={!canEdit}
            key={rating}
            onClick={() => onRate(rating)}
            title={
              canEdit
                ? `${personName}: nastaviť ${rating}/5`
                : `${personName}: toto hodnotenie si mení iba ${personName}`
            }
            type="button"
          />
        );
      })}
    </div>
  );
}

function AvatarFox({ person, size = 'small' }: { person: Person; size?: 'small' | 'medium' }) {
  const avatar =
    avatarOptions.find((option) => option.id === person.avatarId) ?? avatarOptions[0];

  return (
    <Image
      alt=""
      className={`avatar-fox ${size}`}
      height={size === 'medium' ? 42 : 23}
      src={avatar.src}
      width={size === 'medium' ? 42 : 23}
    />
  );
}

function ReadOnlyTasks({ tasks }: { tasks: Task[] }) {
  return <div className="nested">{tasks.map((task) => <div className="task-branch" key={task.id}>
    <details>
      <summary className="task-row readonly-task-row"><span aria-hidden="true">{task.done ? '✓' : '•'}</span><span>{task.title}</span></summary>
      {task.children.length ? <ReadOnlyTasks tasks={task.children} /> : null}
    </details>
  </div>)}</div>;
}
function ReadOnlyGoal({ goal, people }: { goal: Goal; people: Person[] }) {
  const progress = calculateProgress(goal);
  return <article className="goal-panel readonly-goal"><details>
    <summary><h3>{goal.title}</h3><span>{progress.percent}%</span></summary>
    <p>{goal.description}</p>
    <p>{people.map((person) => person.name + ': dôležitosť ' + (goal.importanceByPerson[person.id] ?? 2) + '/5 · reálnosť ' + (goal.feasibilityByPerson?.[person.id] ?? 3) + '/5').join(' · ')}</p>
    <ReadOnlyTasks tasks={goal.children} />
  </details></article>;
}

type TaskRowProps = GoalPanelProps & {
  depth: number;
  parentId: string;
  task: Task;
};

function TaskList(props: GoalPanelProps & { tasks: Task[]; parentId: string; depth: number }) {
  const renderTasks = (tasks: Task[]) => tasks.map((task) => <TaskRow {...props} key={task.id} task={task} />);
  if (normalizeGoalCategory(props.goal.category) !== 'chore' || (props.depth > 1 && new Set(props.tasks.map((task) => task.choreCadence ?? 'routine')).size < 2)) return <>{renderTasks(props.tasks)}</>;
  return <>{(['routine', 'occasional'] as const).map((cadence) => {
    const tasks = props.tasks.filter((task) => (task.choreCadence ?? 'routine') === cadence);
    const progress = calculateChoreProgress(props.tasks, cadence);
    if (!tasks.length && props.depth > 1) return null;
    return <section className="chore-task-group" key={cadence} aria-label={cadence === 'routine' ? 'Bežné chores' : 'Občasné chores'}>
      <div className="chore-group-heading"><h3>{cadence === 'routine' ? 'Bežné chores' : 'Občasné chores'}</h3><span>{cadence === 'routine' ? 'Dnešné vykonania · podľa potreby' : 'Raz za dlhší čas'}</span><strong title="Podiel dokončenej práce podľa náročnosti">{progress.total ? `${progress.percent}% · ${progress.doneWeight}/${progress.totalWeight} bodov` : '—'}</strong></div>
      {tasks.length ? renderTasks(tasks) : <p className="chore-group-empty">{cadence === 'routine' ? 'Podúlohu sem zaradíš výberom „Bežné“ v jej riadku.' : 'Podúlohu sem zaradíš výberom „Občasné“ v jej riadku.'}</p>}
    </section>;
  })}</>;
}

function TaskRow(props: TaskRowProps) {
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [splitDraft, setSplitDraft] = useState<string | null>(null);
  const titleChunks = (splitDraft ?? '').split('\n').map((chunk) => chunk.trim()).filter(Boolean);
  const isChore = normalizeGoalCategory(props.goal.category) === 'chore';
  const completions = (props.task.choreCompletions ?? []).filter((entry) => !entry.undoneAt).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const completedLabel = (value: string) => new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  const hasChildren = props.task.children.length > 0;
  const isCompletable = isCompletableTask(props.task);
  const suggestedTitleChunks = useMemo(
    () => splitLongDescription(props.task.title),
    [props.task.title],
  );

  function splitTaskIntoSiblings() {
    const [firstChunk, ...siblingChunks] = titleChunks;

    if (!firstChunk || titleChunks.length < 2) {
      return;
    }

    props.onRename(props.task.id, firstChunk);
    siblingChunks.forEach((chunk) =>
      props.onAddSubtask(props.parentId, chunk, props.task.dueAt, props.task.kind ?? 'todo', props.task.choreCadence, props.task.choreWeight),
    );
    setSplitDraft(null);
  }

  return (
    <div className="task-branch" style={{ '--depth': props.depth } as React.CSSProperties}>
      <div className={[
        'task-row',
        props.task.done ? 'done' : '',
        isCompletable ? '' : 'no-checkbox',
      ].filter(Boolean).join(' ')}>
        <button
          aria-label={hasChildren ? (expanded ? 'Skryť vnorené podúlohy' : 'Zobraziť vnorené podúlohy') : 'Bez vnorených podúloh'}
          aria-expanded={hasChildren ? expanded : undefined}
          title={hasChildren ? `${expanded ? 'Skryť' : 'Zobraziť'} vnorené podúlohy (${props.task.children.length})` : 'Bez vnorených podúloh'}
          className={`icon-button compact${hasChildren && !expanded ? ' has-hidden-subtasks' : ''}`}
          disabled={!hasChildren}
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <span aria-hidden="true">{hasChildren ? (expanded ? '▾' : '▸') : '•'}</span>
        </button>
        {isCompletable && isChore ? (
          <button type="button" className={`chore-complete-button${props.task.done ? ' completed-today' : ''}`} aria-label="Zaznamenať vykonanie podúlohy" title="Vykonané teraz — môžeš označiť opakovane" onClick={() => props.toggleDone(props.task.id)}><span aria-hidden="true">✓</span></button>
        ) : isCompletable ? (
          <label className="checkbox-only" aria-label="Označiť ako hotové">
            <input
              checked={props.task.done}
              onChange={() => props.toggleDone(props.task.id)}
              type="checkbox"
            />
          </label>
        ) : (
          <span className="checkbox-spacer" aria-hidden="true" />
        )}
        <span className="task-title-tooltip-wrap">
          <EditableInput
            aria-label="Názov podúlohy"
            className="task-title"
            value={props.task.title}
            onCommit={(value) => props.onRename(props.task.id, value)}
            onKeyDown={saveInputOnEnter}
            title="Klikni a uprav podúlohu"
          />
          {props.task.title.trim() ? (
            <span className="task-title-tooltip" role="tooltip">
              {props.task.title}
            </span>
          ) : null}
        </span>
        <div className="task-actions">
          <button aria-label="Pridať vnorenú podúlohu" title="Pridať vnorenú podúlohu" className="icon-button compact" onClick={() => setAdding(!adding)} type="button">
            <span aria-hidden="true">+</span>
          </button>
          <button
            aria-label="Rozkúskovať podúlohu"
            title="Rozkúskovať podúlohu"
            className="icon-button compact"
            onClick={() => setSplitDraft((suggestedTitleChunks.length ? suggestedTitleChunks : [props.task.title]).join('\n'))}
            type="button"
          >
            <span aria-hidden="true">✂</span>
          </button>
        <label className="task-kind-select">
          <span>Typ</span>
          <select
            aria-label="Typ podúlohy"
            onChange={(event) => props.onChangeTaskKind(props.task.id, event.target.value as TaskKind)}
            value={props.task.kind ?? 'todo'}
          >
            {taskKinds.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.label}
              </option>
            ))}
          </select>
        </label>
        {normalizeGoalCategory(props.goal.category) === 'chore' ? (
          <label className="task-kind-select">
            <span>Chores</span>
            <select aria-label="Skupina chores" value={props.task.choreCadence ?? 'routine'} onChange={(event) => props.onChangeChoreCadence(props.task.id, event.target.value as ChoreCadence)}>
              <option value="routine">Bežné</option><option value="occasional">Občasné</option>
            </select>
          </label>
        ) : null}
        {normalizeGoalCategory(props.goal.category) === 'chore' ? (
          <label className="task-kind-select chore-weight-select">
            <span>Náročnosť</span>
            <select aria-label="Náročnosť chores" value={props.task.choreWeight ?? 1} onChange={(event) => props.onChangeChoreWeight(props.task.id, Number(event.target.value) as ChoreWeight)}>
              <option value={1}>Drobná (1)</option><option value={3}>Stredná (3)</option><option value={5}>Veľká (5)</option>
            </select>
          </label>
        ) : null}
        {normalizeGoalCategory(props.goal.category) === 'chore' && props.task.choreCadence === 'occasional' ? (
          <label className="deadline-field">Najbližší termín
            <input aria-label="Najbližší termín občasnej podúlohy" type="datetime-local" value={deadlineInput(props.task.dueAt)} onChange={(event) => props.onChangeDeadline(props.task.id, event.target.value)} />
          </label>
        ) : null}
        {isChore && isCompletable ? <div className="chore-completion-info">
          <span>{completions[0] ? `Naposledy: ${completedLabel(completions[0].completedAt)}` : 'Zatiaľ bez záznamu vykonania'}</span>
          {completions.length ? <details className="chore-completion-history"><summary>História vykonaní ({completions.length})</summary>
            <ol>{completions.map((entry) => <li key={entry.id}>
              <time dateTime={entry.completedAt}>{new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.completedAt))}</time>
              <span>{props.people.find((person) => person.id === entry.personId)?.name}</span>
              {entry.personId === props.activePersonId ? <button type="button" onClick={() => props.undoChoreCompletion(props.task.id, entry.id)} title="Zrušiť omylom zaznamenané vykonanie">Zrušiť vykonanie</button> : null}
            </li>)}</ol>
            <p>Uchováva sa posledných 200 záznamov.</p>
          </details> : null}
        </div> : null}
        <ItemMeta
          createdById={props.task.ownerId}
          people={props.people}
          updatedById={props.task.updatedById}
        />
        </div>
        <button
          aria-label="Presunúť podúlohu do koša"
          className="icon-button compact danger"
          onClick={() => props.onDelete(props.task.id)}
          type="button"
        >
          ×
        </button>
      </div>

      {splitDraft !== null ? (
        <div className="description-split-preview task-split-preview">
          <label>
            Rozdelenie podúlohy (každý riadok bude samostatná podúloha)
            <textarea
              aria-label="Rozdelenie podúlohy"
              value={splitDraft}
              onChange={(event) => setSplitDraft(event.target.value)}
              rows={Math.max(3, Math.min(8, titleChunks.length))}
            />
          </label>
          <div className="description-split-actions">
            <button disabled={titleChunks.length < 2} onClick={splitTaskIntoSiblings} type="button">
              Rozdeliť podúlohu
            </button>
            <button onClick={() => setSplitDraft(null)} type="button">
              Zrušiť
            </button>
          </div>
        </div>
      ) : null}

      {adding ? (
        <AddTaskForm
          label="Názov ďalšej podúlohy"
          onSubmit={(title, dueAt) => {
            props.onAddSubtask(props.task.id, title, dueAt);
            setExpanded(true);
            setAdding(false);
          }}
        />
      ) : null}

      {expanded && hasChildren ? (
        <div className="nested">
          <TaskList {...props} tasks={props.task.children} parentId={props.task.id} depth={props.depth + 1} />
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
  onSubmit: (title: string, dueAt?: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');

  return (
    <form
      className="add-task"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        onSubmit(title, dueAt || undefined);
        setTitle('');
        setDueAt('');
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
      <label>Termín (voliteľný)
        <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
      </label>
      <button type="submit">Pridať</button>
    </form>
  );
}

function deadlineInput(value: string | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}
