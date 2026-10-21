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
  const tasks = [task('small', {done:true,choreCompletions:[{id:'dated-small',personId:'person-1',completedAt:new Date().toISOString()}]}), task('medium', {choreWeight:3}), task('large', {choreWeight:5}), task('occasional', {choreCadence:'occasional',choreWeight:5}), task('rule',{kind:'rule',choreWeight:5}), task('deleted',{deletedAt:'2026-10-14T10:00:00.000Z',choreWeight:5})];
  assert.equal(calculateChoreProgress(tasks,'routine').percent,11);
  assert.equal(calculateChoreProgress(tasks,'routine').totalWeight,9);
  assert.equal(calculateChoreProgress(tasks,'occasional').percent,0);
  tasks[1].choreCompletions=[{id:'dated-medium',personId:'person-1',completedAt:new Date().toISOString()}]; assert.equal(calculateChoreProgress(tasks,'routine').percent,44);
  tasks[3].done=true; assert.equal(calculateChoreProgress(tasks,'occasional').percent,100);
  assert.equal(calculateChoreProgress(tasks,'routine').percent,44);
  tasks[2].choreCompletions=[{id:'dated-large',personId:'person-1',completedAt:new Date().toISOString()}]; assert.equal(calculateChoreProgress(tasks,'routine').percent,100);
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

const { gratitudeDay } = require('../app/gratitude.ts');
const { readTransferData } = require('../app/page-model.ts');
const gratitude = (personId, day, text = 'Spoločná večera') => ({ id: personId + ':' + day, personId, day, text });

test('gratitude uses Bratislava day boundaries, including summer time', () => {
  assert.equal(gratitudeDay(new Date('2026-01-01T23:30:00Z')), '2026-01-02');
  assert.equal(gratitudeDay(new Date('2026-07-01T22:30:00Z')), '2026-07-02');
});

test('gratitude validates one entry per person/day and survives backup parsing', () => {
  const s = state(); s.gratitudeEntries = [gratitude('person-1', '2026-10-16')];
  assert.equal(isValidState(s), true);
  assert.deepEqual(readTransferData({ data: s }).gratitudeEntries, s.gratitudeEntries);
  for (const entry of [
    gratitude('person-1', '2026-02-30'), gratitude('person-3', '2026-10-16'),
    gratitude('person-1', '2026-10-16', ''), gratitude('person-1', '2026-10-16', 'x'.repeat(1001)),
    { ...s.gratitudeEntries[0], id: 'another-id' },
  ]) assert.equal(isValidState({ ...s, gratitudeEntries: [entry] }), false);
  assert.equal(isValidState({ ...s, gratitudeEntries: [...s.gratitudeEntries, ...s.gratitudeEntries] }), false);
  assert.equal(isValidState(state()), true);
});

test('gratitude preserves partner/history and permits only own current entry', () => {
  const today = gratitudeDay(); const oldDay = '2020-01-01';
  const base = state(); base.gratitudeEntries = [gratitude('person-2', today), gratitude('person-1', oldDay)];
  const next = clone(base); next.gratitudeEntries.push(gratitude('person-1', today));
  const saved = authorizedState(base, next, 'person-1');
  assert.equal(saved.gratitudeEntries.length, 3);
  next.gratitudeEntries[2].text = 'Pokojný deň';
  assert.equal(authorizedState(saved, next, 'person-1').gratitudeEntries.find(e => e.personId === 'person-1' && e.day === today).text, 'Pokojný deň');
  for (const entry of [gratitude('person-2', today, 'Forged'), gratitude('person-1', oldDay, 'Changed'), gratitude('person-1', '2099-01-01')]) {
    assert.throws(() => authorizedState(base, { ...base, gratitudeEntries: [entry] }, 'person-1'), /dnešný zápis/);
  }
  assert.deepEqual(authorizedState(saved, state(), 'person-1').gratitudeEntries, saved.gratitudeEntries);
  assert.equal(visibleState(saved, 'person-2').gratitudeEntries.length, 3);
});

test('simultaneous gratitude entries merge without losing either person', () => {
  const base = state(), local = state(), remote = state(), day = gratitudeDay();
  local.gratitudeEntries = [gratitude('person-1', day)];
  remote.gratitudeEntries = [gratitude('person-2', day)];
  const merged = mergeStates(base, local, remote);
  assert.equal(merged.conflicts.length, 0); assert.equal(merged.state.gratitudeEntries.length, 2);
  const a = clone(local), b = clone(local); a.gratitudeEntries[0].text = 'A'; b.gratitudeEntries[0].text = 'B';
  assert.equal(mergeStates(local, a, b).conflicts.length, 1);
});

