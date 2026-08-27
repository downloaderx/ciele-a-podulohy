'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Person = {
  id: string;
  name: string;
  tone: string;
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
};

type ActivityItem = {
  id: string;
  actorId: string;
  action: string;
  target: string;
  createdAt: string;
};

const defaultPeople: Person[] = [
  { id: 'person-1', name: 'Rini', tone: '#35d0ba' },
  { id: 'person-2', name: 'Fluffy', tone: '#4b8dff' },
];

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
    const oldDefaultName =
      (defaultPerson.id === 'person-1' && savedName === 'Ja') ||
      (defaultPerson.id === 'person-2' && savedName === 'Ty');

    return {
      ...defaultPerson,
      name: savedName && !oldDefaultName ? savedName : defaultPerson.name,
    };
  });
}

export default function Home() {
  const [goals, setGoals] = useState<Goal[]>(starterGoals);
  const [people, setPeople] = useState<Person[]>(defaultPeople);
  const [activePersonId, setActivePersonId] = useState(defaultPeople[0].id);
  const [activityLog, setActivityLog] = useState<ActivityItem[]>([]);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDescription, setNewGoalDescription] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const savedGoals = window.localStorage.getItem('ciele-goals');
    const savedPerson = window.localStorage.getItem('ciele-active-person');
    const savedPeople = window.localStorage.getItem('ciele-people');
    const savedActivityLog = window.localStorage.getItem('ciele-activity-log');

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

    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    window.localStorage.setItem('ciele-goals', JSON.stringify(goals));
    window.localStorage.setItem('ciele-active-person', activePersonId);
    window.localStorage.setItem('ciele-people', JSON.stringify(people));
    window.localStorage.setItem('ciele-activity-log', JSON.stringify(activityLog));
  }, [activePersonId, activityLog, goals, loaded, people]);

  const totals = useMemo(() => {
    const allTasks = goals.flatMap((goal) => [goal, ...flattenChildren(goal)]);
    const done = allTasks.filter((task) => task.done).length;
    const total = allTasks.length;

    return {
      done,
      total,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  }, [goals]);

  const goalSnapshots = useMemo(
    () =>
      goals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        ...calculateProgress(goal),
      })),
    [goals],
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
      addActivity('zmazal(a)', task.title);
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

  const recentActivity = activityLog.slice(0, 12);

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Prehľad tímu">
        <div className="brand-lockup">
          <div className="fox-pair" aria-hidden="true">
            <PixelFox />
            <PixelFox flipped />
          </div>
          <div>
            <p className="eyebrow">Virtuálna tabuľa plánov</p>
            <h1>
              Little <span className="crossed-word">acorns</span>
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
                aria-label={`Prepnúť na osobu ${person.name}`}
                className="person-fox"
                onClick={() => setActivePersonId(person.id)}
                type="button"
              >
                <PixelFox small flipped={person.id === 'person-2'} />
              </button>
              <input
                aria-label={`Meno osoby ${person.name}`}
                className="person-name"
                onChange={(event) => changePersonName(person.id, event.target.value)}
                onBlur={(event) => renamePerson(person.id, event.target.value)}
                value={person.name}
              />
            </div>
          ))}
        </div>
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

      <section className="board" aria-label="Zoznam cieľov">
        {goals.map((goal) => (
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
                <PixelFox small flipped={actor?.id === 'person-2'} />
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

function PixelFox({ flipped = false, small = false }: { flipped?: boolean; small?: boolean }) {
  const pixels = [
    'K......K',
    'KO....OK',
    'KFO..OFK',
    'KFFOOFFK',
    '.KFOOFK.',
    '.FWHHWF.',
    '..KBBK..',
    '.KKWWKK.',
  ];

  return (
    <span
      className={[
        'pixel-fox',
        flipped ? 'flipped' : '',
        small ? 'small' : '',
      ].join(' ')}
      aria-hidden="true"
    >
      {pixels.flatMap((row, rowIndex) =>
        row.split('').map((pixel, columnIndex) => (
          <span
            className={pixel === '.' ? 'empty' : `pixel ${pixel.toLowerCase()}`}
            key={`${rowIndex}-${columnIndex}`}
          />
        )),
      )}
    </span>
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
