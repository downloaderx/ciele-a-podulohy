'use client';

import { ProjectResources } from './project-resources';
import type { ProjectResource } from './project-resources-model';
import { quickUndoCompletion, choreQuickUndoMs } from './chore-quick-undo';
import { purgeTask, selectedTrashRoots } from './trash';
import { RelationshipWorkspace } from './relationship-workspace';
import { collectRules, createRule } from './rulebook-model';
import { ListsWorkspace } from './lists-workspace';
import { createTodoItem, createTodoList, noteColors } from './lists-model';
import { BackupPanel } from './backup-panel';
import { CompletionBubbles } from './completion-bubbles';

import { satisfactionSchedule } from './satisfaction-schedule';
import { ChoresWorkspace } from './chores-workspace';
import { splitPantry } from './chores-workspace-model';
import type { ChoreReveal } from './chore-randomizer-model';
import { SatisfactionPoll, SatisfactionSummary } from './satisfaction-poll';
import { GratitudePanel } from './gratitude-panel';
import { gratitudeDay } from './gratitude';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBoardSync } from './use-board-sync';
import { useReminders } from './use-reminders';
import { allTasks, liveGoal, isValidState, visibleState } from './state-sync';
import { ThemePicker } from './theme-picker';
import { EditableInput } from './editable-input';
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  avatarOptions,
  calculateProgress,
  calculateChoreProgress,
  choreView,
  choreHistorySummary,
  choreAttention,
  getChoreIntervalDays,
  choreElapsedLabel,
  choreElapsedDays,
  clampImportance,
  collectCompletedItems,
  createId,
  createRandomIndex,
  defaultPeople,
  findTaskById,
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
  type NoteColor,
  type GoalCategory,
  type Person,
  type Task,
  type TaskKind,
  type ChoreCadence,
  type ChoreWeight,
  type TransferPayload,
} from './page-model';