const { choreDone, choreView } = require('../app/page-model.ts');
const choreEntry = (id, personId = 'person-1', completedAt = '2026-10-17T22:30:00.000Z') => ({ id, personId, completedAt });
test('repeatable chores use seven Bratislava calendar days and retain history', () => {
  const t = task('repeat', {done:false, choreWeight:3, choreCompletions:[choreEntry('one'),choreEntry('two')]});
  assert.equal(choreDone(t,'2026-10-18'),true);
  assert.equal(choreDone(t,'2026-10-19'),true);
  assert.equal(choreDone(t,'2026-10-24'),true);
  assert.equal(choreDone(t,'2026-10-17'),false);
  assert.equal(choreDone(t,'2026-10-25'),false);
  const next = choreView(t,'2026-10-25');
  assert.equal(next.done,false); assert.equal(next.choreCompletions.length,2);
  assert.equal(choreDone({...t,choreCadence:'occasional'},'2026-10-19'),true);
  assert.equal(choreDone({...t,choreCompletions:t.choreCompletions.map(e=>({...e,undoneAt:'2026-10-18T01:00:00Z'}))},'2026-10-18'),false);
  assert.equal(choreDone(task('legacy',{done:true}),'2026-10-19'),false);
});
test('chore completion events validate actor, timestamps and duplicate IDs', () => {
  const s=state(); s.goals[0].category='chore'; s.goals[0].children=[task('repeat',{choreCompletions:[choreEntry('one')]})];
  assert.equal(isValidState(s),true);
  for(const entries of [[choreEntry('one'),choreEntry('one')],[choreEntry('bad','person-3')],[choreEntry('bad','person-1','invalid')]]) {
    const bad=clone(s);bad.goals[0].children[0].choreCompletions=entries;assert.equal(isValidState(bad),false);
  }
});
test('simultaneous chore executions both survive merge and stay within history limit', () => {
  const b=state();b.goals[0].children=[task('repeat',{choreCompletions:[]})];
  const l=clone(b),r=clone(b);l.goals[0].children[0].choreCompletions=[choreEntry('local')];r.goals[0].children[0].choreCompletions=[choreEntry('remote','person-2')];
  const m=mergeStates(b,l,r);assert.equal(m.conflicts.length,0);assert.equal(m.state.goals[0].children[0].choreCompletions.length,2);
  b.goals[0].children[0].choreCompletions=Array.from({length:200},(_,i)=>choreEntry('old-'+i));
  const x=clone(b),y=clone(b);x.goals[0].children[0].choreCompletions=[choreEntry('new-1','person-1','2026-10-18T10:00:00Z'),...b.goals[0].children[0].choreCompletions.slice(0,199)];y.goals[0].children[0].choreCompletions=[choreEntry('new-2','person-2','2026-10-18T10:00:00Z'),...b.goals[0].children[0].choreCompletions.slice(0,199)];
  const limited=mergeStates(b,x,y).state;assert.equal(limited.goals[0].children[0].choreCompletions.length,200);assert.equal(isValidState(limited),true);assert.ok(limited.goals[0].children[0].choreCompletions.find(e=>e.id==='new-1'));assert.ok(limited.goals[0].children[0].choreCompletions.find(e=>e.id==='new-2'));
});
test('server preserves chore history for old clients and restricts undo to original actor', () => {
  const b=state();b.goals[0].children=[task('repeat',{choreCompletions:[choreEntry('mine'),choreEntry('theirs','person-2')]})];
  const n=clone(b);delete n.goals[0].children[0].choreCompletions;
  assert.equal(authorizedState(b,n,'person-1').goals[0].children[0].choreCompletions.length,2);
  const own=clone(b);own.goals[0].children[0].choreCompletions[0].undoneAt=new Date().toISOString();
  assert.ok(authorizedState(b,own,'person-1').goals[0].children[0].choreCompletions.find(e=>e.id==='mine').undoneAt);
  const peer=clone(b);peer.goals[0].children[0].choreCompletions[1].undoneAt=new Date().toISOString();
  assert.throws(()=>authorizedState(b,peer,'person-1'),/svoje vykonanie/);
  const forged=clone(b);forged.goals[0].children[0].choreCompletions.push(choreEntry('forged','person-2'));
  assert.throws(()=>authorizedState(b,forged,'person-1'),/autor vykonania/);
});

