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
  description: string;
  deletedAt?: string;
};

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

type AppStateData = {
  activePersonId: string;
  activityLog: ActivityItem[];
  authRecords: Record<string, AuthRecord>;
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
    id: 'lavender',
    label: 'Fialová líštička',
    src: '/avatar-lavender.png',
    tone: '#a98dff',
  },
  {
    id: 'mint-leaf',
    label: 'Mätová líštička s lístkom',
    src: '/avatar-mint-leaf.png',
    tone: '#35d0ba',
  },
  {
    id: 'golden',
    label: 'Žltá líštička',
    src: '/avatar-golden.png',
    tone: '#f4b942',
  },
  {
    id: 'mint',
    label: 'Mätová líštička',
    src: '/avatar-mint.png',
    tone: '#58dcca',
  },
  {
    id: 'cyan-flower',
    label: 'Cyan líštička s kvietkom',
    src: '/avatar-cyan-flower.png',
    tone: '#43c7d5',
  },
  {
    id: 'blue',
    label: 'Modrá líštička',
    src: '/avatar-blue.png',
    tone: '#6c9fff',
  },
  {
    id: 'silver',
    label: 'Sivá líštička',
    src: '/avatar-silver.png',
    tone: '#9ca8bd',
  },
  {
    id: 'orange',
    label: 'Oranžová líštička',
    src: '/avatar-orange.png',
    tone: '#ff9d4a',
  },
  {
    id: 'pink-bow',
    label: 'Ružová líštička s mašľou',
    src: '/avatar-pink-bow.png',
    tone: '#ff7eb6',
  },
  {
    id: 'midnight-moon',
    label: 'Nočná líštička s mesiacom',
    src: '/avatar-midnight-moon.png',
    tone: '#6763dd',
  },
];

const defaultPeople: Person[] = [
  { id: 'person-1', name: 'Rini', tone: '#43c7d5', avatarId: 'cyan-flower' },
  { id: 'person-2', name: 'Fluffy', tone: '#a98dff', avatarId: 'lavender' },
];

const authRecordsKey = 'ciele-auth-records';
const sessionPersonKey = 'ciele-session-person';

