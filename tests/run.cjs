const fs = require('node:fs');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');
const { test } = require('node:test');
process.env.APP_AUTH_MODE = 'supabase';

// Compile the project's TypeScript in memory, without changing production files.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const jar = new Map();
const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'next/headers') return { cookies: async () => ({
    get: (key) => jar.has(key) ? { value: jar.get(key) } : undefined,
    set: (key, value) => jar.set(key, value), delete: (key) => jar.delete(key),
  }) };
  return originalLoad.call(this, request, ...args);
};
const { defaultPeople, removeTask, calculateProgress } = require('../app/page-model.ts');
const { isValidState, mergeStates, visibleState, liveGoal, stableJson } = require('../app/state-sync.ts');
const { authorizedState } = require('../app/state-access.ts');
const clone = (data) => structuredClone(data);
const task = (id, extra = {}) => ({ id, title: id, ownerId: 'person-1', done: false, expanded: true, kind: 'todo', children: [], ...extra });
const goal = (id, extra = {}) => ({ ...task(id), description: '', category: 'plan', importanceByPerson: { 'person-1': 4, 'person-2': 2 }, feasibilityByPerson: { 'person-1': 3, 'person-2': 3 }, spaceId: 'shared', ...extra });
const state = () => ({ activePersonId: 'person-1', people: clone(defaultPeople), goals: [goal('shared'), goal('private-1', { spaceId: 'person-1' }), goal('private-2', { spaceId: 'person-2' })], activityLog: [], goalRankings: { 'person-1': ['shared', 'private-1', 'private-2'], 'person-2': ['private-2', 'shared'] } });

test('object field order does not create repeated writes or spurious changes', () => {
  const original = state();
  const reordered = { people: original.people, goals: original.goals, goalRankings: original.goalRankings, activityLog: [], activePersonId: 'person-1' };
  assert.equal(stableJson(original), stableJson(reordered));
  assert.deepEqual(mergeStates(original, reordered, original).conflicts, []);
});

test('validates every nested item, dates, ratings, duplicate IDs and nesting limits', () => {
  assert.equal(isValidState(state()), true);
  for (const mutate of [
    (s) => { s.goals[0].children = [task('bad', { children: null })]; },
    (s) => { s.goals[0].children = [task('shared')]; },
    (s) => { s.goals[0].recurrenceStartAt = 'not-a-date'; },
    (s) => { s.people[0].name = null; },
    (s) => { s.goals[0].importanceByPerson['person-1'] = 100; },
    (s) => { s.goals[0].children = [task('bad', { ownerId: 'outsider' })]; },
    (s) => { let parent = s.goals[0]; for (let i = 0; i < 32; i++) { parent.children = [task(`deep-${i}`)]; parent = parent.children[0]; } },
  ]) { const invalid = state(); mutate(invalid); assert.equal(isValidState(invalid), false); }
});

test('both people can see personal goals, activity and rankings', () => {
  const s = state(); s.activityLog = [{ id: 'log', actorId: 'person-2', action: 'edit', target: 'private', createdAt: new Date().toISOString(), spaceId: 'person-2' }];
  const visible = visibleState(s, 'person-1');
  assert.deepEqual(visible.goals.map((g) => g.id), ['shared', 'private-1', 'private-2']);
  assert.equal(visible.activityLog.length, 1);
  assert.equal(JSON.stringify(visible).includes('private-2'), true);
});

test('merges independent edits, new children and separate rating votes', () => {
  const base = state(), local = clone(base), remote = clone(base);
  local.goals[0].title = 'Local title'; local.goals[0].children.push(task('local-child'));
  local.goals[0].importanceByPerson['person-1'] = 5;
  remote.goals[0].description = 'Remote note'; remote.goals[0].children.push(task('remote-child'));
  remote.goals[0].importanceByPerson['person-2'] = 5;
  const merged = mergeStates(base, local, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.state.goals[0].title, 'Local title');
  assert.equal(merged.state.goals[0].description, 'Remote note');
  assert.deepEqual(merged.state.goals[0].children.map((t) => t.id), ['local-child', 'remote-child']);
  assert.deepEqual(merged.state.goals[0].importanceByPerson, { 'person-1': 5, 'person-2': 5 });
});