const { calculateCategoryProgress } = require('../app/page-model.ts');
test('relationship and chores summary progress stays independent', () => {
  const plan=goal('relationship',{kind:'topic',children:[task('p1',{done:true}),task('p2')]});
  const chore=goal('chores',{category:'chore',children:[task('c1',{choreWeight:3,choreCompletions:[choreEntry('work')]}),task('c2'),task('occasional',{choreCadence:'occasional',done:true,choreWeight:5}),task('removed',{done:true,deletedAt:'2026-10-17T12:00:00Z'})]});
  const goals=[plan,chore,goal('activity',{category:'activity',done:true})];
  const relation=calculateCategoryProgress(goals,'plan','2026-10-18');
  assert.equal(relation.percent,50);assert.equal(relation.total,2);
  const chores=calculateCategoryProgress(goals,'chore','2026-10-18');
  assert.equal(chores.percent,75);assert.equal(chores.done,1);assert.equal(chores.total,2);
  assert.equal(calculateCategoryProgress(goals,'chore','2026-10-25').percent,0);
  chore.children[1].choreCompletions=[choreEntry('more-work')];
  assert.equal(calculateCategoryProgress(goals,'chore','2026-10-18').percent,100);
  assert.deepEqual(calculateCategoryProgress(goals,'plan','2026-10-18'),relation);
  assert.equal(calculateCategoryProgress([],'plan').total,0);
});

const { choreHistorySummary } = require('../app/page-model.ts');
test('undated legacy chores stay visible but never count toward a dated period', () => {
  const legacy=task('legacy',{done:true});
  const completed=task('dated',{choreCompletions:[choreEntry('older','person-1','2026-10-18T10:00:00Z'),{...choreEntry('undone','person-1','2026-10-19T10:00:00Z'),undoneAt:'2026-10-19T10:01:00Z'}]});
  const summary=choreHistorySummary([legacy,completed,task('deleted',{done:true,deletedAt:'2026-10-18T12:00:00Z'})]);
  assert.equal(summary.undatedCount,1);assert.equal(summary.lastCompletedAt,'2026-10-18T10:00:00Z');
  const view=choreView(legacy,'2026-10-19');assert.equal(view.done,true);assert.equal(choreDone(view,'2026-10-19'),false);
  assert.equal(calculateCategoryProgress([goal('g',{category:'chore',children:[legacy,completed]})],'chore','2026-10-19').done,1);
});
test('seven-day chore window uses calendar dates across daylight saving changes', () => {
  const t=task('dst',{choreCompletions:[choreEntry('work','person-1','2026-10-24T22:30:00Z')]});
  assert.equal(choreDone(t,'2026-10-24'),false);
  assert.equal(choreDone(t,'2026-10-31'),true);
  assert.equal(choreDone(t,'2026-11-01'),false);
});

test('satisfaction is optional, validates 1–5 answers and survives export parsing', () => {
  const s=state();assert.equal(s.goals[0].satisfactionByPerson,undefined);assert.equal(isValidState(s),true);
  s.goals[0].satisfactionByPerson={'person-1':4};assert.equal(isValidState(s),true);
  assert.equal(readTransferData({data:s}).goals[0].satisfactionByPerson['person-1'],4);
  for(const value of [{'person-1':0},{'person-1':6},{'person-1':2.5},{'unknown':3},null]) {
    const bad=clone(s);bad.goals[0].satisfactionByPerson=value;assert.equal(isValidState(bad),false);
  }
  s.goals[0].satisfactionByPerson={};assert.equal(isValidState(s),true);
});
test('server protects partner satisfaction, allows own changes/clearing and preserves old clients', () => {
  const b=state();b.goals[0].satisfactionByPerson={'person-1':2,'person-2':4};
  const n=clone(b);n.goals[0].satisfactionByPerson={'person-1':5,'person-2':1};
  const saved=authorizedState(b,n,'person-1');
  assert.deepEqual(saved.goals[0].satisfactionByPerson,{'person-1':5,'person-2':4});
  assert.deepEqual(saved.goals[0].importanceByPerson,b.goals[0].importanceByPerson);
  const cleared=clone(saved);cleared.goals[0].satisfactionByPerson={'person-2':4};
  assert.deepEqual(authorizedState(saved,cleared,'person-1').goals[0].satisfactionByPerson,{'person-2':4});
  const legacy=clone(b);delete legacy.goals[0].satisfactionByPerson;
  assert.deepEqual(authorizedState(b,legacy,'person-1').goals[0].satisfactionByPerson,b.goals[0].satisfactionByPerson);
  const forged=state();forged.goals[0].satisfactionByPerson={'person-2':5};
  assert.deepEqual(authorizedState(state(),forged,'person-1').goals[0].satisfactionByPerson,{});
});
test('simultaneous satisfaction responses merge independently without inventing missing answers', () => {
  const b=state(),l=state(),r=state();l.goals[0].satisfactionByPerson={'person-1':2};r.goals[0].satisfactionByPerson={'person-2':5};
  const merged=mergeStates(b,l,r);assert.equal(merged.conflicts.length,0);
  assert.deepEqual(merged.state.goals[0].satisfactionByPerson,{'person-1':2,'person-2':5});
  assert.equal(isValidState(merged.state),true);
});

