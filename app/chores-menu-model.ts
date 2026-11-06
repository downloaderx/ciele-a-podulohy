import { choreAttention, choreElapsedDays, getChoreIntervalDays, isCompletableTask, type ActivityItem, type Goal, type Task } from './page-model';

const month = 30 * 24 * 60 * 60 * 1000;
const collect = (tasks: Task[]): Task[] => tasks.flatMap((task) => task.deletedAt || task.purgedAt ? [] : [task, ...collect(task.children)]);

export function rankChoreAreas(goals: Goal[], activityLog: ActivityItem[] = [], now = new Date()) {
  const time = now.getTime();
  const recent = (at: string) => Number.isFinite(Date.parse(at)) && Date.parse(at) <= time && Date.parse(at) >= time - month;
  const titleAreas = new Map<string, Set<string>>();
  const areas = goals.filter((goal) => !goal.deletedAt && !goal.purgedAt).map((goal) => {
    const tasks = collect(goal.children).filter(isCompletableTask);
    for (const title of [goal.title, ...tasks.map((task) => task.title)]) {
      const key = (goal.spaceId ?? 'shared') + ':' + title;
      const ids = titleAreas.get(key) ?? new Set<string>(); ids.add(goal.id); titleAreas.set(key, ids);
    }
    const waiting = tasks.filter((task) => choreAttention(task, now));
    const occasional = waiting.filter((task) => task.choreCadence === 'occasional');
    const completions = new Set<string>();
    let latestActivity = 0;
    for (const task of tasks) for (const entry of task.choreCompletions ?? []) {
      if (entry.undoneAt || !recent(entry.completedAt)) continue;
      completions.add(entry.id); latestActivity = Math.max(latestActivity, Date.parse(entry.completedAt));
    }
    return { goal, total: tasks.length, maintained: tasks.length - waiting.length,
      routineAttention: waiting.length - occasional.length, occasionalAttention: occasional.length,
      careShare: tasks.length ? (tasks.length - waiting.length) / tasks.length : 0,
      maxOverdueDays: occasional.reduce((max, task) => Math.max(max, (choreElapsedDays(task, now) ?? 0) - getChoreIntervalDays(task)), 0),
      activity: completions.size, latestActivity, score: 0 };
  });
  const byId = new Map(areas.map((area) => [area.goal.id, area]));
  const seen = new Set<string>();
  for (const event of activityLog) {
    if (seen.has(event.id) || !recent(event.createdAt) || !/^(upravil|zmenil|premenil|nastavil|pridal|obnovil|oddelil)/i.test(event.action)) continue;
    seen.add(event.id);
    const names = [event.target, event.target.split(' → ').at(-1)!, event.target.split(' · ')[0]];
    const ids = names.map((title) => titleAreas.get((event.spaceId ?? 'shared') + ':' + title)).find((matches) => matches?.size === 1);
    if (!ids) continue; // Old logs identify tasks by title; ambiguous names must not inflate multiple areas.
    const area = byId.get([...ids][0])!;
    area.activity++; area.latestActivity = Math.max(area.latestActivity, Date.parse(event.createdAt));
  }
  for (const area of areas) {
    // Care is primary. Recent use adds a small bounded bonus only to mixed areas:
    // an entirely waiting area stays at 0, an entirely maintained area stays at 1.
    const usage = area.activity / (area.activity + 5);
    area.score = area.careShare + 0.15 * area.careShare * (1 - area.careShare) * usage;
  }
  return areas.sort((a, b) => Number(b.total > 0) - Number(a.total > 0) || b.score - a.score || b.activity - a.activity ||
    a.maxOverdueDays - b.maxOverdueDays || b.latestActivity - a.latestActivity || a.goal.title.localeCompare(b.goal.title, 'sk') || a.goal.id.localeCompare(b.goal.id));
}