test('conflicting text requires a choice, preserves unrelated edits', () => {
  const base = state(), local = clone(base), remote = clone(base);
  local.goals[0].title = 'Mine'; remote.goals[0].title = 'Partner'; remote.goals[0].description = 'Preserve';
  assert.equal(mergeStates(base, local, remote).conflicts.length, 1);
  const chosen = mergeStates(base, local, remote, 'remote');
  assert.equal(chosen.state.goals[0].title, 'Partner'); assert.equal(chosen.state.goals[0].description, 'Preserve');
});

test('deletion versus editing is an explicit conflict', () => {
  const base = state(), local = clone(base), remote = clone(base);
  local.goals[0].deletedAt = new Date().toISOString(); remote.goals[0].title = 'Updated';
  assert.equal(mergeStates(base, local, remote).conflicts.length, 1);
  assert.equal(mergeStates(base, local, remote, 'remote').state.goals[0].deletedAt, undefined);
});

test('simultaneous recurring completions retain both history records', () => {
  const base = state(), local = clone(base), remote = clone(base);
  base.goals[0].recurrenceHistory = []; local.goals[0].recurrenceHistory = ['2026-10-14T10:00:00Z']; remote.goals[0].recurrenceHistory = ['2026-10-14T11:00:00Z'];
  const merged = mergeStates(base, local, remote);
  assert.equal(merged.conflicts.length, 0); assert.equal(merged.state.goals[0].recurrenceHistory.length, 2);
});

test('subtask deletion is recoverable and excluded from progress', () => {
  const goals = [goal('g', { kind: 'topic', children: [task('done', { done: true }), task('pending')] })];
  const deleted = removeTask(goals, 'pending');
  assert.ok(deleted[0].children[1].deletedAt);
  assert.equal(calculateProgress(liveGoal(deleted[0])).percent, 100);
  assert.equal(deleted[0].children.length, 2);
});

test('server preserves private data and partner profile, votes and rankings', () => {
  const previous = state(), incoming = visibleState(clone(previous), 'person-1');
  incoming.people[1].name = 'Forged'; incoming.goals[0].importanceByPerson['person-2'] = 5;
  incoming.goalRankings['person-2'] = ['shared']; incoming.goals[0].title = 'Allowed';
  const saved = authorizedState(previous, incoming, 'person-1');
  assert.equal(saved.people[1].name, previous.people[1].name);
  assert.equal(saved.goals[0].importanceByPerson['person-2'], 2);
  assert.deepEqual(saved.goals.find((g) => g.id === 'private-2'), previous.goals[2]);
  assert.deepEqual(saved.goalRankings['person-2'], previous.goalRankings['person-2']);
  assert.equal(isValidState(saved), true);
});

test('hidden IDs cannot be grafted into a shared goal', () => {
  const previous = state(), incoming = visibleState(clone(previous), 'person-1');
  incoming.goals[0].children.push(task('private-2'));
  assert.throws(() => authorizedState(previous, incoming, 'person-1'), /neprístupnej/);
});

test('import removal retains old goals and children in trash', () => {
  const previous = state(); previous.goals[0].children.push(task('old'));
  const incoming = visibleState(clone(previous), 'person-1'); incoming.goals[0].children = []; incoming.goals = incoming.goals.slice(0, 1);
  const saved = authorizedState(previous, incoming, 'person-1');
  assert.ok(saved.goals[0].children[0].deletedAt);
  assert.ok(saved.goals.find((g) => g.id === 'private-1').deletedAt);
});