const { occasionalChoreSchedule, collectCompletedItems } = require('../app/page-model.ts');
test('occasional schedule tracks individual dates and preserves legacy project history', () => {
  const g=goal('bathroom',{category:'chore',done:true,lastCompletedAt:'2020-01-01T12:00:00Z',recurrenceHistory:['2020-01-01T12:00:00Z'],children:[
    task('routine'), task('late',{choreCadence:'occasional',dueAt:'2026-11-01T12:00:00Z',children:[task('nested',{choreCadence:'occasional',dueAt:'2026-10-25T12:00:00Z',choreCompletions:[choreEntry('valid','person-1','2026-10-19T12:00:00Z'),{...choreEntry('undone','person-1','2026-10-20T12:00:00Z'),undoneAt:'2026-10-20T13:00:00Z'}]})]}),
    task('undated',{choreCadence:'occasional',done:true}),task('deleted',{choreCadence:'occasional',deletedAt:'2026-10-19T12:00:00Z',children:[task('hidden',{choreCadence:'occasional'})]})]});
  const before=clone(g);const schedule=occasionalChoreSchedule([g,goal('other',{children:[task('ignored',{choreCadence:'occasional'})]})]);
  assert.deepEqual(schedule.map(i=>i.taskId),['nested','late','undated']);
  assert.equal(schedule[0].lastCompletedAt,'2026-10-19T12:00:00Z');
  assert.equal(schedule[1].lastCompletedAt,undefined);assert.equal(schedule[2].undated,true);
  assert.deepEqual(g,before);
});
test('whole chore projects are not listed as completed while actual completed tasks remain', () => {
  const g=goal('chore',{category:'chore',done:true,children:[task('child',{done:true})]});
  const completed=collectCompletedItems([g,goal('project',{done:true})]);
  assert.equal(completed.some(i=>i.id==='chore'),false);assert.equal(completed.some(i=>i.id==='child'),true);assert.equal(completed.some(i=>i.id==='project'),true);
});

const { choreAttention, choreAttentionCount } = require('../app/page-model.ts');
test('chore attention respects the Bratislava seven-day window, undo and future events', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const doneAt = (completedAt, extra = {}) => ({ id: 'run', personId: 'person-1', completedAt, ...extra });
  assert.equal(choreAttention(task('recent', { choreCompletions: [doneAt('2026-10-15T12:00:00Z')] }), now), undefined);
  assert.ok(choreAttention(task('old', { choreCompletions: [doneAt('2026-10-14T12:00:00Z')] }), now));
  assert.equal(choreAttention(task('boundary', { choreCompletions: [doneAt('2026-10-14T22:30:00Z')] }), now), undefined);
  assert.ok(choreAttention(task('undo', { choreCompletions: [doneAt('2026-10-21T10:00:00Z', { undoneAt: '2026-10-21T11:00:00Z' })] }), now));
  assert.ok(choreAttention(task('future', { choreCompletions: [doneAt('2026-10-21T15:00:00Z')] }), now));
  assert.ok(choreAttention(task('legacy', { done: true }), now));
  assert.equal(choreAttention(task('rule', { kind: 'rule' }), now), undefined);
});
test('occasional reminders use repetition intervals rather than old absolute deadlines', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const occasional = task('occasional', { choreCadence: 'occasional', dueAt: '2026-10-20T12:00:00Z' });
  assert.ok(choreAttention(occasional, now));
  assert.match(choreAttention({ ...occasional, dueAt: undefined }, now), /bez záznamu/);
  assert.match(choreAttention({ ...occasional, dueAt: '2026-10-22T12:00:00Z' }, now), /bez záznamu/);
  assert.equal(choreAttention({ ...occasional, choreCompletions: [{ id: 'done', personId: 'person-1', completedAt: '2026-10-21T10:00:00Z' }] }, now), undefined);
  assert.equal(choreAttention({ ...occasional, choreCompletions: [{ id: 'old', personId: 'person-1', completedAt: '2026-10-19T10:00:00Z' }] }, now), undefined);
  assert.equal(choreAttentionCount([task('deleted', { deletedAt: '2026-10-20T12:00:00Z', children: [task('hidden')] }), task('topic', { kind: 'topic', children: [occasional] })], now), 1);
});