const enabledGoalCategories = goalCategories.filter((category) => category.id !== 'errand' && category.id !== 'habit' && category.id !== 'list' && category.id !== 'rulebook');

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
  const pathname = usePathname();
  const isChoresPage = pathname === '/chores';
  const isListsPage = pathname === '/lists-and-todos';
  const [choreReveal, setChoreReveal] = useState<ChoreReveal | null>(null);
  useEffect(() => {
    if (!choreReveal) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById('task-' + choreReveal.taskId);
      target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [choreReveal]);
  const [choreDay, setChoreDay] = useState(() => gratitudeDay());
  useEffect(() => {
    const refresh = () => setChoreDay(gratitudeDay());
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
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
  const creationCategory: GoalCategory = isChoresPage ? 'chore' : newGoalCategory === 'activity' ? 'activity' : 'plan';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [headerError, setHeaderError] = useState('');
  const headerActionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!profileMenuOpen && !settingsOpen) return;
    const close = () => { setProfileMenuOpen(false); setSettingsOpen(false); setTrashOpen(false); setAvatarMenuOpen(false); };
    const outside = (event: MouseEvent) => { if (event.target instanceof Node && !headerActionsRef.current?.contains(event.target)) close(); };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      headerActionsRef.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus();
      close();
    };
    document.addEventListener('click', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('click', outside); document.removeEventListener('keydown', escape); };
  }, [profileMenuOpen, settingsOpen]);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [completionBurst, setCompletionBurst] = useState(0);
  const clearCompletionBurst = useCallback(() => setCompletionBurst(0), []);
  const [relationshipBoardSpaceId, setBoardSpaceId] = useState<BoardSpaceId>(sharedSpaceId);
  const boardSpaceId = isChoresPage || isListsPage ? sharedSpaceId : relationshipBoardSpaceId;
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [readingBackup, setReadingBackup] = useState(false);
  const backupReadId = useRef(0);
  const [transferMessage, setTransferMessage] = useState('');
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [randomActivityId, setRandomActivityId] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [pendingPurgeId, setPendingPurgeId] = useState<string | null>(null);
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
  const todoLists = useMemo(() => activeGoals.filter((goal) => goal.category === 'list' && getGoalSpaceId(goal) === sharedSpaceId), [activeGoals]);
  const activityGoals = useMemo(
    () => visibleGoals.filter((goal) => normalizeGoalCategory(goal.category) === 'activity'),
    [visibleGoals],
  );
  const boardGoals = useMemo(
    () => visibleGoals.filter((goal) => normalizeGoalCategory(goal.category) === (isChoresPage ? 'chore' : 'plan')),
    [visibleGoals, isChoresPage],
  );
  const rankedActiveGoals = useMemo(
    () => sortGoalsByAverageRanking(boardGoals, people, goalRankings),
    [boardGoals, goalRankings, people],
  );
  const trashedGoals = useMemo(() => goals
    .filter((goal) => canEditBoard && getGoalSpaceId(goal) === boardSpaceId)
    .flatMap((goal) => goal.deletedAt ? [goal] : allTasks(goal).filter((task) => task.deletedAt)).filter((task) => !task.purgedAt), [boardSpaceId, goals, canEditBoard]);

  const completedItems = useMemo(
    () => collectCompletedItems(boardGoals),
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
      [...rankedActiveGoals.filter((goal) => normalizeGoalCategory(goal.category) !== 'chore'), ...boardGoals.filter((goal) => normalizeGoalCategory(goal.category) === 'chore').sort((a, b) => a.title.localeCompare(b.title, 'sk'))].map((goal) => ({
        id: goal.id,
        categoryLabel: getCategoryLabel(normalizeGoalCategory(goal.category), boardSpaceId),
        isChore: normalizeGoalCategory(goal.category) === 'chore',
        satisfaction: boardSpaceId === sharedSpaceId && normalizeGoalCategory(goal.category) === 'plan' ? goal : undefined,
        title: normalizeGoalCategory(goal.category) === 'chore' ? `${goal.title} · bežné chores (7 dní)` : goal.title,
        ...calculateProgress(goal),
      })),
    [rankedActiveGoals, boardGoals, boardSpaceId],
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
        category: creationCategory,
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
        kind: creationCategory === 'chore' ? 'todo' : recurringCategoryIds.includes(creationCategory) ? 'rule' : 'topic',
        spaceId: boardSpaceId,
        children: [],
      },
      ...current,
    ]);
    if (creationCategory !== 'activity') {
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
    return goalId;
  }

  function addTodoList(title: string) {
    const list = createTodoList(createId(), title, activePersonId, noteColors[todoLists.length % noteColors.length]);
    if (!list) return;
    setGoals((current) => [...current, list]);
    addActivity('pridal(a) zoznam', list.title);
    return list.id;
  }

  function addTodoItem(listId: string, title: string) {
    const item = createTodoItem(createId(), title, activePersonId);
    if (!item) return;
    setGoals((current) => current.map((list) => list.id === listId && list.category === 'list' && !list.deletedAt
      ? { ...list, updatedById: activePersonId, children: [...list.children, item] } : list));
    addActivity('pridal(a) úlohu do zoznamu', item.title);
  }

  function changeListColor(listId: string, color: NoteColor) {
    if (!noteColors.includes(color)) return;
    setGoals((current) => current.map((list) => list.id === listId && list.category === 'list'
      ? { ...list, noteColor: color, updatedById: activePersonId } : list));
  }

  function addSubtask(parentId: string, title: string, dueAt?: string, kind: TaskKind = 'todo', choreCadence?: ChoreCadence, choreWeight?: ChoreWeight, choreIntervalDays?: number) {
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
            choreIntervalDays,
            children: [],
          },
        ],
      })),
    );
    addActivity('pridal(a) podúlohu', trimmed);
  }

  function toggleDone(taskId: string) {
    const task = findTaskById(goals, taskId);
    const chore = goals.find((goal) => normalizeGoalCategory(goal.category) === 'chore' && allTasks(goal).some((item) => item.id === taskId));

    if (task && ((!chore && !isCompletableTask(task)) || goals.some((goal) => goal.id === taskId && normalizeGoalCategory(goal.category) === 'chore'))) {
      return;
    }

    if (task && chore) {
      const recent = quickUndoCompletion(task, activePersonId);
      if (recent) { undoChoreCompletion(taskId, recent.id); return; }
      setCompletionBurst((current) => current + 1);
      const completion = { id: createId(), personId: activePersonId, completedAt: new Date().toISOString() };
      setGoals((current) => updateTaskTree(current, taskId, (item) => ({ ...item, kind: 'todo', done: false, updatedById: activePersonId,
        choreCompletions: [completion, ...(item.choreCompletions ?? [])].slice(0, 200) })));
      addActivity('vykonal(a) chore', task.title);
      return;
    }
    if (task && !task.done) setCompletionBurst((current) => current + 1);
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

  function changeChoreInterval(taskId: string, value: string) {
    const interval = Number(value);
    const task = findTaskById(goals, taskId);
    if (!task || !Number.isInteger(interval) || interval < 1 || interval > 3650 || getChoreIntervalDays(task) === interval) return;
    setGoals((current) => updateTaskTree(current, taskId, (item) => ({ ...item, choreIntervalDays: interval, updatedById: activePersonId })));
    addActivity('zmenil(a) interval chores', `${task.title} · každých ${interval} dní`);
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

    if (!goal || normalizeGoalCategory(goal.category) === 'chore') {
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
    if (!task?.deletedAt || task.purgedAt) return;
    setGoals((current) => updateTaskTree(current, goalId, (item) => ({ ...item, deletedAt: undefined, updatedById: activePersonId })));
    if (task) addActivity('obnovil(a) položku z koša', task.title);
  }

  function permanentlyDeleteTask(taskId: string) {
    if (!canEditBoard || !trashedGoals.some((task) => task.id === taskId)) return;
    const at = new Date().toISOString();
    setGoals((current) => updateTaskTree(current, taskId, (task) => task.deletedAt && !task.purgedAt ? purgeTask(task, at) : task));
    setPendingPurgeId(null);
  }

  function rateGoalSatisfaction(goalId: string, score: number | null) {
    if (score !== null && clampImportance(score) !== score) return;
    const goal = goals.find((item) => item.id === goalId);
    if (!goal || getGoalSpaceId(goal) !== sharedSpaceId || normalizeGoalCategory(goal.category) !== 'plan') return;
    setGoals((current) => current.map((item) => item.id !== goalId ? item : { ...item,
      satisfactionByPerson: score === null
        ? Object.fromEntries(Object.entries(item.satisfactionByPerson ?? {}).filter(([id]) => id !== activePersonId))
        : { ...item.satisfactionByPerson, [activePersonId]: score },
      satisfactionAnsweredOnByPerson: score === null
        ? Object.fromEntries(Object.entries(item.satisfactionAnsweredOnByPerson ?? {}).filter(([id]) => id !== activePersonId))
        : { ...item.satisfactionAnsweredOnByPerson, [activePersonId]: gratitudeDay() },
      updatedById: activePersonId,
    }));
    addActivity(score === null ? 'zrušil(a) odpoveď spokojnosti' : 'ohodnotil(a) spokojnosť', goal.title);
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
    backupReadId.current++; setImportFileName(''); setReadingBackup(false);
    setSettingsOpen(false);
    setTransferMessage('');
    setImportText('');
    setTransferModalOpen(true);
  }

  function closeTransferModal() {
    backupReadId.current++; setImportFileName(''); setReadingBackup(false);
    setTransferModalOpen(false);
    setTransferMessage('');
    setImportText('');
  }

  function exportData() {
    const payload = createTransferPayload();
    downloadJson(JSON.stringify(payload, null, 2), `little-acorns-foxies-${new Date().toISOString().slice(0, 10)}.json`);
    setTransferMessage('Záloha je stiahnutá ako JSON súbor.');
  }

  async function chooseBackupFile(file: File | undefined) {
    const readId = ++backupReadId.current;
    setImportText(''); setImportFileName(''); setTransferMessage('');
    if (!file) { setReadingBackup(false); return; }
    if (file.size > 8 * 1024 * 1024) { setReadingBackup(false); setTransferMessage('Súbor je príliš veľký. Vyber súbor so zálohou údajov tejto aplikácie.'); return; }
    setReadingBackup(true);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const data = readTransferData(parsed);
      if (!data || !isValidState(data)) throw new Error('Tento súbor nie je platná záloha z tejto aplikácie.');
      if (readId !== backupReadId.current) return;
      setImportText(text); setImportFileName(file.name);
    } catch (error) {
      if (readId === backupReadId.current) setTransferMessage(error instanceof Error ? error.message : 'Zálohu sa nepodarilo načítať.');
    } finally { if (readId === backupReadId.current) setReadingBackup(false); }
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
      setGratitudeEntries(scoped.gratitudeEntries ?? []);
      setGoalRankings(importedGoalRankings);
      setActivePersonId(importedActivePersonId);

      setImportText('');
      setImportFileName('');
      setTransferMessage('Údaje zo zálohy sú obnovené.');
    } catch {
      setTransferMessage('JSON sa nepodarilo prečítať. Skontroluj, či je celý skopírovaný.');
    }
  }

  function renderGoalPanel(goal: Goal) {
    return (<GoalPanel workspace={isChoresPage} focusGoal={!isChoresPage}
                    activePersonId={activePersonId}
                    revealChore={choreReveal}
                    goal={goal}
                    key={goal.id}
                    boardSpaceId={boardSpaceId}
                    onSaveResource={(goalId, resource) => {
                      if (!canEditBoard) return;
                      setGoals((current) => current.map((item) => item.id === goalId ? { ...item, updatedById: activePersonId, resources: [...(item.resources ?? []).filter((entry) => entry.id !== resource.id), resource] } : item));
                      addActivity('uložil(a) podklad', goal.title);
                    }}
                    onRemoveResource={(goalId, id) => {
                      if (!canEditBoard) return;
                      setGoals((current) => current.map((item) => item.id === goalId ? { ...item, updatedById: activePersonId, resources: item.resources?.map((entry) => entry.id === id ? { ...entry, deletedAt: new Date().toISOString() } : entry) } : item));
                      addActivity('odobral(a) podklad', goal.title);
                    }}
                    onAddSubtask={addSubtask}
                    onChangeCategory={changeGoalCategory}
                    onChangeRecurrence={changeGoalRecurrence}
                    onChangeTaskKind={changeTaskKind}
                    onChangeChoreCadence={changeChoreCadence}
                    onChangeChoreWeight={changeChoreWeight}
                    onChangeChoreInterval={changeChoreInterval}
                    onChangeDeadline={changeDeadline}
                    onCompleteRecurring={completeRecurringGoalToday}
                    onDelete={deleteTask}
                    onRateFeasibility={rateGoalFeasibility}
                    onRateImportance={rateGoalImportance}
                    onRateSatisfaction={rateGoalSatisfaction}
                    onRenameDescription={updateGoalDescription}
                    onRename={renameTask}
                    people={people}
                    toggleDone={toggleDone}
                    undoChoreCompletion={undoChoreCompletion}
                    toggleExpanded={toggleExpanded}
                  />);
  }

  const restorePreview = useMemo(() => {
    try { const data = readTransferData(JSON.parse(importText)); return data && isValidState(data) ? data : null; }
    catch { return null; }
  }, [importText]);

  const choreTitles = new Set(goals.filter((goal) => getGoalSpaceId(goal) === boardSpaceId && goal.category === 'chore').flatMap((goal) => allTasks(goal).map((task) => task.title)));
  const activePerson = people.find((person) => person.id === activePersonId) ?? people[0];
  const recentActivity = activityLog
    .filter((item) => (item.spaceId ?? sharedSpaceId) === boardSpaceId)
    .filter((item) => !isChoresPage || item.action.toLowerCase().includes('chore') || choreTitles.has(item.target) || [...choreTitles].some((title) => item.target.endsWith(' → ' + title)))
    .slice(0, isChoresPage ? 80 : 12);

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
    <main className={`app-shell${isChoresPage ? ' chores-shell' : isListsPage ? ' lists-shell' : ''}`} aria-busy={sync.transitioning}>
      <link rel="preload" as="image" href="/completion-bunny-bubble.svg" />
      {completionBurst > 0 && <CompletionBubbles key={completionBurst} onFinish={clearCompletionBurst} />}
      <fieldset className="sync-transition-guard" disabled={sync.transitioning}>
      <section className="topbar compact-board-header" aria-label="Prehľad tímu">
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
        <div className="header-actions" ref={headerActionsRef}>
          <button type="button" className="header-profile-button" aria-label={`Zmeniť líštičku, aktuálne ${activePerson.name}`} title={`Zmeniť líštičku · ${activePerson.name}`} aria-haspopup="dialog" aria-expanded={profileMenuOpen} aria-controls="header-profile-panel" onClick={() => { setProfileMenuOpen((open) => !open); setSettingsOpen(false); setHeaderError(''); }} style={{ '--profile-tone': activePerson.tone } as React.CSSProperties}>
            <AvatarFox person={activePerson} size="medium" />
          </button>
          <button type="button" className="header-gear-button" aria-label="Nastavenia" title="Nastavenia" aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls="header-settings-panel" onClick={() => { setSettingsOpen((open) => !open); setProfileMenuOpen(false); setHeaderError(''); }}>⚙</button>
          {profileMenuOpen && <section id="header-profile-panel" className="header-popover profile-switch-popover" role="dialog" aria-label="Výber líštičky">
            <div className="header-popover-heading"><h2>{sync.mode === 'profiles' ? 'Zmeniť líštičku' : 'Tvoj profil'}</h2><button type="button" aria-label="Zavrieť výber líštičky" onClick={() => setProfileMenuOpen(false)}>×</button></div>
            <div className="header-profile-list">{people.filter((person) => sync.mode === 'profiles' || person.id === activePersonId).map((person) => <button type="button" key={person.id} disabled={person.id === activePersonId} aria-label={`Zvoliť profil ${person.name}`} onClick={async () => {
              setHeaderError('');
              try { const changed = await sync.chooseProfile(person.id); if (changed) setProfileMenuOpen(false); else setHeaderError('Profil sa zatiaľ neprepol. Rozpracované zmeny sú zachované a ukladanie sa automaticky skúša znova.'); }
              catch (error) { setHeaderError(error instanceof Error ? error.message : 'Profil sa nepodarilo prepnúť.'); }
            }}><AvatarFox person={person} size="medium" /><span>{person.name}</span>{person.id === activePersonId && <small>Aktuálna</small>}</button>)}</div>
            <button type="button" className="header-menu-action" onClick={() => { setProfileMenuOpen(false); setSettingsOpen(true); }}>Upraviť profil</button>
            {headerError && <p role="alert">{headerError}</p>}
          </section>}
          {settingsOpen && <section id="header-settings-panel" className="header-popover header-settings-panel" role="dialog" aria-label="Nastavenia aplikácie">
            <div className="header-popover-heading"><h2>Nastavenia</h2><button type="button" aria-label="Zavrieť nastavenia" onClick={() => setSettingsOpen(false)}>×</button></div>
            <details className="header-setting-group"><summary>Vzhľad a téma</summary><ThemePicker /></details>
            <details className="header-setting-group"><summary>Profil · {activePerson.name}</summary>
              <label className="header-name-field">Meno<EditableInput aria-label={`Meno osoby ${activePerson.name}`} value={activePerson.name} onCommit={(value) => renamePerson(activePersonId, value)} onKeyDown={saveInputOnEnter} /></label>
              <button type="button" className="header-menu-action" aria-expanded={avatarMenuOpen} onClick={() => setAvatarMenuOpen((open) => !open)}>Zmeniť profilovku</button>
              {avatarMenuOpen && <div className="header-avatar-picker" aria-label={`Avatar pre ${activePerson.name}`}>{getAvatarOptionsForPerson(activePersonId).map((avatar) => <button type="button" key={avatar.id} aria-label={avatar.label} aria-pressed={avatar.id === activePerson.avatarId} title={avatar.label} onClick={() => changePersonAvatar(activePersonId, avatar.id)}><Image alt="" height={32} width={32} src={avatar.src} /></button>)}</div>}
            </details>
            <button type="button" className="header-menu-action" onClick={() => void reminders.toggle()}>{reminders.enabled ? 'Vypnúť pripomienky' : 'Zapnúť pripomienky'}</button>
            {reminders.message && <p className="header-permission-note" role="status">{reminders.message}</p>}
            <button type="button" className="header-menu-action" aria-expanded={trashOpen} onClick={() => setTrashOpen((open) => !open)}>Kôš plánov ({trashedGoals.length})</button>
            {trashOpen && <section className="header-trash-panel" aria-label="Kôš plánov">{trashedGoals.length ? trashedGoals.map((goal) => <div key={goal.id} className="header-trash-item"><span>{goal.title}</span><div className="header-trash-actions"><button type="button" onClick={() => restoreGoal(goal.id)}>Obnoviť</button><button type="button" className="trash-delete-button" aria-label={`Odstrániť natrvalo: ${goal.title}`} onClick={() => { setPendingPurgeId(goal.id); setSettingsOpen(false); }}>Odstrániť natrvalo</button></div></div>) : <p>Kôš je prázdny.</p>}</section>}
            <details className="header-setting-group"><summary>Zálohy a obnovenie dát</summary>
              <button type="button" className="header-menu-action" onClick={exportData}>Stiahnuť zálohu</button>
              <button type="button" className="header-menu-action" onClick={() => { openTransferModal(); setSettingsOpen(false); }}>Obnoviť zo súboru</button>
              <button type="button" className="header-menu-action" onClick={() => { setBackupsOpen(true); setSettingsOpen(false); }}>Staršie zálohy</button>
            </details>
            <button type="button" className="header-menu-action" onClick={async () => { try { if (!await sync.logout()) setHeaderError('Zmeny sa ešte neuložili na server. Zostávajú zachované a ukladanie sa automaticky opakuje.'); } catch { setHeaderError('Odhlásenie sa nepodarilo. Zmeny zostávajú zachované.'); } }}>Odhlásiť sa</button>
            {headerError && <p role="alert">{headerError}</p>}
          </section>}
        </div>
      </section>

      {pendingPurgeId && <div className="modal-backdrop" role="presentation"><section className="dialog-card data-modal" role="alertdialog" aria-modal="true" aria-labelledby="purge-title" aria-describedby="purge-description">
        <h2 id="purge-title">Odstrániť položku natrvalo?</h2>
        <p><strong>{trashedGoals.find((task) => task.id === pendingPurgeId)?.title}</strong></p>
        <p id="purge-description">Položka aj všetky jej podúlohy sa odstránia z koša. Obnovenie z koša už nebude možné. Staršie zálohy zostanú zachované.</p>
        <div className="trash-confirm-actions"><button type="button" onClick={() => setPendingPurgeId(null)}>Zrušiť</button><button type="button" className="trash-delete-button" disabled={!trashedGoals.some((task) => task.id === pendingPurgeId)} onClick={() => permanentlyDeleteTask(pendingPurgeId)}>Odstrániť natrvalo</button></div>
      </section></div>}
      {backupsOpen ? <BackupPanel onClose={() => setBackupsOpen(false)} onChoose={(data, label) => {
        openTransferModal(); setBackupsOpen(false); setImportText(JSON.stringify({ version: 1, data })); setImportFileName(label);
      }} /> : null}
      {transferModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-label="Obnovenie zo zálohy"
            aria-modal="true"
            className="dialog-card data-modal"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <span className="label">Zálohy</span>
                <h2>Obnovenie zo zálohy</h2>
              </div>
              <button
                aria-label="Zatvoriť obnovenie zálohy"
                className="icon-button compact"
                onClick={closeTransferModal}
                type="button"
              >
                ×
              </button>
            </div>
            <p>Vyber súbor zálohy z tejto aplikácie. Funguje aktuálna aj staršia záloha.</p>
            <form className="transfer-form" onSubmit={importData}>
              <label>Vybrať súbor zálohy<input type="file" accept=".json,application/json" aria-label="Vybrať súbor zálohy" disabled={readingBackup} onChange={(event) => void chooseBackupFile(event.target.files?.[0])} /></label>
              {readingBackup && <p role="status">Načítavam súbor…</p>}
              {restorePreview && <div className="backup-choice-summary" role="status"><strong>{importFileName || 'Vložená záloha'}</strong><span>{restorePreview.goals.filter((goal) => !goal.deletedAt).length} projektov a cieľov · pripravené na obnovenie</span></div>}
              <details className="backup-manual-input"><summary>Vložiť obsah zálohy ručne</summary><label>Obsah súboru so zálohou<textarea disabled={readingBackup} onChange={(event) => { setImportText(event.target.value); setImportFileName(''); setTransferMessage(''); }} placeholder='{"version":1,"data":{...}}' value={importText} /></label></details>
              <p>Údaje sa zmenia až po potvrdení tlačidlom nižšie. Súčasná verzia zostane v automatických zálohách.</p>
              {transferMessage && <strong className="transfer-message" role="status">{transferMessage}</strong>}
              {!readingBackup && importText.trim() && !restorePreview && <p role="alert">Obsah nie je platná záloha z tejto aplikácie.</p>}
              <button disabled={readingBackup || !restorePreview} type="submit">Obnoviť údaje</button>
            </form>
          </section>
        </div>
      ) : null}

      <nav className="board-section-nav" aria-label="Sekcie tabule">
        <Link href="/chores" aria-current={isChoresPage ? 'page' : undefined}>Chores</Link>
        <Link href="/lists-and-todos" aria-current={isListsPage ? 'page' : undefined}>Lists &amp; todos</Link>
        <Link href="/vztahove-ciele" aria-current={!isChoresPage && !isListsPage ? 'page' : undefined}>Vzťahové ciele</Link>
      </nav>
      <h2 className="board-section-title">{isChoresPage ? 'Chores' : isListsPage ? 'Lists & todos' : 'Vzťahové ciele'}</h2>
      {!isChoresPage && !isListsPage && <section className="board-space-switcher" aria-label="Výber tabule">
        {boardSpaces.map((space) => (
          <button
            aria-pressed={space.id === boardSpaceId}
            className={space.id === boardSpaceId ? 'active' : ''}
            key={space.id}
            onClick={() => {
              setRandomActivityId(null);
              setChoreReveal(null);
              setBoardSpaceId(space.id);
            }}
            type="button"
          >
            {space.label}
          </button>
        ))}
      </section>}

      {isListsPage ? <ListsWorkspace lists={todoLists} onCreate={addTodoList} onAddItem={addTodoItem} onToggle={toggleDone} onRename={renameTask} onColor={changeListColor} onDelete={deleteTask} /> : isChoresPage ? <ChoresWorkspace
        activityLog={activityLog}
        key={boardSpaceId + ':' + activePersonId}
        goals={boardGoals}
        storageKey={'foxies-chores-menu:' + activePersonId + ':' + boardSpaceId}
        canEdit={canEditBoard}
        renderGoal={renderGoalPanel}
        onReveal={setChoreReveal}
        onSplitPantry={(sourceId) => {
          if (!canEditBoard) return;
          const id = createId();
          setGoals((current) => splitPantry(current, sourceId, id, activePersonId));
          addActivity('oddelil(a) oblasť chores', 'Špajza');
        }}
        changes={recentActivity.length ? <RecentActivityPanel activityLog={recentActivity} people={people} /> : <p>Zatiaľ bez zmien.</p>}
        completed={<CompletedWorkPanel completedItems={completedItems} people={people} />}
        addForm={(onCreated) => <form className="new-goal" onSubmit={(event) => { const id = addGoal(event); if (id) onCreated(id); }}>
          <label>Názov oblasti<input required value={newGoalTitle} onChange={(event) => setNewGoalTitle(event.target.value)} placeholder="Napr. Špajza" /></label>
          <label>Poznámka (voliteľná)<input value={newGoalDescription} onChange={(event) => setNewGoalDescription(event.target.value)} /></label>
          <button type="submit">Pridať oblasť</button>
        </form>}
      /> : <RelationshipWorkspace key={boardSpaceId}
        goals={rankedActiveGoals} canEdit={canEditBoard}
        rules={collectRules(activeGoals, boardSpaceId)}
        onAddRule={(text) => { const rule = createRule(createId(), text, activePersonId, boardSpaceId); if (!rule || !canEditBoard) return; setGoals((current) => [...current, rule]); addActivity('pridal(a) pravidlo', rule.title); }}
        onRenameRule={renameTask} onDeleteRule={deleteTask}
        renderGoal={renderGoalPanel}
        overview={<><ProjectProgressStrip key={boardSpaceId + '-plans-' + goalSnapshots.filter((goal) => !goal.isChore).map((goal) => goal.id).join(',')} subtitle={[...new Set(goalSnapshots.filter((goal) => !goal.isChore).map((goal) => goal.categoryLabel))].join(' · ') || getCategoryLabel('plan', boardSpaceId)} goals={goalSnapshots.filter((goal) => !goal.isChore)} people={people} />{boardSpaceId === sharedSpaceId && satisfactionSchedule(choreDay).isOpen ? <p className="satisfaction-day-note">Dnes pripomíname spokojnosť. V téme otvor tlačidlo Spokojnosť; odpovedať môžeš aj inokedy.</p> : null}</>}
        gratitude={<GratitudePanel entries={gratitudeEntries} people={people} activePersonId={activePersonId} onSave={(day, text) => {
            if (day !== gratitudeDay()) return;
            const entry = { id: activePersonId + ':' + day, personId: activePersonId, day, text };
            setGratitudeEntries((current) => [...current.filter((item) => item.id !== entry.id), entry]);
          }} />}
        activities={<ActivityWheelPanel key={boardSpaceId + activePersonId}
        activitiesOpen={activitiesOpen}
        activities={activityGoals}
        onToggleActivities={() => setActivitiesOpen((open) => !open)}
        onPickRandom={pickRandomActivity}
        selectedActivity={randomActivity}
      />}
        poll={<PriorityPoll
        onRefreshOrder={() => setPriorityRefreshKey((key) => key + 1)}
        boardSpaceId={boardSpaceId}
        people={people}
        refreshKey={priorityRefreshKey}
        rankedGoals={rankedActiveGoals}
      />}
        calendar={recurringGoals.some((goal) => normalizeGoalCategory(goal.category) !== 'chore') ? <>      <fieldset disabled={!canEditBoard} className="board-edit-controls">
        {recurringGoals.some((goal) => normalizeGoalCategory(goal.category) !== 'chore') ? <RecurringCalendarPanel
        boardSpaceId={boardSpaceId}
        goals={recurringGoals.filter((goal) => normalizeGoalCategory(goal.category) !== 'chore')}
        onChangeRecurrence={changeGoalRecurrence}
        onChangeRecurrenceStart={changeGoalRecurrenceStart}
        onChangeRecurrenceTolerance={changeGoalRecurrenceTolerance}
        onCompleteToday={completeRecurringGoalToday}
      /> : null}
      </fieldset></> : null}
        changes={<><RecentActivityPanel activityLog={recentActivity} people={people} /><CompletedWorkPanel completedItems={completedItems} people={people} /></>}
        addForm={(onCreated) => <fieldset disabled={!canEditBoard} className="board-edit-controls"><form className="new-goal" onSubmit={(event) => { const id = addGoal(event); if (id) onCreated(id, creationCategory); }}>
          <label>
            Nová téma v tabuľke {boardSpaceLabel}
            <input
              onChange={(event) => setNewGoalTitle(event.target.value)}
              placeholder={isChoresPage ? 'Napr. Kuchyňa alebo Pranie' : 'Napr. spoločný čas'}
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
          {!isChoresPage && <label>
            Kategória
            <select
              onChange={(event) => setNewGoalCategory(event.target.value as GoalCategory)}
              value={creationCategory}
            >
              {enabledGoalCategories.filter((category) => category.id !== 'chore').map((category) => (
                <option key={category.id} value={category.id}>
                  {getCategoryLabel(category.id, boardSpaceId)}
                </option>
              ))}
            </select>
          </label>}
          <button type="submit">Pridať tému</button>
        </form></fieldset>}
      />}
      </fieldset>
    </main>
  );
}

