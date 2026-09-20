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

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Restore browser-local data after hydration.
    const savedGoals = window.localStorage.getItem('ciele-goals');
    const savedPerson = window.localStorage.getItem('ciele-active-person');
    const savedPeople = window.localStorage.getItem('ciele-people');
    const savedActivityLog = window.localStorage.getItem('ciele-activity-log');
    const savedAuthRecords = window.localStorage.getItem(authRecordsKey);
    const savedSessionPerson = window.localStorage.getItem(sessionPersonKey);
    let parsedAuthRecords: Record<string, AuthRecord> = {};

    if (savedGoals) {
      const parsedGoals = JSON.parse(savedGoals) as Goal[];
      setGoals(isOldStarterData(parsedGoals) ? starterGoals : parsedGoals);
    }

    if (savedPeople) {
      const parsedPeople = JSON.parse(savedPeople) as Person[];
      setPeople(normalizePeople(parsedPeople));
    }

    if (savedPerson && defaultPeople.some((person) => person.id === savedPerson)) {
      setActivePersonId(savedPerson);
    }

    if (savedActivityLog) {
      setActivityLog(JSON.parse(savedActivityLog));
    }

    if (savedAuthRecords) {
      parsedAuthRecords = JSON.parse(savedAuthRecords) as Record<string, AuthRecord>;
      setAuthRecords(parsedAuthRecords);
    }

    if (savedSessionPerson && parsedAuthRecords[savedSessionPerson]) {
      setActivePersonId(savedSessionPerson);
      setAuthenticated(true);
    }

    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!loaded) {
      return;
    }

    window.localStorage.setItem('ciele-goals', JSON.stringify(goals));
    window.localStorage.setItem('ciele-active-person', activePersonId);
    window.localStorage.setItem('ciele-people', JSON.stringify(people));
    window.localStorage.setItem('ciele-activity-log', JSON.stringify(activityLog));
    window.localStorage.setItem(authRecordsKey, JSON.stringify(authRecords));
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
    setAuthenticated(true);
    window.localStorage.setItem(sessionPersonKey, personId);
    addActivity('nastavil(a) heslo', 'svoj vstup do tabule');

    return { ok: true, message: '' };
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newPassword.trim();
    const confirmed = newPasswordConfirm.trim();

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
      [activePersonId]: { hash, salt },
    }));
    setNewPassword('');
    setNewPasswordConfirm('');
    setSavingPassword(false);
    setPasswordMessage('Hotovo, nové heslo je uložené.');
    addActivity('zmenil(a) heslo', 'svoj vstup do tabule');
  }

  function openPasswordModal() {
    setSettingsOpen(false);
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

  function logout() {
    window.localStorage.removeItem(sessionPersonKey);
    setAuthenticated(false);
    setSettingsOpen(false);
    setPasswordModalOpen(false);
    setAvatarMenuOpen(false);
    setNewPassword('');
    setNewPasswordConfirm('');
    setPasswordMessage('');
  }

  function requestPersonSwitch(personId: string) {
    if (personId === activePersonId) {
      return;
    }

    window.localStorage.removeItem(sessionPersonKey);
    setActivePersonId(personId);
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
                <button onClick={openPasswordModal} type="button">
                  Zmeniť heslo
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
                <h2>Zmeniť heslo</h2>
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
                Nové heslo pre {activePerson?.name}
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
  people,
}: {
  authRecords: Record<string, AuthRecord>;
  initialPersonId: string;
  onAuthenticate: (personId: string, password: string) => Promise<{ ok: boolean; message: string }>;
  people: Person[];
}) {
  const [selectedPersonId, setSelectedPersonId] = useState(initialPersonId);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const selectedPerson = people.find((person) => person.id === selectedPersonId) ?? people[0];
  const hasPassword = Boolean(authRecords[selectedPersonId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    const result = await onAuthenticate(selectedPersonId, password);

    if (!result.ok) {
      setMessage(result.message);
      setSubmitting(false);
      return;
    }

    setPassword('');
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
            {hasPassword ? `Heslo pre ${selectedPerson?.name}` : `Nové heslo pre ${selectedPerson?.name}`}
            <input
              autoComplete={hasPassword ? 'current-password' : 'new-password'}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={hasPassword ? 'Napíš svoje heslo' : 'Aspoň 8 znakov'}
              type="password"
              value={password}
            />
          </label>
          <p>
            {hasPassword
              ? 'Toto zariadenie si ťa po vstupe zapamätá.'
              : 'Heslo si hneď zapíš do svojho note-u, appka ho potom ukáže už iba ako overenie.'}
          </p>
          {message ? <strong className="auth-error">{message}</strong> : null}
          <button disabled={submitting} type="submit">
            {hasPassword ? 'Vojsť do tabule' : 'Uložiť a vojsť'}
          </button>
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