test('chore reminder counts stay separate for routine and occasional nested work', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const tasks = [task('routine'), task('group', { kind: 'topic', children: [task('late', { choreCadence: 'occasional', dueAt: '2026-10-20T12:00:00Z' }), task('routine-child')] })];
  assert.equal(choreAttentionCount(tasks, now, 'routine'), 2);
  assert.equal(choreAttentionCount(tasks, now, 'occasional'), 1);
  assert.equal(choreAttentionCount(tasks, now), 3);
});

test('undated occasional chores show reminders for missing history or thirty calendar days without execution', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const occasional = task('occasional', { choreCadence: 'occasional' });
  const entry = (completedAt, extra = {}) => ({ id: 'run', personId: 'person-1', completedAt, ...extra });
  assert.match(choreAttention(occasional, now), /bez záznamu/);
  assert.match(choreAttention({ ...occasional, done: true }, now), /nie je známy/);
  assert.equal(choreAttention({ ...occasional, choreCompletions: [entry('2026-09-22T12:00:00Z')] }, now), undefined);
  assert.match(choreAttention({ ...occasional, choreCompletions: [entry('2026-09-21T12:00:00Z')] }, now), /30 dní/);
  assert.equal(choreAttention({ ...occasional, choreCompletions: [entry('2026-09-21T22:30:00Z')] }, now), undefined);
  assert.match(choreAttention({ ...occasional, choreCompletions: [entry('2026-10-20T12:00:00Z', { undoneAt: '2026-10-21T10:00:00Z' })] }, now), /bez záznamu/);
  assert.match(choreAttention({ ...occasional, dueAt: '2026-11-01T12:00:00Z' }, now), /bez záznamu/);
  assert.equal(choreAttention({ ...occasional, choreCompletions: [entry('2026-09-01T12:00:00Z'), { ...entry('2026-10-20T12:00:00Z'), id: 'recent' }] }, now), undefined);
});

const { choreElapsedDays, choreElapsedLabel, getChoreIntervalDays } = require('../app/page-model.ts');
test('elapsed chore time and custom intervals use actual executions and Bratislava calendar days', () => {
  const now = new Date('2026-10-26T12:00:00Z');
  const item = task('occasional', { choreCadence: 'occasional', choreIntervalDays: 14, choreCompletions: [{ id: 'old', personId: 'person-1', completedAt: '2026-10-12T12:00:00Z' }] });
  assert.equal(choreElapsedDays(item, now), 14);
  assert.equal(choreElapsedLabel(item, now), 'Nerobené 14 dní');
  assert.ok(choreAttention(item, now));
  assert.equal(choreAttention({ ...item, choreIntervalDays: 15 }, now), undefined);
  assert.equal(getChoreIntervalDays(task('default')), 30);
  const dst = { ...item, choreCompletions: [{ id: 'dst', personId: 'person-1', completedAt: '2026-10-24T22:30:00Z' }] };
  assert.equal(choreElapsedDays(dst, now), 1);
  assert.equal(choreElapsedLabel(dst, now), 'Nerobené 1 deň');
  const today = { ...item, choreCompletions: [{ id: 'today', personId: 'person-1', completedAt: '2026-10-26T10:00:00Z' }] };
  assert.equal(choreElapsedLabel(today, now), 'Vykonané dnes');
  assert.equal(choreAttention(today, now), undefined);
  assert.equal(choreElapsedDays({ ...item, choreCompletions: [{ ...item.choreCompletions[0], undoneAt: now.toISOString() }] }, now), undefined);
  assert.equal(choreElapsedDays({ ...item, choreCompletions: [{ ...item.choreCompletions[0], completedAt: '2026-10-27T12:00:00Z' }] }, now), undefined);
});
test('chore intervals validate, merge and persist while older clients cannot erase them', () => {
  const base = state(); base.goals[0].category = 'chore'; base.goals[0].children = [task('occasional', { choreCadence: 'occasional', choreIntervalDays: 14 })];
  assert.equal(isValidState(base), true);
  for (const value of [0, -1, 1.5, 3651, '14', null]) { const invalid = clone(base); invalid.goals[0].children[0].choreIntervalDays = value; assert.equal(isValidState(invalid), false); }
  const local = clone(base), remote = clone(base); local.goals[0].children[0].choreIntervalDays = 21; remote.goals[0].children[0].title = 'Changed remotely';
  const merged = mergeStates(base, local, remote); assert.equal(merged.conflicts.length, 0);
  const saved = authorizedState(base, merged.state, 'person-1');
  assert.equal(saved.goals[0].children[0].choreIntervalDays, 21);
  assert.equal(saved.goals[0].children[0].title, 'Changed remotely');
  const oldClient = clone(saved); delete oldClient.goals[0].children[0].choreIntervalDays;
  assert.equal(authorizedState(saved, oldClient, 'person-1').goals[0].children[0].choreIntervalDays, 21);
  assert.equal(JSON.parse(JSON.stringify(saved)).goals[0].children[0].choreIntervalDays, 21);
});