function downloadJson(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function AuthGate({ onAuthenticate, onChooseProfile, mode, people, status }: {
  onAuthenticate: (email: string, password: string) => Promise<void>;
  onChooseProfile: (personId: string) => Promise<void | boolean>;
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
        <ol className="completed-list" tabIndex={0} aria-label="Hotové veci – posúvateľný zoznam">
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
    .filter((category) => category.id !== 'activity' && category.id !== 'chore')
    .map((category) => ({
      ...category,
      goals: rankedGoals.filter((goal) => normalizeGoalCategory(goal.category) === category.id),
    }))
    .filter((category) => category.goals.length > 0);

  if (!groupedGoals.length) return null;

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
  people = [],
}: {
  goals: Array<{ id: string; title: string; done: number; total: number; percent: number; satisfaction?: Goal }>;
  heading?: string;
  subtitle?: string;
  people?: Person[];
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
                {goal.satisfaction ? null : <strong>{goal.percent}% · {goal.done}/{goal.total}</strong>}
              </div>
              {goal.satisfaction ? <SatisfactionSummary goal={goal.satisfaction} people={people} /> : <div className="meter mini" aria-hidden="true"><span style={{ width: goal.percent + '%' }} /></div>}
            </div>
          ))}
        </div>
      ) : <p>Prvý plán si nájde miesto hneď tu.</p>}
    </div>
  );
}