test('HTTP authorization, validation and atomic concurrent writes', async () => {
  process.env.SUPABASE_URL = 'https://example.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service'; process.env.SUPABASE_ANON_KEY = 'test-anon';
  let stored = { data: state(), revision: 7 };
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: 'user-1' });
    if (path === '/rest/v1/app_members') return Response.json([{ person_id: 'person-1' }]);
    if (path === '/rest/v1/app_state') return Response.json([clone(stored)]);
    if (path === '/rest/v1/rpc/save_app_state') {
      const body = JSON.parse(init.body);
      if (body.p_expected_revision !== stored.revision) return Response.json({ ok: false });
      stored = { data: body.p_data, revision: stored.revision + 1 };
      return Response.json({ ok: true, revision: stored.revision });
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  try {
    const route = require('../app/api/state/route.ts');
    jar.clear(); assert.equal((await route.GET()).status, 401);
    const request = (data, revision = 7, origin = 'https://foxies.test') => new Request('https://foxies.test/api/state', {
      method: 'PUT', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ data, revision }),
    });
    jar.set('acorns-access', 'test-access');
    const visible = visibleState(stored.data, 'person-1');
    assert.equal((await route.PUT(request(visible, 7, 'https://attacker.test'))).status, 403);
    const { checkOrigin } = require('../app/server-storage.ts');
    assert.doesNotThrow(() => checkOrigin(new Request('http://localhost:3009/api/state', { headers: { host: '127.0.0.1:3009', origin: 'http://127.0.0.1:3009' } })));
    assert.equal((await route.PUT(request({ goals: [] }))).status, 400);
    const a = clone(visible), b = clone(visible); a.goals[0].title = 'A'; b.goals[0].description = 'B';
    const replies = await Promise.all([route.PUT(request(a)), route.PUT(request(b))]);
    assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
    assert.equal(stored.revision, 8);
    const conflict = await replies.find((r) => r.status === 409).json();
    assert.equal(conflict.revision, 8); assert.equal(JSON.stringify(conflict).includes('private-2'), true);
    assert.equal((await route.PUT(new Request('https://foxies.test/api/state', { method: 'PUT', headers: { origin: 'https://foxies.test' }, body: 'null' }))).status, 400);
  } finally { global.fetch = originalFetch; jar.clear(); }
});

test('Supabase login, membership rejection and session cookie clearing', async () => {
  const originalFetch = global.fetch;
  let member = false, signedOut = false;
  global.fetch = async (url) => {
    const path = new URL(url).pathname;
    if (path === '/auth/v1/token') return Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600 });
    if (path === '/auth/v1/user') return Response.json({ id: 'user-1' });
    if (path === '/rest/v1/app_members') return Response.json(member ? [{ person_id: 'person-1' }] : []);
    if (path === '/auth/v1/logout') { signedOut = true; return new Response(null, { status: 204 }); }
    throw new Error('Unexpected auth request');
  };
  try {
    const route = require('../app/api/session/route.ts');
    const login = () => new Request('https://foxies.test/api/session', { method: 'POST', headers: { origin: 'https://foxies.test' }, body: JSON.stringify({ email: 'test@example.test', password: 'fake-password' }) });
    jar.clear(); assert.equal((await route.POST(login())).status, 403); assert.equal(jar.size, 0);
    member = true; assert.equal((await route.POST(login())).status, 200);
    assert.equal(jar.has('acorns-access'), true); assert.equal(jar.has('acorns-refresh'), true);
    assert.equal((await route.GET()).status, 200);
    assert.equal((await route.DELETE(new Request('https://foxies.test/api/session', { method: 'DELETE', headers: { origin: 'https://foxies.test' } }))).status, 200);
    assert.equal(signedOut, true); assert.equal(jar.size, 0);
    assert.equal((await (await route.GET()).json()).personId, null);
  } finally { global.fetch = originalFetch; jar.clear(); }
});