test('daily chore appearance expires at Bratislava midnight without losing seven-day progress or history', () => {
  const { choreDone } = require('../app/page-model.ts');
  const item = task('daily', { choreCompletions: [{ id: 'run', personId: 'person-1', completedAt: '2026-10-21T21:30:00Z' }] });
  const original = clone(item);
  assert.equal(choreElapsedDays(item, new Date('2026-10-21T21:59:59Z')), 0);
  assert.equal(choreElapsedDays(item, new Date('2026-10-21T22:00:00Z')), 1);
  assert.equal(choreDone(item, '2026-10-22'), true);
  assert.deepEqual(item, original);
  const repeated = { ...item, choreCompletions: [...item.choreCompletions, { id: 'again', personId: 'person-1', completedAt: '2026-10-22T10:00:00Z' }] };
  assert.equal(choreElapsedDays(repeated, new Date('2026-10-22T10:01:00Z')), 0);
  repeated.choreCompletions[1].undoneAt = '2026-10-22T10:02:00Z';
  assert.equal(choreElapsedDays(repeated, new Date('2026-10-22T10:03:00Z')), 1);
  assert.equal(choreElapsedDays(task('legacy', { done: true }), new Date('2026-10-22T12:00:00Z')), undefined);
  assert.equal(choreElapsedDays({ ...item, choreCadence: 'occasional' }, new Date('2026-10-21T21:59:59Z')), 0);
});

const { choreRandomizerItems, chorePickOptions } = require('../app/chore-randomizer-model.ts');
test('chore randomizers keep groups separate and skip deleted, non-actionable and today-completed tasks', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const chores = goal('chore-project', { category: 'chore', children: [task('group', { kind: 'topic', children: [task('nested-routine'), task('nested-occasional', { choreCadence: 'occasional' })] }), task('today', { choreCompletions: [{ id: 'run', personId: 'person-1', completedAt: '2026-10-21T10:00:00Z' }] }), task('yesterday', { choreCompletions: [{ id: 'old', personId: 'person-1', completedAt: '2026-10-20T10:00:00Z' }] }), task('deleted-parent', { deletedAt: now.toISOString(), children: [task('hidden')] }), task('rule', { kind: 'rule' })] });
  const before = clone(chores);
  const items = choreRandomizerItems([chores, goal('unrelated', { children: [task('not-a-chore')] }), goal('deleted-project', { category: 'chore', deletedAt: now.toISOString(), children: [task('hidden-project')] })], now);
  assert.deepEqual(chorePickOptions(items, 'routine').map(item=>item.task.id), ['nested-routine', 'yesterday']);
  assert.deepEqual(chorePickOptions(items, 'occasional').map(item=>item.task.id), ['nested-occasional']);
  assert.deepEqual(items.find(item=>item.task.id==='nested-routine').path, ['chore-project','group','nested-routine']);
  assert.equal(items.find(item=>item.task.id==='nested-routine').goalTitle, 'chore-project');
  assert.deepEqual(chorePickOptions(items, 'routine', 'nested-routine').map(item=>item.task.id), ['yesterday']);
  assert.equal(chorePickOptions(items, 'occasional', 'nested-occasional').length, 1);
  assert.deepEqual(chorePickOptions([], 'routine'), []);
  assert.deepEqual(chores, before);
});