type GoalPanelProps = {
  workspace?: boolean;
  focusGoal?: boolean;
  editMode?: boolean;
  onSaveResource: (goalId: string, resource: ProjectResource) => void;
  onRemoveResource: (goalId: string, resourceId: string) => void;
  choreSelection?: { selectedIds: string[]; onToggle: (id: string) => void };
  revealChore?: ChoreReveal | null;
  activePersonId: string;
  boardSpaceId: BoardSpaceId;
  goal: Goal;
  onAddSubtask: (parentId: string, title: string, dueAt?: string, kind?: TaskKind, choreCadence?: ChoreCadence, choreWeight?: ChoreWeight, choreIntervalDays?: number) => void;
  onChangeCategory: (goalId: string, category: GoalCategory) => void;
  onChangeRecurrence: (goalId: string, recurrenceDays: number) => void;
  onChangeTaskKind: (taskId: string, kind: TaskKind) => void;
  onChangeChoreCadence: (taskId: string, cadence: ChoreCadence) => void;
  onChangeChoreWeight: (taskId: string, weight: ChoreWeight) => void;
  onChangeChoreInterval: (taskId: string, value: string) => void;
  onChangeDeadline: (taskId: string, value: string) => void;
  onCompleteRecurring: (goalId: string) => void;
  onDelete: (taskId: string) => void;
  onRateFeasibility: (goalId: string, personId: string, feasibility: number) => void;
  onRateImportance: (goalId: string, personId: string, importance: number) => void;
  onRateSatisfaction: (goalId: string, score: number | null) => void;
  onRename: (taskId: string, title: string) => void;
  onRenameDescription: (goalId: string, description: string) => void;
  people: Person[];
  toggleDone: (taskId: string) => void;
  undoChoreCompletion: (taskId: string, completionId: string) => void;
  toggleExpanded: (taskId: string) => void;
};