test('password-free profiles work without auth keys and cannot bypass enabled Supabase authentication', async () => {
  const { selectProfile, requirePerson } = require('../app/server-storage.ts');
  process.env.APP_AUTH_MODE = 'profiles'; jar.clear();
  try {
    await selectProfile('person-2'); assert.equal(await requirePerson(), 'person-2');
    process.env.APP_AUTH_MODE = 'supabase';
    await assert.rejects(() => requirePerson(), /Prihláste/);
    await assert.rejects(() => selectProfile('person-1'), /Supabase/);
  } finally { process.env.APP_AUTH_MODE = 'supabase'; jar.clear(); }
});

test('chore grouping survives sync and rejects unknown groups', () => {
  const base = state(); base.goals[0].category = 'chore';
  base.goals[0].children = [task('routine', { children: [task('nested')] }), task('occasional', { choreCadence: 'occasional', dueAt: '2026-11-01T10:00:00.000Z' })];
  assert.equal(isValidState(base), true);
  const invalid = clone(base); invalid.goals[0].children[0].choreCadence = 'unknown';
  assert.equal(isValidState(invalid), false);
  const local = clone(base), remote = clone(base);
  local.goals[0].children[0].choreCadence = 'occasional'; remote.goals[0].children[0].title = 'Remote edit';
  const merged = mergeStates(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.state.goals[0].children[0].choreCadence, 'occasional');
  assert.equal(merged.state.goals[0].children[0].title, 'Remote edit');
  assert.equal(merged.state.goals[0].children[0].children[0].id, 'nested');
  assert.equal(merged.state.goals[0].children[1].dueAt, base.goals[0].children[1].dueAt);
});

test('chore effort weights progress independently of occasional chores', () => {
  const { calculateChoreProgress } = require('../app/page-model.ts');
  const tasks = [task('small', {done:true}), task('medium', {choreWeight:3}), task('large', {choreWeight:5}), task('occasional', {choreCadence:'occasional',choreWeight:5}), task('rule',{kind:'rule',choreWeight:5}), task('deleted',{deletedAt:'2026-10-14T10:00:00.000Z',choreWeight:5})];
  assert.equal(calculateChoreProgress(tasks,'routine').percent,11);
  assert.equal(calculateChoreProgress(tasks,'routine').totalWeight,9);
  assert.equal(calculateChoreProgress(tasks,'occasional').percent,0);
  tasks[1].done=true; assert.equal(calculateChoreProgress(tasks,'routine').percent,44);
  tasks[3].done=true; assert.equal(calculateChoreProgress(tasks,'occasional').percent,100);
  assert.equal(calculateChoreProgress(tasks,'routine').percent,44);
  tasks[2].done=true; assert.equal(calculateChoreProgress(tasks,'routine').percent,100);
  assert.equal(calculateChoreProgress([],'routine').percent,0);
  const s=state(); s.goals[0].category='chore'; s.goals[0].children=[task('weighted',{choreWeight:3,children:[task('nested',{choreCadence:'occasional',choreWeight:5})]})];
  assert.equal(isValidState(s),true); s.goals[0].children[0].choreWeight=2; assert.equal(isValidState(s),false);
});

test('personal boards are mutually readable but only the owner can change content', () => {
  for (const personId of ['person-1','person-2']) {
    const base=state(); const peerId=personId==='person-1'?'private-2':'private-1';
    const incoming=visibleState(clone(base),personId);
    assert.ok(incoming.goals.find(g=>g.id===peerId));
    assert.equal(isValidState(authorizedState(base,incoming,personId)),true);
    incoming.goals.find(g=>g.id===peerId).title='Forbidden';
    assert.throws(()=>authorizedState(base,incoming,personId),/prezeranie/);
    const missing=visibleState(clone(base),personId);missing.goals=missing.goals.filter(g=>g.id!==peerId);
    assert.deepEqual(authorizedState(base,missing,personId).goals.find(g=>g.id===peerId),base.goals.find(g=>g.id===peerId));
  }
});