const starterGoals: Goal[] = [
  {
    id: 'goal-launch',
    title: 'Naplánovať spoločný víkend',
    description: 'Malý spoločný cieľ s výletom, oddychom a dobrým jedlom.',
    ownerId: 'person-1',
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
    description: 'Veci, ktoré spravia spoločný priestor krajší a pokojnejší.',
    ownerId: 'person-2',
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

function flattenChildren(task: Task): Task[] {
  return task.children.flatMap((child) => [child, ...flattenChildren(child)]);
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
    const savedAvatar = avatarOptions.find((avatar) => avatar.id === savedPerson?.avatarId);
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
  const [authenticated, setAuthenticated] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDescription, setNewGoalDescription] = useState('');
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
  const [loaded, setLoaded] = useState(false);

  const activeGoals = useMemo(
    () => goals.filter((goal) => !goal.deletedAt),
    [goals],
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

      setGoals(isOldStarterData(restoredState.goals) ? starterGoals : restoredState.goals);
      setPeople(normalizedPeople);
      setActivePersonId(restoredActivePersonId);
      setPasswordPersonId(restoredActivePersonId);
      setActivityLog(restoredState.activityLog);
      setAuthRecords(restoredState.authRecords);

      if (savedSessionPerson && restoredState.authRecords[savedSessionPerson]) {
        setActivePersonId(savedSessionPerson);
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

    const timeoutId = window.setTimeout(() => {
      void fetch('/api/state', {
        body: JSON.stringify({
          activePersonId,
          activityLog,
          authRecords,
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
  }, [activePersonId, activityLog, authRecords, goals, loaded, people]);

  const totals = useMemo(() => {
    const allTasks = activeGoals.flatMap((goal) => [goal, ...flattenChildren(goal)]);
    const done = allTasks.filter((task) => task.done).length;
    const total = allTasks.length;

    return {
      done,
      total,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  }, [activeGoals]);

  const goalSnapshots = useMemo(
    () =>
      activeGoals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        ...calculateProgress(goal),
      })),
    [activeGoals],
  );
  const activePerson = useMemo(
    () => people.find((person) => person.id === activePersonId) ?? people[0],
    [activePersonId, people],
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

    setGoals((current) => [
      {
        id: createId(),
        title,
        description: newGoalDescription.trim() || 'Malý spoločný plán bez veľkého tlaku.',
        ownerId: activePersonId,
        updatedById: activePersonId,
        done: false,
        expanded: true,
        children: [],
      },
      ...current,
    ]);
    addActivity('pridal(a) plán', title);
    setNewGoalTitle('');
    setNewGoalDescription('');
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
    const selectedAvatar = avatarOptions.find((avatar) => avatar.id === avatarId);
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

  async function resetPersonPassword(personId: string, password: string) {
    const trimmed = password.trim();

    if (trimmed.length < 8) {
      return {
        ok: false,
        message: 'Nové heslo nech má aspoň 8 znakov.',
      };
    }

    const salt = createSalt();
    const hash = await hashPassword(trimmed, salt);
    const personName = people.find((person) => person.id === personId)?.name ?? 'Foxie';

    setAuthRecords((current) => ({
      ...current,
      [personId]: { hash, salt },
    }));
    setActivePersonId(personId);
    setPasswordPersonId(personId);
    setAuthenticated(true);
    window.localStorage.setItem(sessionPersonKey, personId);
    addActivity('obnovil(a) heslo', `vstup pre ${personName}`);

    return { ok: true, message: '' };
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newPassword.trim();
    const confirmed = newPasswordConfirm.trim();
    const targetPersonId = passwordPerson?.id ?? activePersonId;

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
    setPasswordMessage(`Hotovo, nové heslo pre ${passwordPerson?.name ?? 'Foxie'} je uložené.`);
    addActivity('zmenil(a) heslo', `vstup pre ${passwordPerson?.name ?? 'Foxie'}`);
  }

  function openPasswordModal(personId = activePersonId) {
    setSettingsOpen(false);
    setPasswordPersonId(personId);
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

      setGoals(data.goals);
      setPeople(importedPeople);
      setActivityLog(data.activityLog);
      setAuthRecords(data.authRecords);
      setActivePersonId(importedActivePersonId);
      setPasswordPersonId(importedActivePersonId);

      window.localStorage.setItem('ciele-goals', JSON.stringify(data.goals));
      window.localStorage.setItem('ciele-active-person', importedActivePersonId);
      window.localStorage.setItem('ciele-people', JSON.stringify(importedPeople));
      window.localStorage.setItem('ciele-activity-log', JSON.stringify(data.activityLog));
      window.localStorage.setItem(authRecordsKey, JSON.stringify(data.authRecords));

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
    setNewPassword('');
    setNewPasswordConfirm('');
    setPasswordMessage('');
    setTransferMessage('');
  }

  function requestPersonSwitch(personId: string) {
    if (personId === activePersonId) {
      return;
    }

    window.localStorage.removeItem(sessionPersonKey);
    setActivePersonId(personId);
    setPasswordPersonId(personId);
    setAuthenticated(false);
    setAvatarMenuOpen(false);
  }

  const recentActivity = activityLog.slice(0, 12);

  if (!loaded) {
    return null;
  }

  if (!authenticated) {
    return (
      <AuthGate
        initialPersonId={activePersonId}
        authRecords={authRecords}
        onAuthenticate={authenticatePerson}
        onResetPassword={resetPersonPassword}
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
              className={person.id === activePersonId ? 'person-card active' : 'person-card'}
              style={{ '--person-tone': person.tone } as React.CSSProperties}
            >
              <button
                aria-label={
                  person.id === activePersonId
                    ? `Prihlásená osoba ${person.name}`
                    : `Prihlásiť sa ako ${person.name}`
                }
                className="person-fox"
                onClick={() => requestPersonSwitch(person.id)}
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
                          {avatarOptions.map((avatar) => (
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
                  <span className="avatar-owner-note">ikonku mení len {person.name}</span>
                )}
              </div>
            </div>
          ))}
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
          <button type="submit">Pridať plán</button>
        </form>
      </section>

      {recentActivity.length > 0 ? (
        <RecentActivityPanel activityLog={recentActivity} people={people} />
      ) : null}

      {trashedGoals.length > 0 ? (
        <TrashPanel goals={trashedGoals} onRestore={restoreGoal} />
      ) : null}

      <section className="board" aria-label="Zoznam cieľov">
        {activeGoals.map((goal) => (
          <GoalPanel
            activePersonId={activePersonId}
            goal={goal}
            key={goal.id}
            onAddSubtask={addSubtask}
            onDelete={deleteTask}
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

function TrashPanel({
  goals,
  onRestore,
}: {
  goals: Goal[];
  onRestore: (goalId: string) => void;
}) {
  return (
    <section className="trash-panel" aria-label="Kôš plánov">
      <div className="trash-heading">
        <div>
          <span className="label">Kôš plánov</span>
          <h2>Odložené bokom</h2>
        </div>
        <strong>{goals.length}</strong>
      </div>
      <div className="trash-list">
        {goals.map((goal) => (
          <div className="trash-item" key={goal.id}>
            <div>
              <span>{goal.title}</span>
              <small>
                Presunuté {goal.deletedAt
                  ? new Date(goal.deletedAt).toLocaleString('sk-SK', {
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      month: '2-digit',
                    })
                  : 'nedávno'}
              </small>
            </div>
            <button onClick={() => onRestore(goal.id)} type="button">
              Obnoviť
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function AuthGate({
  authRecords,
  initialPersonId,
  onAuthenticate,
  onResetPassword,
  people,
}: {
  authRecords: Record<string, AuthRecord>;
  initialPersonId: string;
  onAuthenticate: (personId: string, password: string) => Promise<{ ok: boolean; message: string }>;
  onResetPassword: (personId: string, password: string) => Promise<{ ok: boolean; message: string }>;
  people: Person[];
}) {
  const [selectedPersonId, setSelectedPersonId] = useState(initialPersonId);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const selectedPerson = people.find((person) => person.id === selectedPersonId) ?? people[0];
  const hasPassword = Boolean(authRecords[selectedPersonId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    if (resetMode && password.trim() !== passwordConfirm.trim()) {
      setMessage('Heslá sa nezhodujú.');
      setSubmitting(false);
      return;
    }

    const result = resetMode
      ? await onResetPassword(selectedPersonId, password)
      : await onAuthenticate(selectedPersonId, password);

    if (!result.ok) {
      setMessage(result.message);
      setSubmitting(false);
      return;
    }

    setPassword('');
    setPasswordConfirm('');
    setSubmitting(false);
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

        <div className="auth-people" role="group" aria-label="Výber osoby">
          {people.map((person) => (
            <button
              className={person.id === selectedPersonId ? 'auth-person active' : 'auth-person'}
              key={person.id}
              onClick={() => {
                setSelectedPersonId(person.id);
                setMessage('');
                setPassword('');
                setPasswordConfirm('');
                setResetMode(false);
              }}
              style={{ '--person-tone': person.tone } as React.CSSProperties}
              type="button"
            >
              <AvatarFox person={person} size="medium" />
              <span>{person.name}</span>
            </button>
          ))}
        </div>

        <form className="auth-form" onSubmit={submit}>
          <label>
            {resetMode || !hasPassword
              ? `Nové heslo pre ${selectedPerson?.name}`
              : `Heslo pre ${selectedPerson?.name}`}
            <input
              autoComplete={resetMode || !hasPassword ? 'new-password' : 'current-password'}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={resetMode || !hasPassword ? 'Aspoň 8 znakov' : 'Napíš svoje heslo'}
              type="password"
              value={password}
            />
          </label>
          {resetMode ? (
            <label>
              Ešte raz
              <input
                autoComplete="new-password"
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder="Zopakuj nové heslo"
                type="password"
                value={passwordConfirm}
              />
            </label>
          ) : null}
          <p>
            {resetMode
              ? 'Reset nastaví nové heslo pre vybranú líštičku na tomto zariadení.'
              : hasPassword
                ? 'Toto zariadenie si ťa po vstupe zapamätá.'
                : 'Heslo si hneď zapíš do svojho note-u, appka ho potom ukáže už iba ako overenie.'}
          </p>
          {message ? <strong className="auth-error">{message}</strong> : null}
          <button disabled={submitting} type="submit">
            {resetMode ? 'Nastaviť nové heslo' : hasPassword ? 'Vojsť do tabule' : 'Uložiť a vojsť'}
          </button>
          {hasPassword ? (
            <button
              className="auth-link-button"
              onClick={() => {
                setResetMode((mode) => !mode);
                setMessage('');
                setPassword('');
                setPasswordConfirm('');
              }}
              type="button"
            >
              {resetMode ? 'Späť na prihlásenie' : 'Zabudol som heslo'}
            </button>
          ) : null}
        </form>
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
  onDelete: (taskId: string) => void;
  onRename: (taskId: string, title: string) => void;
  people: Person[];
  toggleDone: (taskId: string) => void;
  toggleExpanded: (taskId: string) => void;
};

function GoalPanel(props: GoalPanelProps) {
  const progress = calculateProgress(props.goal);

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
          />
          <p>{props.goal.description}</p>
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
      </div>

      <div className="meter slim" aria-hidden="true">
        <span style={{ width: `${progress.percent}%` }} />
      </div>

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