function GoalPanel(props: GoalPanelProps) {
  const [areaSettingsOpen, setAreaSettingsOpen] = useState(false);
  const [satisfactionOpen, setSatisfactionOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedRoots = selectedTrashRoots(props.goal, selectedIds);
  const choreSelection = props.workspace && areaSettingsOpen ? {
    selectedIds,
    onToggle: (id: string) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]),
  } : undefined;
  const [manuallyExpanded, setExpanded] = useState(false);
  const [dismissedReveal, setDismissedReveal] = useState<ChoreReveal | null>(null);
  const expanded = props.focusGoal || props.workspace || manuallyExpanded || Boolean(props.revealChore && props.revealChore !== dismissedReveal && props.revealChore.path.includes(props.goal.id));
  const [descriptionChunks, setDescriptionChunks] = useState<string[]>([]);
  const progress = calculateProgress(props.goal);
  const feasibilityByPerson = normalizeGoalFeasibility(props.goal, props.people);
  const importanceByPerson = normalizeGoalImportance(props.goal, props.people);
  const category = normalizeGoalCategory(props.goal.category);
  const isRelationship = props.boardSpaceId === sharedSpaceId && category === 'plan';
  const isRecurring = category !== 'chore' && recurringCategoryIds.includes(category);
  const occasionalProgress = calculateChoreProgress(props.goal.children, 'occasional');
  const choreHistory = choreHistorySummary(props.goal.children.length ? props.goal.children : [props.goal]);
  const isCompletable = isCompletableTask(props.goal);
  const suggestedDescriptionChunks = useMemo(
    () => splitLongDescription(props.goal.description),
    [props.goal.description],
  );

  function addDescriptionChunksAsSubtasks() {
    descriptionChunks.forEach((chunk) => props.onAddSubtask(props.goal.id, chunk));
    setDescriptionChunks([]);
  }

  if (props.boardSpaceId !== sharedSpaceId && props.boardSpaceId !== props.activePersonId) return <ReadOnlyGoal goal={props.goal} people={props.people} open={props.focusGoal} />;

  if (props.focusGoal) return <article className="simple-relationship-goal">
    <header className="simple-goal-heading">
      <div><span className="label">{props.boardSpaceId === sharedSpaceId ? 'Vzťahová téma' : 'Osobný projekt'}</span><h2>{props.goal.title}</h2></div>
      <div className="simple-goal-actions">
      {isRelationship && <button type="button" className="satisfaction-toggle" aria-expanded={satisfactionOpen} aria-controls={`satisfaction-${props.goal.id}`} onClick={() => setSatisfactionOpen((open) => !open)}>Spokojnosť{!satisfactionOpen && satisfactionSchedule().isOpen && props.goal.satisfactionAnsweredOnByPerson?.[props.activePersonId] !== gratitudeDay() ? <span className="satisfaction-reminder-dot" aria-hidden="true">•</span> : null}</button>}
      <button type="button" className="simple-goal-edit" aria-expanded={areaSettingsOpen} onClick={() => setAreaSettingsOpen((open) => !open)}>{areaSettingsOpen ? 'Hotovo' : 'Upraviť tému'}</button>
      </div>
    </header>
    {areaSettingsOpen ? <section className="simple-goal-settings" aria-label="Úprava témy">
      <label>Názov<EditableInput aria-label="Názov cieľa" value={props.goal.title} onCommit={(value) => props.onRename(props.goal.id, value)} onKeyDown={saveInputOnEnter} /></label>
      <label>Poznámka<EditableInput aria-label="Poznámka k cieľu" value={props.goal.description} onCommit={(value) => props.onRenameDescription(props.goal.id, value)} onKeyDown={saveInputOnEnter} /></label>
      <details><summary>Ďalšie možnosti</summary><label>Termín (voliteľný)<input aria-label="Termín plánu" type="datetime-local" value={deadlineInput(props.goal.dueAt)} onChange={(event) => props.onChangeDeadline(props.goal.id, event.target.value)} /></label>
        <ItemMeta createdById={props.goal.ownerId} people={props.people} updatedById={props.goal.updatedById} />
        <button type="button" className="simple-trash" onClick={() => { if (window.confirm('Presunúť túto tému aj s položkami do koša?')) props.onDelete(props.goal.id); }}>Presunúť tému do koša</button>
      </details>
    </section> : props.goal.description.trim() ? <p className="simple-goal-note">{props.goal.description}</p> : null}
    {isRelationship && satisfactionOpen && <div id={`satisfaction-${props.goal.id}`} className="satisfaction-disclosure" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setSatisfactionOpen(false); } }}>
      <SatisfactionPoll goal={props.goal} people={props.people} activePersonId={props.activePersonId} onRate={props.onRateSatisfaction} />
      <button type="button" className="satisfaction-close" onClick={() => setSatisfactionOpen(false)}>Zavrieť spokojnosť</button>
    </div>}
    <section className="simple-goal-items" aria-label="Pravidlá a kroky témy">
      <div className="simple-items-heading"><h3>Pravidlá a kroky</h3><span>{props.goal.children.length}</span></div>
      {props.goal.children.length ? <TaskList {...props} editMode={areaSettingsOpen} tasks={props.goal.children} parentId={props.goal.id} depth={1} /> : <p className="empty-board">Pridaj dohodu, pravidlo alebo konkrétny krok.</p>}
      {areaSettingsOpen && <details className="simple-add-item"><summary>＋ Pridať položku</summary><RelationshipItemForm onSubmit={(title, kind) => props.onAddSubtask(props.goal.id, title, undefined, kind)} /></details>}
    </section>
    <ProjectResources goalId={props.goal.id} resources={props.goal.resources} editMode={areaSettingsOpen} personId={props.activePersonId} onSave={(resource) => props.onSaveResource(props.goal.id, resource)} onRemove={(id) => props.onRemoveResource(props.goal.id, id)} />
    <details className="simple-goal-ratings"><summary>Hodnotenie a priority</summary>
      {isRelationship && <SatisfactionSummary goal={props.goal} people={props.people} />}
      <ImportancePanel activePersonId={props.activePersonId} feasibilityByPerson={feasibilityByPerson} goalId={props.goal.id} importanceByPerson={importanceByPerson} onRateFeasibility={props.onRateFeasibility} onRateImportance={props.onRateImportance} people={props.people} />
    </details>
  </article>;

  return (
    <article className={`goal-panel${expanded ? '' : ' goal-panel-collapsed'}${props.workspace ? ' workspace-goal' : ''}${props.focusGoal ? ' relationship-goal' : ''}${areaSettingsOpen ? ' area-settings-open' : ''}`}>
      <div className="goal-header">
        {!props.workspace && !props.focusGoal && <button
          aria-label={expanded ? 'Zbaliť cieľ' : 'Rozbaliť cieľ'}
          aria-expanded={expanded}
          title={expanded ? 'Zbaliť cieľ' : 'Rozbaliť cieľ'}
          className="icon-button"
          onClick={() => { setExpanded(!expanded); setDismissedReveal(props.revealChore ?? null); }}
          type="button"
        >
          {expanded ? '▾' : '▸'}
        </button>}
        <div className="goal-title-block">
          {props.workspace && !areaSettingsOpen ? <h2 className="chore-area-title">{props.goal.title}</h2> : <EditableInput
            aria-label="Názov cieľa"
            className="title-input"
            value={props.goal.title}
            onCommit={(value) => props.onRename(props.goal.id, value)}
            onKeyDown={saveInputOnEnter}
            title="Klikni a uprav názov"
          />}
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
        {props.workspace && <button type="button" className="area-settings-toggle" aria-expanded={areaSettingsOpen} onClick={() => { setAreaSettingsOpen((open) => !open); setSelectedIds([]); }}>{areaSettingsOpen ? 'Dokončiť úpravy' : 'Upraviť oblasť'}</button>}
        {!(props.workspace && category === 'chore') && <div className={isRelationship ? 'relationship-summary-badge' : 'progress-badge'}>
          {isRelationship ? <SatisfactionSummary goal={props.goal} people={props.people} /> : <>
          {category === 'chore' ? <><span>za posledných 7 dní · {progress.done}/{progress.total} prác</span>
            <span>{occasionalProgress.total ? `Občasné: ${occasionalProgress.total} prác` : 'Občasné: žiadne položky'}</span>
            {occasionalProgress.total ? <span>podľa nastavených intervalov</span> : null}
            {choreHistory.lastCompletedAt ? <span>Naposledy: {new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', dateStyle: 'medium' }).format(new Date(choreHistory.lastCompletedAt))}</span> : null}
            {choreHistory.undatedCount ? <span title="Staršie označenia bez uloženého dátumu sa nezapočítavajú do posledných 7 dní">Bez dátumu: {choreHistory.undatedCount}</span> : null}
          </> : <strong>{progress.percent}%</strong>}
          {category !== 'chore' ? <span>{progress.done}/{progress.total}</span> : null}
          </>}
        </div>}
        {expanded && !props.workspace ? <button
          aria-label="Presunúť plán do koša"
          className="icon-button danger"
          onClick={() => props.onDelete(props.goal.id)}
          type="button"
        >
          ×
        </button> : null}
      </div>

      {expanded ? <>
      {!props.workspace && <div className="goal-meta">
        {category !== 'chore' ? <label className="deadline-field">Termín
          <input aria-label="Termín plánu" type="datetime-local" value={deadlineInput(props.goal.dueAt)} onChange={(event) => props.onChangeDeadline(props.goal.id, event.target.value)} />
        </label> : null}
        {isCompletable && !isRelationship && category !== 'chore' ? (
          <label className="check-row">
            <input
              checked={props.goal.done}
              onChange={() => props.toggleDone(props.goal.id)}
              type="checkbox"
            />
            Plán označený ako hotový
          </label>
        ) : (
          <span className="non-checkable-note">{isRelationship ? 'Téma alebo dohoda bez percentuálneho dokončenia' : category === 'chore' ? 'Priebežná starostlivosť · označuj jednotlivé práce' : 'Bez checkboxu'}</span>
        )}
        <ItemMeta
          createdById={props.goal.ownerId}
          people={props.people}
          updatedById={props.goal.updatedById}
        />
        {category !== 'chore' && <label className="category-select kind-select">
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
        }
        {!props.workspace && <label className="category-select">
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
        </label>}
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
      </div>}

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

      {isRelationship ? <SatisfactionPoll goal={props.goal} people={props.people} activePersonId={props.activePersonId} onRate={props.onRateSatisfaction} /> : category !== 'chore' ? <div className="meter slim" aria-hidden="true">
        <span style={{ width: `${progress.percent}%` }} />
      </div> : null}

      {category !== 'chore' ? <ImportancePanel
        activePersonId={props.activePersonId}
        feasibilityByPerson={feasibilityByPerson}
        goalId={props.goal.id}
        importanceByPerson={importanceByPerson}
        onRateFeasibility={props.onRateFeasibility}
        onRateImportance={props.onRateImportance}
        people={props.people}
      /> : null}

        <div className="children-list">
          {props.workspace && <>
            {areaSettingsOpen && <details className="workspace-add-task" open><summary>+ Pridať prácu</summary><AddTaskForm chore showDeadline={false} label="Názov novej práce" onSubmit={(title, dueAt, settings) => props.onAddSubtask(props.goal.id, title, dueAt, 'todo', settings?.cadence, settings?.weight, settings?.intervalDays)} /></details>}
            {choreSelection && <div className="chore-selection-toolbar" role="group" aria-label="Výber položiek na presunutie do koša">
              <label><input type="checkbox" checked={selectedIds.includes(props.goal.id)} onChange={() => choreSelection.onToggle(props.goal.id)} />Vybrať celú oblasť aj s prácami</label>
              <span>{selectedRoots.length ? `Vybrané: ${selectedRoots.length}` : 'Vyber práce pomocou štvorčekov pri ich názvoch.'}</span>
              <button type="button" disabled={!selectedRoots.length} onClick={() => { selectedRoots.forEach(props.onDelete); setSelectedIds([]); }}>Presunúť vybrané do koša</button>
            </div>}
          </>}
          <TaskList {...props} editMode={areaSettingsOpen} choreSelection={choreSelection} tasks={props.goal.children} parentId={props.goal.id} depth={1} />
          {!props.workspace && (
          <AddTaskForm
            label="Pridať podúlohu k cieľu"
            onSubmit={(title, dueAt) => props.onAddSubtask(props.goal.id, title, dueAt)}
          />
          )}
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

function ReadOnlyTasks({ tasks, isChore = false }: { tasks: Task[]; isChore?: boolean }) {
  return <div className="nested">{tasks.map((task) => <div className="task-branch" key={task.id}>
    <details>
      <summary className="task-row readonly-task-row"><span aria-hidden="true">{(isChore ? choreElapsedDays(task) === 0 : task.done) ? '✓' : '•'}</span><span>{isChore && choreAttention(task) ? <ChoreAttentionBadge reason={choreAttention(task)!} cadence={task.choreCadence} /> : null} {task.title}</span></summary>
      {task.children.length ? <ReadOnlyTasks tasks={task.children} isChore={isChore} /> : null}
    </details>
  </div>)}</div>;
}
function ReadOnlyGoal({ goal, people, open }: { goal: Goal; people: Person[]; open?: boolean }) {
  const progress = calculateProgress(goal);
  return <article className="goal-panel readonly-goal"><details open={open}>
    <summary><h3>{goal.title}</h3><span>{normalizeGoalCategory(goal.category) === 'chore' ? 'Priebežná starostlivosť' : `${progress.percent}%`}</span></summary>
    <p>{goal.description}</p>
    {normalizeGoalCategory(goal.category) !== 'chore' ? <p>{people.map((person) => person.name + ': dôležitosť ' + (goal.importanceByPerson[person.id] ?? 2) + '/5 · reálnosť ' + (goal.feasibilityByPerson?.[person.id] ?? 3) + '/5').join(' · ')}</p> : null}
    <ProjectResources goalId={goal.id} resources={goal.resources} />
    <ReadOnlyTasks tasks={goal.children} isChore={normalizeGoalCategory(goal.category) === 'chore'} />
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
      <div className="chore-group-heading"><h3>{cadence === 'routine' ? 'Bežné chores' : 'Občasné chores'}</h3>
        {props.workspace ? <details className="chore-group-details"><summary aria-label={cadence === 'routine' ? 'Prehľad bežných chores' : 'Prehľad občasných chores'} title="Prehľad skupiny">ⓘ</summary><p>{cadence === 'routine' ? 'Posledných 7 dní · podľa potreby' : 'Raz za dlhší čas'}</p><p>{progress.total ? cadence === 'routine' ? `${progress.doneWeight}/${progress.totalWeight} bodov · ${progress.done}/${progress.total} prác` : `${progress.total} prác · podľa intervalov` : 'Zatiaľ bez prác'}</p></details> : <><span>{cadence === 'routine' ? 'Posledných 7 dní · podľa potreby' : 'Raz za dlhší čas'}</span><strong>{progress.total ? cadence === 'routine' ? `${progress.doneWeight}/${progress.totalWeight} bodov · ${progress.done}/${progress.total} prác` : `${progress.total} prác · podľa intervalov` : '—'}</strong></>}
      </div>
      {tasks.length ? renderTasks(tasks) : <p className="chore-group-empty">{cadence === 'routine' ? 'Podúlohu sem zaradíš výberom „Bežné“ v jej riadku.' : 'Podúlohu sem zaradíš výberom „Občasné“ v jej riadku.'}</p>}
    </section>;
  })}</>;
}

function ChoreAttentionBadge({ reason, cadence = 'routine' }: { reason: string; cadence?: ChoreCadence }) {
  const routine = cadence === 'routine';
  return <span className={`chore-attention${routine ? ' chore-reminder' : ''}`} role="img" aria-label={reason} title={reason}>{routine ? '↻' : '!'}</span>;
}

function TaskRow(props: TaskRowProps) {
  const compact = props.workspace || props.focusGoal;
  const [settingsRequested, setTaskSettingsOpen] = useState(false);
  const editAllowed = !compact || Boolean(props.editMode);
  const taskSettingsOpen = editAllowed && settingsRequested;
  const [adding, setAdding] = useState(false);
  const [manuallyExpanded, setExpanded] = useState(false);
  const [dismissedReveal, setDismissedReveal] = useState<ChoreReveal | null>(null);
  const expanded = manuallyExpanded || Boolean(props.revealChore && props.revealChore !== dismissedReveal && props.revealChore.path.includes(props.task.id));
  const [splitDraft, setSplitDraft] = useState<string | null>(null);
  const titleChunks = (splitDraft ?? '').split('\n').map((chunk) => chunk.trim()).filter(Boolean);
  const isChore = normalizeGoalCategory(props.goal.category) === 'chore';
  const attention = isChore ? choreAttention(props.task) : undefined;
  const doneToday = isChore && choreElapsedDays(props.task) === 0;
  const completions = (props.task.choreCompletions ?? []).filter((entry) => !entry.undoneAt).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const [undoClock, setUndoClock] = useState(() => Date.now());
  const recentUndo = isChore ? quickUndoCompletion(props.task, props.activePersonId, undoClock) : undefined;
  const quickUndoUntil = completions[0] ? Date.parse(completions[0].completedAt) + choreQuickUndoMs : 0;
  const latestCompletionId = completions[0]?.id;
  useEffect(() => {
    if (!isChore) return;
    const refresh = () => setUndoClock(Date.now());
    const immediate = window.setTimeout(refresh, 0);
    const timer = quickUndoUntil > Date.now() ? window.setTimeout(refresh, quickUndoUntil - Date.now() + 20) : undefined;
    return () => { window.clearTimeout(immediate); if (timer !== undefined) window.clearTimeout(timer); };
  }, [isChore, quickUndoUntil, latestCompletionId]);
  const completedLabel = (value: string) => new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  const hasChildren = props.task.children.length > 0;
  const isCompletable = isCompletableTask(props.task);
  const suggestedTitleChunks = useMemo(
    () => splitLongDescription(props.task.title),
    [props.task.title],
  );

  function closeTaskSettings() {
    setTaskSettingsOpen(false);
    setAdding(false);
    setSplitDraft(null);
  }

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
    <div id={`task-${props.task.id}`} tabIndex={-1} className="task-branch" style={{ '--depth': props.depth } as React.CSSProperties} onKeyDown={(event) => {
      if (compact && taskSettingsOpen && event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); closeTaskSettings();
      }
    }}>
      <div className={[
        'task-row',
        props.focusGoal ? 'relationship-task' : '',
        compact ? 'workspace-task' : '',
        compact && !hasChildren ? 'workspace-task-leaf' : '',
        props.choreSelection ? 'workspace-task-selecting' : '',
        taskSettingsOpen ? 'task-settings-open' : '',
        (isChore ? doneToday : props.task.done) ? 'done' : '',
        isCompletable ? '' : 'no-checkbox',
      ].filter(Boolean).join(' ')}>
        {props.choreSelection && <input className="chore-select-checkbox" type="checkbox" aria-label={`Vybrať na presunutie do koša: ${props.task.title}`} checked={props.choreSelection.selectedIds.includes(props.task.id)} onChange={() => props.choreSelection?.onToggle(props.task.id)} />}
        {(!compact || hasChildren) && <button
          aria-label={hasChildren ? (expanded ? 'Skryť vnorené podúlohy' : 'Zobraziť vnorené podúlohy') : 'Bez vnorených podúloh'}
          aria-expanded={hasChildren ? expanded : undefined}
          title={hasChildren ? `${expanded ? 'Skryť' : 'Zobraziť'} vnorené podúlohy (${props.task.children.length})` : 'Bez vnorených podúloh'}
          className={`icon-button compact${hasChildren && !expanded ? ' has-hidden-subtasks' : ''}`}
          disabled={!hasChildren}
          onClick={() => { setExpanded(!expanded); setDismissedReveal(props.revealChore ?? null); }}
          type="button"
        >
          <span aria-hidden="true">{hasChildren ? (expanded ? '▾' : '▸') : '•'}</span>
        </button>}
        {isCompletable && isChore ? (
          <button type="button" className={`chore-complete-button${doneToday ? ' completed-today' : ''}`} aria-label={recentUndo ? 'Zrušiť posledné vykonanie podúlohy' : 'Zaznamenať vykonanie podúlohy'} title={recentUndo ? 'Kliknutím zrušíš posledné označenie (do 30 sekúnd)' : doneToday ? 'Dnes už vykonané — kliknutím zaznamenáš ďalšie vykonanie' : 'Vykonané teraz — môžeš označiť opakovane'} onClick={() => props.toggleDone(props.task.id)}><span aria-hidden="true">✓</span></button>
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
        <span className={`task-title-tooltip-wrap${attention ? ' has-chore-attention' : ''}`}>
          {attention ? <ChoreAttentionBadge reason={attention} cadence={props.task.choreCadence} /> : null}
          {compact && !editAllowed ? <span className="relationship-task-copy task-read-copy">{!isCompletable && <span className="relationship-kind">{props.task.kind === 'rule' ? 'Pravidlo' : 'Téma'}</span>}{props.task.title}</span> : <EditableInput
            aria-label="Názov podúlohy"
            className="task-title"
            value={props.task.title}
            onCommit={(value) => props.onRename(props.task.id, value)}
            onKeyDown={saveInputOnEnter}
            title="Klikni a uprav podúlohu"
          />}
          {props.task.title.trim() && editAllowed ? (
            <span className="task-title-tooltip" role="tooltip">
              {props.task.title}
            </span>
          ) : null}
        </span>
        {recentUndo && !editAllowed && <button type="button" className="chore-quick-undo" aria-label={`Zrušiť posledné vykonanie: ${props.task.title}`} title="Zrušiť posledné označenie · dostupné 30 sekúnd" onClick={() => props.undoChoreCompletion(props.task.id, recentUndo.id)}>↶ Späť</button>}
        {compact && editAllowed && <button type="button" className="task-settings-toggle" aria-label={`${taskSettingsOpen ? 'Zavrieť úpravy položky' : 'Upraviť položku'}: ${props.task.title}`} aria-expanded={taskSettingsOpen} title={taskSettingsOpen ? 'Dokončiť úpravy a zbaliť detaily' : 'Detaily a nastavenia práce'} onClick={() => taskSettingsOpen ? closeTaskSettings() : setTaskSettingsOpen(true)}>{taskSettingsOpen ? 'Hotovo' : <span aria-hidden="true">⋯</span>}</button>}
        {(!compact || taskSettingsOpen) && <div className="task-actions">
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
        {!isChore && <label className="task-kind-select">
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
        }
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
          <label className="chore-interval-field">Opakovať každých
            <EditableInput aria-label="Interval občasnej práce v dňoch" type="number" min={1} max={3650} step={1} value={String(getChoreIntervalDays(props.task))} onCommit={(value) => props.onChangeChoreInterval(props.task.id, value)} onKeyDown={saveInputOnEnter} /> dní
          </label>
        ) : null}
        {isChore && isCompletable ? <div className="chore-completion-info">
          <span className="chore-elapsed" title={completions[0] ? `Naposledy: ${completedLabel(completions[0].completedAt)}` : undefined}>{choreElapsedLabel(props.task)}</span>
          {completions.length ? <details className="chore-completion-history"><summary>História vykonaní ({completions.length})</summary>
            <ol>{completions.map((entry) => <li key={entry.id}>
              <time dateTime={entry.completedAt}>{new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.completedAt))}</time>
              <span>{props.people.find((person) => person.id === entry.personId)?.name}</span>
              {entry.personId === props.activePersonId ? <button type="button" onClick={() => props.undoChoreCompletion(props.task.id, entry.id)} title="Zrušiť omylom zaznamenané vykonanie">Zrušiť vykonanie</button> : null}
            </li>)}</ol>
            <p>Uchováva sa posledných 200 záznamov.</p>
          </details> : null}
        </div> : null}
        {props.focusGoal && <button type="button" className="simple-trash" onClick={() => { if (window.confirm('Presunúť túto položku aj s podúlohami do koša?')) props.onDelete(props.task.id); }}>Do koša</button>}
        <ItemMeta
          createdById={props.task.ownerId}
          people={props.people}
          updatedById={props.task.updatedById}
        />
        </div>}
        {!compact && <button
          aria-label="Presunúť podúlohu do koša"
          className="icon-button compact danger"
          onClick={() => props.onDelete(props.task.id)}
          type="button"
        >
          ×
        </button>}
      </div>

      {editAllowed && splitDraft !== null ? (
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

      {editAllowed && adding ? props.focusGoal ? <RelationshipItemForm onSubmit={(title, kind) => { props.onAddSubtask(props.task.id, title, undefined, kind); setExpanded(true); setAdding(false); }} /> : (
        <AddTaskForm
          showDeadline={!isChore}
          chore={isChore}
          initialChoreCadence={props.task.choreCadence}
          label="Názov ďalšej podúlohy"
          onSubmit={(title, dueAt, settings) => {
            props.onAddSubtask(props.task.id, title, dueAt, 'todo', settings?.cadence, settings?.weight, settings?.intervalDays);
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

function RelationshipItemForm({ onSubmit }: { onSubmit: (title: string, kind: TaskKind) => void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TaskKind>('todo');
  return <form className="relationship-item-form" onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onSubmit(title.trim(), kind); setTitle(''); }}>
    <label>Text položky<textarea required maxLength={4000} rows={2} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Čo chceme urobiť alebo na čom sa dohodnúť…" /></label>
    <div><label>Typ<select value={kind} onChange={(event) => setKind(event.target.value as TaskKind)}>{taskKinds.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><button type="submit" disabled={!title.trim()}>Pridať</button></div>
  </form>;
}

function AddTaskForm({
  label,
  onSubmit,
  showDeadline = true,
  chore = false,
  initialChoreCadence = 'routine',
}: {
  label: string;
  showDeadline?: boolean;
  chore?: boolean;
  initialChoreCadence?: ChoreCadence;
  onSubmit: (title: string, dueAt?: string, settings?: { cadence: ChoreCadence; weight: ChoreWeight; intervalDays?: number }) => void;
}) {
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [cadence, setCadence] = useState<ChoreCadence>(initialChoreCadence);
  const [weight, setWeight] = useState<ChoreWeight>(1);
  const [intervalDays, setIntervalDays] = useState('30');
  const interval = Number(intervalDays);
  const validInterval = !chore || cadence !== 'occasional' || (Number.isInteger(interval) && interval >= 1 && interval <= 3650);

  return (
    <form
      className={`add-task${showDeadline ? '' : ' add-task-no-deadline'}${chore ? ' add-chore-form' : ''}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim() || !validInterval) return;
        onSubmit(title, showDeadline ? dueAt || undefined : undefined, chore ? {
          cadence, weight, intervalDays: cadence === 'occasional' ? interval : undefined,
        } : undefined);
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
      {showDeadline && <label>Termín (voliteľný)
        <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
      </label>}
      {chore && <div className="new-chore-parameters">
        <label>Častosť<select value={cadence} onChange={(event) => setCadence(event.target.value as ChoreCadence)}><option value="routine">Bežná</option><option value="occasional">Občasná</option></select></label>
        <label>Náročnosť<select value={weight} onChange={(event) => setWeight(Number(event.target.value) as ChoreWeight)}><option value={1}>Drobná (1)</option><option value={3}>Stredná (3)</option><option value={5}>Veľká (5)</option></select></label>
        {cadence === 'occasional' && <label>Opakovať každých (dní)<input type="number" min={1} max={3650} step={1} required value={intervalDays} onChange={(event) => setIntervalDays(event.target.value)} /></label>}
      </div>}
      <button type="submit" disabled={chore && (!title.trim() || !validInterval)}>Pridať</button>
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
