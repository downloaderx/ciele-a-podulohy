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
test('chores expose legacy rules and topics as tasks at every depth without changing stored content', () => {
  const original = goal('chores', { category: 'chore', kind: 'topic', children: [task('old-rule', { kind: 'rule', children: [task('old-topic', { kind: 'topic' })] })] });
  const view = choreView(original, '2026-10-23');
  assert.equal(view.children[0].kind, 'todo');
  assert.equal(view.children[0].children[0].kind, 'todo');
  assert.equal(view.children[0].title, original.children[0].title);
  assert.equal(original.children[0].kind, 'rule');
  assert.equal(original.children[0].children[0].kind, 'topic');
});
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

const { satisfactionSchedule } = require('../app/satisfaction-schedule.ts');
test('relationship satisfaction reminders occur every third Bratislava calendar day', () => {
  assert.deepEqual(satisfactionSchedule('2026-11-07'), { isOpen: false, nextDay: '2026-11-08' });
  assert.deepEqual(satisfactionSchedule('2026-11-08'), { isOpen: true, nextDay: '2026-11-11' });
  assert.equal(satisfactionSchedule('2026-11-09').isOpen, false);
  assert.deepEqual(satisfactionSchedule('2026-11-10'), { isOpen: false, nextDay: '2026-11-11' });
  assert.deepEqual(satisfactionSchedule('2026-11-11'), { isOpen: true, nextDay: '2026-11-14' });
  assert.equal(satisfactionSchedule('2026-11-14').isOpen, true);
  const openAt = (timestamp) => satisfactionSchedule(gratitudeDay(new Date(timestamp))).isOpen;
  assert.equal(openAt('2026-11-07T22:59:59Z'), false);
  assert.equal(openAt('2026-11-07T23:00:00Z'), true);
  assert.equal(openAt('2026-11-08T22:59:59Z'), true);
  assert.equal(openAt('2026-11-08T23:00:00Z'), false);
});

test('dated satisfaction answers validate, protect peers, clear together and survive old clients', () => {
  const day = gratitudeDay();
  const base = state(); base.goals[0].satisfactionByPerson = { 'person-1': 3, 'person-2': 4 };
  base.goals[0].satisfactionAnsweredOnByPerson = { 'person-1': '2026-10-11', 'person-2': '2026-10-11' };
  assert.equal(isValidState(base), true);
  for (const dates of [{ 'person-1': '2026-02-30' }, { intruder: day }, { 'person-1': 5 }]) { const invalid = clone(base); invalid.goals[0].satisfactionAnsweredOnByPerson = dates; assert.equal(isValidState(invalid), false); }
  const missingScore = clone(base); delete missingScore.goals[0].satisfactionByPerson['person-1']; assert.equal(isValidState(missingScore), false);
  const next = clone(base); next.goals[0].satisfactionByPerson['person-1'] = 5; next.goals[0].satisfactionAnsweredOnByPerson = { 'person-1': day, 'person-2': day };
  const saved = authorizedState(base, next, 'person-1');
  assert.deepEqual(saved.goals[0].satisfactionAnsweredOnByPerson, { 'person-1': day, 'person-2': '2026-10-11' });
  const cleared = clone(saved); delete cleared.goals[0].satisfactionByPerson['person-1']; delete cleared.goals[0].satisfactionAnsweredOnByPerson['person-1'];
  assert.deepEqual(authorizedState(saved, cleared, 'person-1').goals[0].satisfactionAnsweredOnByPerson, { 'person-2': '2026-10-11' });
  const legacy = clone(saved); delete legacy.goals[0].satisfactionAnsweredOnByPerson;
  assert.deepEqual(authorizedState(saved, legacy, 'person-1').goals[0].satisfactionAnsweredOnByPerson, saved.goals[0].satisfactionAnsweredOnByPerson);
  const forged = clone(saved); forged.goals[0].satisfactionAnsweredOnByPerson['person-1'] = '2030-01-01';
  assert.throws(() => authorizedState(saved, forged, 'person-1'), /Dátum hodnotenia/);
  assert.equal(JSON.parse(JSON.stringify(saved)).goals[0].satisfactionAnsweredOnByPerson['person-1'], day);
});
require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
test('satisfaction is available between reminders and does not preselect previous-day answers', () => {
  const { SatisfactionPoll, SatisfactionSummary } = require('../app/satisfaction-poll.tsx');
  const { createElement } = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
  const item = goal('relationship', { satisfactionByPerson: { 'person-1': 4 }, satisfactionAnsweredOnByPerson: { 'person-1': '2026-10-11' } });
  const props = { goal: item, people: defaultPeople, activePersonId: 'person-1', onRate: () => {} };
  const between = renderToStaticMarkup(createElement(SatisfactionPoll, { ...props, day: '2026-11-09' }));
  assert.ok(between.includes('Odpovedať môžeš kedykoľvek'));
  assert.ok(between.includes('Ďalšia pripomienka:'));
  assert.equal((between.match(/aria-pressed="true"/g) || []).length, 0);
  const fresh = renderToStaticMarkup(createElement(SatisfactionPoll, { ...props, day: '2026-11-08' }));
  assert.ok(fresh.includes('Ako si s týmto teraz spokojný/á?')); assert.equal(fresh.includes('aria-pressed="true"'), false); assert.ok(fresh.includes('Naposledy:'));
  item.satisfactionAnsweredOnByPerson['person-1'] = '2026-11-08';
  const answered = renderToStaticMarkup(createElement(SatisfactionPoll, { ...props, day: '2026-11-08' }));
  assert.equal((answered.match(/aria-pressed="true"/g) || []).length, 1); assert.ok(answered.includes('Zrušiť moju dnešnú odpoveď'));
  const summary = renderToStaticMarkup(createElement(SatisfactionSummary, { goal: item, people: defaultPeople }));
  assert.match(summary, /datetime="2026-11-08"/i); assert.ok(summary.includes('4/5'));
});

test('conflict choices can retain different versions of separate fields without losing independent changes', () => {
  const b = state(), l = clone(b), r = clone(b);
  l.goals[0].title = 'Local title'; r.goals[0].title = 'Server title';
  l.goals[0].recurrenceDays = 7; r.goals[0].recurrenceDays = 3;
  r.goals[0].description = 'Independent server note';
  const result = mergeStates(b, l, r, { '/goals/shared/title': 'local', '/goals/shared/recurrenceDays': 'remote' });
  assert.equal(result.conflicts.length, 2);
  assert.equal(result.state.goals[0].title, 'Local title');
  assert.equal(result.state.goals[0].recurrenceDays, 3);
  assert.equal(result.state.goals[0].description, 'Independent server note');
});
test('ranking insertions and removals merge safely but incompatible reorders still need a choice', () => {
  const b = state(); b.goalRankings['person-1'] = ['a','b','c'];
  const l = clone(b), r = clone(b); l.goalRankings['person-1'] = ['local-new','a','b','c']; r.goalRankings['person-1'] = ['a','server-new','b','c'];
  const merged = mergeStates(b,l,r); assert.equal(merged.conflicts.length,0);
  assert.deepEqual(merged.state.goalRankings['person-1'], ['local-new','a','server-new','b','c']);
  assert.deepEqual(mergeStates(b,r,l).state.goalRankings['person-1'], merged.state.goalRankings['person-1']);
  l.goalRankings['person-1'] = ['a','c']; r.goalRankings['person-1'] = ['a','b','c','d'];
  assert.deepEqual(mergeStates(b,l,r).state.goalRankings['person-1'], ['a','c','d']);
  l.goalRankings['person-1'] = ['b','a','c']; r.goalRankings['person-1'] = ['a','c','b'];
  assert.ok(mergeStates(b,l,r).conflicts.some(item=>item.path==='/goalRankings/person-1'));
  assert.deepEqual(mergeStates(b,l,r,{'/goalRankings/person-1':'remote'}).state.goalRankings['person-1'], ['a','c','b']);
});


test('switching profiles preserves every board and rebases an older clean cache to the server', () => {
  const old = state(), remote = clone(old);
  remote.goals.push(goal('new-shared', { children: [task('new-child')] }));
  remote.goals[0].title = 'New server title';
  for (const personId of ['person-1', 'person-2', 'person-1']) {
    const result = mergeStates(visibleState(old, personId), visibleState(old, personId), visibleState(remote, personId));
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(result.state.goals, remote.goals);
    assert.equal(result.state.activePersonId, personId);
  }
});


test('obsolete browser data only bootstraps an empty server and cannot resurrect stale projects on profile changes', () => {
  const { mergeInitialBoard } = require('../app/state-sync.ts');
  const empty = { ...state(), goals: [], goalRankings: {} };
  const legacy = state(), remote = state();
  legacy.goals.push(goal('old-demo')); legacy.goals[0].title = 'Old name';
  remote.goals[0].title = 'New server name';
  for (const id of ['person-1', 'person-2']) {
    const merged = mergeInitialBoard(empty, visibleState(legacy, id), remote, true);
    assert.deepEqual(merged.state.goals, remote.goals); assert.deepEqual(merged.conflicts, []);
    assert.equal(merged.state.activePersonId, id);
  }
  assert.deepEqual(mergeInitialBoard(empty, legacy, empty, true).state.goals, legacy.goals);
  const cached = clone(remote); cached.goals.push(goal('offline-new'));
  assert.ok(mergeInitialBoard(remote, cached, remote, false).state.goals.some(g => g.id === 'offline-new'));
});


test('recovery export retains both profile caches, old backups and malformed versions without including unrelated storage', () => {
  const { collectLocalRecovery } = require('../app/local-recovery.ts');
  const entries = new Map([['acorns-state-person-1', JSON.stringify({ data: state(), base: state() })], ['acorns-state-person-2', '{broken'], ['ciele-state-backups-person-1', '[{"data":{}}]'], ['acorns-recovery-person-2-123', 'old raw data'], ['ciele-goals', '[]'], ['access_token', 'secret'], ['other-app-data', 'private']]);
  const storage = { length: entries.size, key: i => [...entries.keys()][i], getItem: key => entries.get(key) ?? null };
  const result = collectLocalRecovery(storage);
  assert.deepEqual(Object.keys(result).sort(), [...entries.keys()].filter(k => !['access_token', 'other-app-data'].includes(k)).sort());
  assert.deepEqual(result['acorns-state-person-1'].data, state());
  assert.equal(result['acorns-state-person-2'], '{broken');
  assert.equal(result['acorns-recovery-person-2-123'], 'old raw data');
});


test('recovery keeps original versions of both profiles before synchronization and never overwrites them', () => {
  const { preserveLocalRecovery } = require('../app/local-recovery.ts');
  const entries = new Map([['acorns-state-person-1', 'first'], ['acorns-state-person-2', 'second']]);
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  preserveLocalRecovery(storage); entries.set('acorns-state-person-1', 'new'); preserveLocalRecovery(storage);
  assert.equal(entries.get('acorns-recovery-person-1-0'), 'first');
  assert.equal(entries.get('acorns-recovery-person-2-0'), 'second');
  assert.doesNotThrow(() => preserveLocalRecovery({ getItem: () => { throw Error('blocked'); }, setItem: () => {} }));
});


test('conflict preview includes remote-only projects and chore settings while retaining disputed local fields for later choice', () => {
  const { mergeInitialBoard } = require('../app/state-sync.ts');
  const base = { ...state(), goals: [], goalRankings: {} }, local = state(), remote = clone(local);
  local.goals[0].title = 'Old bathroom'; remote.goals[0].title = 'Bathroom';
  remote.goals[0].children = [task('new-chore', { choreCadence: 'occasional', choreIntervalDays: 90, choreWeight: 5 })];
  remote.goals.push(goal('new-project', { category: 'chore', children: [task('nested-work')] }));
  const preview = mergeInitialBoard(base, local, remote, false);
  assert.equal(preview.conflicts.length, 1);
  assert.equal(preview.state.goals.length, 4);
  assert.deepEqual(preview.state.goals[0].children, remote.goals[0].children);
  assert.equal(preview.state.goals[0].title, 'Old bathroom');
  for (const choice of ['local', 'remote']) {
    const resolved = mergeStates(base, preview.state, remote, { '/goals/shared/title': choice });
    assert.equal(resolved.state.goals[0].title, choice === 'local' ? 'Old bathroom' : 'Bathroom');
    assert.equal(resolved.state.goals.length, 4);
    assert.deepEqual(resolved.state.goals[0].children, remote.goals[0].children);
  }
});

test('acknowledged board cache is shared across profiles, validates data and cannot regress to an older server revision', () => {
  const { readAcknowledgedBoard, rememberAcknowledgedBoard } = require('../app/acknowledged-cache.ts');
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  rememberAcknowledgedBoard(storage, { data: state(), revision: 20 });
  const old = state(); old.goals = [];
  rememberAcknowledgedBoard(storage, { data: old, revision: 19 });
  assert.equal(readAcknowledgedBoard(storage).data.goals.length, 3);
  assert.equal(readAcknowledgedBoard(storage).revision, 20);
  values.set('acorns-acknowledged-board', '{broken'); assert.equal(readAcknowledgedBoard(storage), null);
  values.set('acorns-acknowledged-board', JSON.stringify({ data: state(), revision: -1 })); assert.equal(readAcknowledgedBoard(storage), null);
});

test('local checkpoints are bounded, daily, exportable and preserve the current version before a profile change', () => {
  const { archiveLocalVersion, collectLocalRecovery } = require('../app/local-recovery.ts');
  const values = new Map(), storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const day = Date.parse('2026-10-01T12:00:00Z');
  for (let i = 0; i < 20; i++) {
    values.set('acorns-state-person-1', JSON.stringify({ version: i })); archiveLocalVersion(storage, 'person-1', day + i * 86400000);
  }
  assert.equal(JSON.parse(values.get('acorns-history-person-1')).length, 12);
  assert.equal(JSON.parse(values.get('acorns-daily-person-1')).length, 7);
  values.set('acorns-state-person-1', 'latest pending edit');
  archiveLocalVersion(storage, 'person-1', day + 19 * 86400000 + 1000, true);
  assert.equal(JSON.parse(values.get('acorns-history-person-1'))[0].raw, 'latest pending edit');
  const exported = collectLocalRecovery(storage);
  assert.ok(exported['acorns-history-person-1']); assert.ok(exported['acorns-daily-person-1']);
});

test('server history preserves the exact pre-write board, blocks saves on backup failure and exposes authenticated downloads', async () => {
  process.env.APP_AUTH_MODE = 'profiles';
  process.env.SUPABASE_URL = 'https://example.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
  const originalFetch = global.fetch;
  let stored = { data: state(), revision: 7 }, backupFailure = false, saveFailure = false, writes = 0;
  const history = new Map();
  global.fetch = async (rawUrl, init = {}) => {
    const url = new URL(rawUrl), method = init.method ?? 'GET';
    if (url.pathname === '/rest/v1/app_state') {
      if (method === 'POST') {
        if (backupFailure) return Response.json({ error: 'backup unavailable' }, { status: 503 });
        assert.equal(init.headers.Prefer, 'resolution=ignore-duplicates,return=minimal');
        const entry = JSON.parse(init.body);
        if (!history.has(entry.id)) history.set(entry.id, { ...entry, updated_at: '2026-10-21T21:00:00Z' });
        return new Response(null, { status: 201 });
      }
      const id = url.searchParams.get('id');
      if (id === 'eq.main') return Response.json([clone(stored)]);
      if (id === 'like.main:backup:%') return Response.json([...history.values()].filter(v => v.id.startsWith('main:backup:')).sort((a, b) => b.revision - a.revision).map(({ revision, updated_at }) => ({ revision, updated_at })));
      return Response.json(history.has(id?.slice(3)) ? [clone(history.get(id.slice(3)))] : []);
    }
    if (url.pathname === '/rest/v1/rpc/save_app_state') {
      writes++; if (saveFailure) return Response.json({}, { status: 503 });
      const body = JSON.parse(init.body); if (body.p_expected_revision !== stored.revision) return Response.json({ ok: false });
      stored = { data: body.p_data, revision: stored.revision + 1 }; return Response.json({ ok: true, revision: stored.revision });
    }
    throw Error('Unexpected backup request ' + url);
  };
  try {
    const route = require('../app/api/state/route.ts'), backups = require('../app/api/backups/route.ts');
    const request = (data, revision = 7) => new Request('https://foxies.test/api/state', { method: 'PUT', headers: { origin: 'https://foxies.test' }, body: JSON.stringify({ data, revision }) });
    jar.clear(); assert.equal((await backups.GET(new Request('https://foxies.test/api/backups'))).status, 401);
    jar.set('acorns-profile', 'person-1');
    assert.equal((await route.GET(new Request('https://foxies.test/api/state', { headers: { 'x-acorns-person-id': 'person-2' } }))).status, 409);
    assert.equal((await route.PUT(new Request('https://foxies.test/api/state', { method: 'PUT', headers: { origin: 'https://foxies.test', 'x-acorns-person-id': 'person-2' }, body: JSON.stringify({ data: state(), revision: 7 }) }))).status, 409);
    assert.equal(writes, 0); assert.equal(history.size, 0);
    assert.equal((await backups.POST(new Request('https://foxies.test/api/backups', { method: 'POST', headers: { origin: 'https://attacker.test' } }))).status, 403);
    const original = clone(stored.data), changed = clone(original); changed.goals[0].title = 'New bathroom';
    backupFailure = true; assert.equal((await route.PUT(request(changed))).status, 503); assert.equal(writes, 0); assert.deepEqual(stored.data, original);
    backupFailure = false; saveFailure = true; assert.equal((await route.PUT(request(changed))).status, 503); assert.deepEqual(history.get('main:backup:7').data, original); assert.equal(stored.revision, 7);
    saveFailure = false; assert.equal((await route.PUT(request(changed))).status, 200); assert.equal(stored.revision, 8);
    assert.deepEqual(history.get('main:backup:7').data, original);
    const list = await (await backups.GET(new Request('https://foxies.test/api/backups'))).json(); assert.deepEqual(list.backups.map(b => b.revision), [7]);
    jar.set('acorns-profile', 'person-2');
    const download = await (await backups.GET(new Request('https://foxies.test/api/backups?revision=7'))).json();
    assert.equal(download.data.activePersonId, 'person-2'); assert.deepEqual(download.data.goals, original.goals); assert.equal(stored.data.goals[0].title, 'New bathroom');
    assert.deepEqual(readTransferData(download).goals, original.goals);
    assert.equal((await backups.GET(new Request('https://foxies.test/api/backups?revision=main'))).status, 400);
    assert.equal((await backups.GET(new Request('https://foxies.test/api/backups?revision=999'))).status, 404);
    const post = () => backups.POST(new Request('https://foxies.test/api/backups', { method: 'POST', headers: { origin: 'https://foxies.test' } }));
    assert.equal((await post()).status, 200); assert.ok(history.has('main:backup:8')); const saved = clone(history.get('main:backup:8'));
    assert.equal((await post()).status, 200); assert.deepEqual(history.get('main:backup:8'), saved);
    const beforeConflict = writes; assert.equal((await route.PUT(request(changed, 7))).status, 409); assert.equal(writes, beforeConflict);
  } finally { global.fetch = originalFetch; process.env.APP_AUTH_MODE = 'supabase'; jar.clear(); }
});

test('large local histories respect the storage budget and checkpoint the previous live copy', () => {
  const { archiveLocalVersion } = require('../app/local-recovery.ts');
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const now = Date.parse('2026-10-21T12:00:00Z');
  for (let i = 0; i < 20; i++) {
    values.set('acorns-state-person-1', 'version-' + i + 'x'.repeat(100000)); archiveLocalVersion(storage, 'person-1', now + i * 86400000);
  }
  assert.ok(JSON.parse(values.get('acorns-history-person-1')).reduce((n, v) => n + v.raw.length, 0) <= 300000);
  assert.ok(JSON.parse(values.get('acorns-daily-person-1')).reduce((n, v) => n + v.raw.length, 0) <= 200000);
  values.set('acorns-state-person-1', 'new live data');
  archiveLocalVersion(storage, 'person-1', now + 20 * 86400000, true, 'previous live data');
  assert.equal(JSON.parse(values.get('acorns-history-person-1'))[0].raw, 'previous live data');
  assert.equal(values.get('acorns-state-person-1'), 'new live data');
});

test('separating pantry preserves every task ID, nested history and unrelated spaces', () => {
  const { splitPantry } = require('../app/chores-workspace-model.ts');
  const recorded = { id: 'pantry-event', personId: 'person-1', completedAt: '2026-11-04T12:00:00Z' };
  const kitchen = goal('kitchen-split', { category: 'chore', title: 'Kuchyňa (a špajza)', children: [task('sink'), task('shelf', { children: [task('pantry-box', { title: 'Špajza utrieť', choreCompletions: [recorded], children: [task('pantry-inner')] })] }), task('deleted-pantry', { title: 'Špajza stará', deletedAt: '2026-11-01T12:00:00Z' })] });
  const privatePantry = goal('private-pantry', { category: 'chore', title: 'Špajza', spaceId: 'person-2' });
  const original = [kitchen, privatePantry];
  const next = splitPantry(original, kitchen.id, 'new-pantry', 'person-1');
  const flatten = (items) => items.flatMap(item => [item.id, ...flatten(item.children)]);
  assert.deepEqual(flatten(next).filter(id => id !== 'new-pantry').sort(), flatten(original).sort());
  assert.equal(next.find(item => item.id === kitchen.id).title, 'Kuchyňa');
  assert.deepEqual(next.find(item => item.id === 'new-pantry').children[0].choreCompletions, [recorded]);
  assert.equal(next.find(item => item.id === 'new-pantry').spaceId, 'shared');
  assert.equal(next.find(item => item.id === privatePantry.id), privatePantry);
  assert.equal(kitchen.children[1].children.length, 1);
  assert.equal(splitPantry(next, kitchen.id, 'second-pantry', 'person-1'), next);
});

test('pantry separation does nothing when there are no pantry tasks or an ID collision', () => {
  const { splitPantry } = require('../app/chores-workspace-model.ts');
  const clean = [goal('kitchen', { category: 'chore', title: 'Kuchyňa', children: [task('sink')] })];
  assert.equal(splitPantry(clean, 'kitchen', 'pantry', 'person-1'), clean);
  const withPantry = [goal('kitchen', { category: 'chore', title: 'Kuchyňa', children: [task('pantry', { title: 'Špajza' })] })];
  assert.equal(splitPantry(withPantry, 'kitchen', 'kitchen', 'person-1'), withPantry);
});

test('server accepts pantry moves without duplicate tombstones and preserves both actors history', () => {
  const { splitPantry } = require('../app/chores-workspace-model.ts');
  const previous = state();
  previous.goals[0] = goal('kitchen-server', { title: 'Kuchyňa (a špajza)', category: 'chore', children: [task('keep'), task('move', { title: 'Špajza', choreCompletions: [{ id: 'old-run', personId: 'person-2', completedAt: '2026-11-04T12:00:00Z' }], children: [task('nested-move')] })] });
  const incoming = clone(previous); incoming.goals = splitPantry(incoming.goals, 'kitchen-server', 'pantry-server', 'person-1');
  const saved = authorizedState(previous, incoming, 'person-1');
  assert.equal(isValidState(saved), true);
  assert.equal(saved.goals.find(g => g.id === 'kitchen-server').children.some(t => t.id === 'move'), false);
  const moved = saved.goals.find(g => g.id === 'pantry-server').children[0];
  assert.equal(moved.id, 'move'); assert.equal(moved.deletedAt, undefined);
  assert.equal(moved.choreCompletions[0].personId, 'person-2');
  assert.equal(moved.children[0].id, 'nested-move');
});

test('moving a child out of a removed parent keeps a single live child and a recoverable parent', () => {
  const previous = state(); previous.goals[0].children = [task('old-parent', { children: [task('moved-child'), task('retained-child')] })];
  const incoming = clone(previous); incoming.goals[0].children = [task('moved-child')];
  const saved = authorizedState(previous, incoming, 'person-1');
  assert.equal(isValidState(saved), true);
  assert.equal(saved.goals[0].children.find(t => t.id === 'moved-child').deletedAt, undefined);
  const parent = saved.goals[0].children.find(t => t.id === 'old-parent');
  assert.ok(parent.deletedAt); assert.deepEqual(parent.children.map(t => t.id), ['retained-child']);
});

test('background merge chooses server startup fields while keeping independent work and executions', () => {
  const { mergeInBackground } = require('../app/state-sync.ts');
  const base = state(), local = clone(base), remote = clone(base);
  local.goals[0].title = 'Cached name'; remote.goals[0].title = 'Server name';
  local.goals[0].children = [task('local-new')]; remote.goals[0].children = [task('remote-new')];
  const merged = mergeInBackground(base, local, remote, 'remote');
  assert.equal(merged.state.goals[0].title, 'Server name');
  assert.deepEqual(merged.state.goals[0].children.map(t => t.id).sort(), ['local-new', 'remote-new']);
  assert.equal(isValidState(merged.state), true); assert.ok(merged.conflicts.length);
});

test('background deletion versus editing keeps the item live and merges both sides descendants', () => {
  const { mergeInBackground } = require('../app/state-sync.ts');
  const base = state(); base.goals[0].children = [task('edited')];
  const local = clone(base), remote = clone(base);
  local.goals[0].children[0].deletedAt = '2026-11-05T12:00:00Z';
  local.goals[0].children[0].children = [task('local-descendant')];
  remote.goals[0].children[0].title = 'New remote text';
  remote.goals[0].children[0].children = [task('remote-descendant')];
  const merged = mergeInBackground(base, local, remote, 'local');
  const edited = merged.state.goals[0].children[0];
  assert.equal(edited.deletedAt, undefined); assert.equal(edited.title, 'New remote text');
  assert.deepEqual(edited.children.map(t => t.id).sort(), ['local-descendant', 'remote-descendant']);
  assert.equal(isValidState(merged.state), true);
});

test('background moves preserve a concurrent execution once at the new location', () => {
  const { mergeInBackground } = require('../app/state-sync.ts');
  const base = state(); base.goals[0].children = [task('moved-work')];
  const local = clone(base), remote = clone(base);
  const moved = local.goals[0].children.pop(); local.goals.push(goal('new-area', { children: [moved] }));
  remote.goals[0].children[0].choreCompletions = [{ id: 'partner-run', personId: 'person-2', completedAt: '2026-11-05T12:00:00Z' }];
  const merged = mergeInBackground(base, local, remote, 'local').state;
  assert.equal(isValidState(merged), true);
  assert.equal(merged.goals[0].children.length, 0);
  assert.equal(merged.goals.find(g => g.id === 'new-area').children[0].choreCompletions[0].id, 'partner-run');
  assert.equal(isValidState(authorizedState(remote, merged, 'person-1')), true);
});

test('two simultaneous moves keep all areas and only one instance of the moved task', () => {
  const { mergeInBackground } = require('../app/state-sync.ts');
  const base = state(); base.goals[0].children = [task('double-move')];
  const local = clone(base), remote = clone(base);
  local.goals.push(goal('local-area', { children: local.goals[0].children.splice(0) }));
  remote.goals.push(goal('remote-area', { children: remote.goals[0].children.splice(0) }));
  const merged = mergeInBackground(base, local, remote, 'local').state;
  assert.equal(isValidState(merged), true); assert.equal(merged.goals.length, 5);
  assert.equal(merged.goals.find(g => g.id === 'local-area').children[0].id, 'double-move');
  assert.equal(merged.goals.find(g => g.id === 'remote-area').children.length, 0);
});

test('automatic ranking conflicts retain every ID without repeated entries', () => {
  const { mergeInBackground } = require('../app/state-sync.ts');
  const base = state(); base.goalRankings['person-1'] = ['a', 'b'];
  const local = clone(base), remote = clone(base);
  local.goalRankings['person-1'] = ['b', 'a', 'local-new']; remote.goalRankings['person-1'] = ['a', 'b', 'remote-new'];
  assert.deepEqual(mergeInBackground(base, local, remote, 'remote').state.goalRankings['person-1'], ['a', 'b', 'remote-new', 'local-new']);
});

test('automatic merge archives both alternatives and detects a full local cache', () => {
  const { archiveMergeVersions } = require('../app/local-recovery.ts');
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const base = state(), local = clone(base), remote = clone(base); local.goals[0].title = 'Local alternative'; remote.goals[0].title = 'Server alternative';
  assert.equal(archiveMergeVersions(storage, 'person-1', base, local, remote), true);
  const raw = values.get('acorns-history-person-1'); assert.ok(raw.includes('Local alternative')); assert.ok(raw.includes('Server alternative'));
  assert.equal(JSON.parse(JSON.parse(raw)[0].raw).data.goals[0].title, 'Local alternative');
  assert.equal(archiveMergeVersions({ getItem: () => null, setItem: () => { throw Error('Quota'); } }, 'person-1', base, local, remote), false);
});

 test('downloaded, server and legacy rescue backups retain all restorable data', () => {
 const { readTransferData } = require('../app/page-model.ts');
 const original = state(); original.gratitudeEntries = [];
 original.goals[0].children = [task('laundry', { completions: [{ id: 'done', personId: 'person-1', completedAt: '2026-11-05T10:00:00.000Z' }] })];
 for (const payload of [original, {version:1,data:original}, {version:1,revision:42,data:original}, {version:1,current:original,localVersions:[]}]) {
 const restored = readTransferData(JSON.parse(JSON.stringify(payload)));
 assert.deepEqual(restored, original);
 assert.equal(isValidState(restored), true);
 }
 assert.equal(readTransferData({current:{goals:[]}}), null);
 const invalid=state(); invalid.goals[0].children=null;
 assert.equal(isValidState(readTransferData({current:invalid})), false);
 });


test('permanent trash deletion erases content and survives stale clients and backup imports', () => {
  const { purgeTask } = require('../app/trash.ts');
  const before = state(); before.goals[0].deletedAt = '2026-11-01T10:00:00Z';
  before.goals[0].description = 'Private old description';
  before.goals[0].children = [task('erased-child', {title:'Old child title', choreCompletions:[{id:'old-run',personId:'person-1',completedAt:'2026-10-30T10:00:00Z'}]})];
  const requested=clone(before); requested.goals[0]=purgeTask(requested.goals[0], '2026-11-05T10:00:00Z');
  assert.equal(isValidState(requested),true);
  const saved=authorizedState(before,requested,'person-1');
  assert.ok(saved.goals[0].purgedAt);
  assert.equal(saved.goals[0].title,''); assert.equal(saved.goals[0].description,'');
  assert.equal(saved.goals[0].children[0].title,'');
  assert.equal(saved.goals[0].children[0].choreCompletions,undefined);
  assert.equal(stableJson(saved.goals.slice(1)),stableJson(before.goals.slice(1)));
  const stale=clone(before); stale.goals[0].deletedAt=undefined;
  stale.goals[0].children[0].title='Resurrected title';
  const resaved=authorizedState(saved,stale,'person-2');
  assert.equal(resaved.goals[0].title,''); assert.ok(resaved.goals[0].deletedAt);
  assert.equal(resaved.goals[0].children[0].title,'');
  const removed=clone(saved); removed.goals=removed.goals.slice(1);
  assert.ok(authorizedState(saved,removed,'person-1').goals.find(g=>g.id==='shared').purgedAt);
  for (const [local,remote] of [[stale,saved],[saved,stale]]) {
    const merged=mergeStates(before,local,remote,'local',true).state;
    assert.ok(merged.goals[0].purgedAt); assert.ok(merged.goals[0].deletedAt);
    assert.equal(merged.goals[0].title,''); assert.equal(merged.goals[0].children[0].title,'');
    assert.equal(isValidState(merged),true);
  }
});

test('permanent deletion is limited to trashed items on editable boards', () => {
  const { purgeTask } = require('../app/trash.ts');
  const before=state(), attempt=clone(before);
  attempt.goals[0]=purgeTask(attempt.goals[0],'2026-11-05T10:00:00Z');
  assert.throws(()=>authorizedState(before,attempt,'person-1'),/iba položku v koši/);
  before.goals[2].deletedAt='2026-11-01T10:00:00Z';
  const hidden=clone(before); hidden.goals[2]=purgeTask(hidden.goals[2],'2026-11-05T10:00:00Z');
  assert.throws(()=>authorizedState(before,hidden,'person-1'),/iba na prezeranie/);
  const nested=state(); nested.goals[0].children=[task('trashed-child',{deletedAt:'2026-11-01T10:00:00Z'}),task('live-child')];
  const change=clone(nested); change.goals[0].children[0]=purgeTask(change.goals[0].children[0],'2026-11-05T10:00:00Z');
  const saved=authorizedState(nested,change,'person-1');
  assert.ok(saved.goals[0].children[0].purgedAt); assert.equal(saved.goals[0].children[1].title,'live-child');
  assert.equal(saved.goals[0].title,nested.goals[0].title);
  const invalid=state(); invalid.goals[0].purgedAt='bad date'; assert.equal(isValidState(invalid),false);
});


test('bulk trash selection removes only topmost selected items and skips deleted content', () => {
  const { selectedTrashRoots } = require('../app/trash.ts');
  const area=goal('area',{children:[task('parent',{children:[task('child')]}),task('sibling'),task('deleted',{deletedAt:'2026-11-01T10:00:00Z'})]});
  assert.deepEqual(selectedTrashRoots(area,['parent','child','sibling','deleted','missing']),['parent','sibling']);
  assert.deepEqual(selectedTrashRoots(area,['area','child']),['area']);
  assert.deepEqual(selectedTrashRoots(area,['child']),['child']);
  assert.deepEqual(selectedTrashRoots(area,[]),[]);
  assert.deepEqual(selectedTrashRoots({...area,deletedAt:'2026-11-01T10:00:00Z'},['area','child']),[]);
});


test('chore menu balances current care and use without activity hiding neglected work', () => {
  const { rankChoreAreas } = require('../app/chores-menu-model.ts');
  const now=new Date('2026-11-06T12:00:00Z');
  const done=(id)=>task(id,{choreCompletions:[{id:'run-'+id,personId:'person-1',completedAt:'2026-11-05T12:00:00Z'}]});
  const area=(id,children)=>goal(id,{category:'chore',children});
  const full=area('full',[done('full-task')]);
  const mostly=area('mostly',[done('m1'),done('m2'),done('m3'),task('m4')]);
  const mixed=area('mixed',[done('x1'),task('x2')]);
  const neglected=area('neglected',[task('n1')]);
  const busyLog=Array.from({length:80},(_,i)=>({id:'edit-'+i,action:'upravil(a) poznámku',target:'neglected',actorId:'person-1',createdAt:'2026-11-05T12:00:00Z',spaceId:'shared'}));
  const input=[neglected,mixed,mostly,full], original=clone(input);
  const ranked=rankChoreAreas(input,busyLog,now);
  assert.deepEqual(ranked.map(x=>x.goal.id),['full','mostly','mixed','neglected']);
  assert.equal(ranked.at(-1).score,0); assert.equal(ranked[0].score,1);
  assert.deepEqual(input,original);
  const same=area('same',[done('s1'),task('s2')]);
  const edits=[{id:'edit',action:'zmenil(a) náročnosť chores',target:'s2',actorId:'person-1',createdAt:'2026-11-05T12:00:00Z'}];
  assert.equal(rankChoreAreas([mixed,same],edits,now)[0].goal.id,'same');
});

test('chore menu uses reminder intervals, ignores undone and future activity, and keeps empty areas neutral', () => {
  const { rankChoreAreas } = require('../app/chores-menu-model.ts');
  const now=new Date('2026-11-06T12:00:00Z');
  const oldRun={id:'old',personId:'person-1',completedAt:'2026-10-01T12:00:00Z'};
  const scheduled=goal('scheduled',{category:'chore',children:[task('occasional',{choreCadence:'occasional',choreIntervalDays:90,choreCompletions:[oldRun]})]});
  const overdue=goal('overdue',{category:'chore',children:[task('late',{choreCadence:'occasional',choreIntervalDays:5,choreCompletions:[oldRun]})]});
  const undone=goal('undone',{category:'chore',children:[task('undo',{choreCompletions:[{id:'u',personId:'person-1',completedAt:'2026-11-05T12:00:00Z',undoneAt:'2026-11-05T13:00:00Z'},{id:'future',personId:'person-1',completedAt:'2026-12-01T12:00:00Z'}]})]});
  const empty=goal('empty',{category:'chore'});
  const ranked=rankChoreAreas([empty,overdue,undone,scheduled],[],now);
  assert.equal(ranked[0].goal.id,'scheduled'); assert.equal(ranked[0].maintained,1);
  assert.equal(ranked.find(x=>x.goal.id==='overdue').occasionalAttention,1);
  assert.ok(ranked.find(x=>x.goal.id==='overdue').maxOverdueDays>0);
  assert.equal(ranked.find(x=>x.goal.id==='undone').activity,0);
  assert.equal(ranked.at(-1).total,0);
  const deleted=clone(overdue); deleted.deletedAt='2026-11-05T12:00:00Z';
  assert.equal(rankChoreAreas([deleted],[],now).length,0);
});

test('chore menu matches old edit logs only to unambiguous titles on the same board', () => {
  const { rankChoreAreas } = require('../app/chores-menu-model.ts');
  const now=new Date('2026-11-06T12:00:00Z');
  const areas=[goal('a',{category:'chore',children:[task('a1',{title:'Podlaha'})]}),goal('b',{category:'chore',children:[task('b1',{title:'Podlaha'}),task('b2',{title:'Nový názov'})]})];
  const log=(id,target,action='upravil(a) poznámku',extra={})=>({id,target,action,actorId:'person-1',createdAt:'2026-11-05T12:00:00Z',...extra});
  const events=[log('ambiguous','Podlaha'),log('private','a','upravil(a) poznámku',{spaceId:'person-1'}),log('rename','Starý názov → Nový názov','premenil(a)'),log('interval','Nový názov · každých 30 dní','zmenil(a) interval chores'),log('old','a','upravil(a) poznámku',{createdAt:'2026-01-01T12:00:00Z'}),log('future','a','upravil(a) poznámku',{createdAt:'2026-12-01T12:00:00Z'})];
  const ranked=rankChoreAreas(areas,[...events,events[2]],now);
  assert.equal(ranked.find(x=>x.goal.id==='a').activity,0);
  assert.equal(ranked.find(x=>x.goal.id==='b').activity,2);
  assert.deepEqual(rankChoreAreas(areas,[],now).map(x=>x.goal.id),rankChoreAreas([...areas].reverse(),[],now).map(x=>x.goal.id));
});


test('one-off lists create independent shared checklists with no chore recurrence', () => {
  const { createTodoList, createTodoItem } = require('../app/lists-model.ts');
  const { normalizeGoals, normalizeGoalCategory } = require('../app/page-model.ts');
  const list=createTodoList('list','  Vybaviť  ','person-1','lavender');
  assert.equal(list.title,'Vybaviť'); assert.equal(list.category,'list'); assert.equal(list.spaceId,'shared');
  assert.equal(normalizeGoalCategory('list'),'list');
  const item=createTodoItem('one-off',' Zavolať do servisu ','person-1');
  list.children=[{...item,done:true}];
  const normalized=normalizeGoals([list],clone(defaultPeople))[0];
  assert.equal(normalized.category,'list'); assert.equal(normalized.noteColor,'lavender');
  assert.equal(normalized.children[0].done,true); assert.equal(normalized.recurrenceDays,undefined);
  assert.equal(item.choreCadence,undefined); assert.equal(item.choreCompletions,undefined);
  assert.equal(createTodoList('bad',' ','person-1'),null); assert.equal(createTodoItem('bad',' ','person-1'),null);
  assert.equal(createTodoList('bad','x'.repeat(101),'person-1'),null);
});

test('lists validate and survive backups, profile switching, independent edits and shared authorization', () => {
  const { createTodoList, createTodoItem } = require('../app/lists-model.ts');
  const { readTransferData } = require('../app/page-model.ts');
  const base=state(), list=createTodoList('list','Nákupy','person-1','butter');
  list.children=[createTodoItem('milk','Mlieko','person-1')]; base.goals.push(list);
  assert.equal(isValidState(base),true);
  const copy=readTransferData(JSON.parse(JSON.stringify({version:1,data:base})));
  assert.equal(copy.goals.at(-1).noteColor,'butter');
  assert.ok(visibleState(base,'person-2').goals.find(g=>g.id==='list'));
  const local=clone(base), remote=clone(base);
  local.goals.at(-1).children.push(createTodoItem('bread','Chlieb','person-1'));
  remote.goals.at(-1).children[0].done=true; remote.goals.at(-1).noteColor='mint';
  const merged=mergeStates(base,local,remote).state;
  const saved=authorizedState(base,merged,'person-1');
  assert.equal(saved.goals.find(g=>g.id==='list').children.length,2); assert.equal(saved.goals.find(g=>g.id==='list').children[0].done,true);
  assert.equal(saved.goals.find(g=>g.id==='list').noteColor,'mint');
  const second=clone(saved); second.goals.find(g=>g.id==='list').children[0].done=false;
  assert.equal(authorizedState(saved,second,'person-2').goals.find(g=>g.id==='list').children[0].done,false);
  const invalid=clone(base); invalid.goals.at(-1).noteColor='invalid'; assert.equal(isValidState(invalid),false);
});

test('list trash retains completed tasks and note color and can be permanently cleared', () => {
  const { createTodoList, createTodoItem } = require('../app/lists-model.ts');
  const { purgeTask } = require('../app/trash.ts');
  const original=state(); const list=createTodoList('list','Cestovanie','person-1','sky');
  list.children=[{...createTodoItem('ticket','Lístky','person-1'),done:true}]; original.goals.push(list);
  const requested=clone(original); requested.goals=removeTask(requested.goals,'list');
  const saved=authorizedState(original,requested,'person-1');
  const deleted=saved.goals.find(g=>g.id==='list');
  assert.ok(deleted.deletedAt); assert.equal(deleted.noteColor,'sky'); assert.equal(deleted.children[0].done,true);
  const purged=clone(saved); purged.goals=purged.goals.map(g=>g.id==='list'?purgeTask(g,'2026-11-06T10:00:00Z'):g);
  const erased=authorizedState(saved,purged,'person-1').goals.find(g=>g.id==='list');
  assert.equal(erased.title,''); assert.ok(erased.purgedAt); assert.equal(isValidState({...saved,goals:saved.goals.map(g=>g.id==='list'?erased:g)}),true);
});


test('Rulebook collects live relationship rules in the selected board without moving tasks', () => {
  const { collectRules, createRule } = require('../app/rulebook-model.ts');
  const topic = goal('topic-rules', { children: [task('rule-1', {kind:'rule'}), task('deleted-parent', {deletedAt:'2026-11-01T00:00:00Z', children:[task('hidden-rule',{kind:'rule'})]}), task('todo-1')] });
  const shared = createRule('new-rule','  Naša dohoda  ','person-1','shared');
  const privateRule = createRule('private-rule','Osobné','person-2','person-2');
  const input = [topic, shared, privateRule, goal('chore-rule', { category:'chore', children:[task('not-a-relationship-rule',{kind:'rule'})] })];
  const before = clone(input);
  assert.deepEqual(collectRules(input,'shared'), [{id:'rule-1',text:'rule-1',sourceId:'topic-rules',sourceTitle:'topic-rules'}, {id:'new-rule',text:'Naša dohoda'}]);
  assert.deepEqual(input,before);
  assert.equal(collectRules(input,'person-2')[0].id,'private-rule');
  assert.equal(createRule('empty','  ','person-1','shared'),null);
  assert.equal(createRule('long','a'.repeat(4001),'person-1','shared'),null);
});

test('Rulebook randomizer handles empty and single pools and avoids immediate repeats', () => {
  const { pickRule } = require('../app/rulebook-model.ts');
  assert.equal(pickRule([]),undefined);
  const a={id:'a',text:'A'}, b={id:'b',text:'B'};
  assert.equal(pickRule([a],'a'),a);
  for(let i=0;i<20;i++) assert.equal(pickRule([a,b],'a'),b);
});

test('shared Rulebook survives validation, normalization, profile authorization and independent merges', () => {
  const { createRule, collectRules } = require('../app/rulebook-model.ts');
  const base=state(), local=clone(base), remote=clone(base);
  local.goals.push(createRule('rule-a','Dohoda A','person-1','shared'));
  remote.goals.push(createRule('rule-b','Dohoda B','person-2','shared'));
  assert.equal(isValidState(local),true);
  const merged=mergeStates(base,local,remote);
  assert.deepEqual(merged.conflicts,[]);
  const result=authorizedState(remote,merged.state,'person-1');
  assert.equal(isValidState(result),true);
  assert.deepEqual(collectRules(result.goals,'shared').map(rule=>rule.id).sort(),['rule-a','rule-b']);
  assert.equal(collectRules(authorizedState(result,{...result,activePersonId:'person-2'},'person-2').goals,'shared').length,2);
  const malicious=clone(result);malicious.goals.push(createRule('private-rule-attack','Cudzie','person-1','person-2'));
  assert.throws(()=>authorizedState(result,malicious,'person-1'),/iba na prezeranie/);
});


test('quick chore undo is limited to the latest own execution for thirty seconds', () => {
  const { quickUndoCompletion } = require('../app/chore-quick-undo.ts');
  const now=Date.parse('2026-11-07T12:00:00Z');
  const entry=(id,personId,age,extra={})=>({id,personId,completedAt:new Date(now-age).toISOString(),...extra});
  const t=task('quick-undo',{choreCompletions:[entry('mine','person-1',1000),entry('older','person-1',40000)]});
  assert.equal(quickUndoCompletion(t,'person-1',now).id,'mine');
  assert.equal(quickUndoCompletion(t,'person-2',now),undefined);
  assert.equal(quickUndoCompletion(t,'person-1',now+29000),undefined);
  assert.equal(quickUndoCompletion(t,'person-1',now-2000),undefined);
  assert.equal(quickUndoCompletion({...t,choreCompletions:[...t.choreCompletions,entry('peer','person-2',0)]},'person-1',now),undefined);
  assert.equal(quickUndoCompletion({...t,choreCompletions:t.choreCompletions.map(e=>({...e,undoneAt:new Date(now).toISOString()}))},'person-1',now),undefined);
  assert.equal(quickUndoCompletion(task('empty'),'person-1',now),undefined);
});


const resource=(id,kind='note',content='Naše poznámky')=>({id,kind,title:'Podklad '+id,content,ownerId:'person-1',createdAt:'2026-11-08T10:00:00Z'});
test('project resources validate safe links, notes and files and survive independent merge and old clients',()=>{
  const {validProjectResources,resourceUrl}=require('../app/project-resources-model.ts');
  assert.equal(resourceUrl('javascript:alert(1)'),undefined);assert.equal(resourceUrl('file:///C:/secret.txt'),undefined);assert.equal(resourceUrl('https://user:pass@example.com'),undefined);
  assert.equal(validProjectResources([resource('a'),resource('b','document','https://example.com/document')]),true);
  assert.equal(validProjectResources([resource('a'),resource('a')]),false);
  assert.equal(validProjectResources([resource('a','link','data:text/html,test')]),false);
  const base=state(),a=clone(base),b=clone(base);a.goals[0].resources=[resource('a')];b.goals[0].resources=[resource('b','link','https://example.com')];
  const merged=mergeStates(base,a,b);assert.deepEqual(merged.conflicts,[]);assert.equal(merged.state.goals[0].resources.length,2);assert.equal(isValidState(merged.state),true);
  const saved=authorizedState(base,merged.state,'person-1'),oldClient=clone(saved);delete oldClient.goals[0].resources;
  assert.deepEqual(authorizedState(saved,oldClient,'person-1').goals[0].resources,saved.goals[0].resources);
  const removed=clone(saved);removed.goals[0].resources[0].deletedAt='2026-11-08T11:00:00Z';
  const after=authorizedState(saved,removed,'person-1');assert.ok(after.goals[0].resources[0].deletedAt);
  assert.deepEqual(readTransferData({data:after}).goals[0].resources,after.goals[0].resources);
  const privateBoard=state();privateBoard.goals[2].resources=[resource('private')];const attack=clone(privateBoard);attack.goals[2].resources[0].content='Changed';
  assert.throws(()=>authorizedState(privateBoard,attack,'person-1'),/iba na prezeranie/);
});

test('file resources reject invalid metadata and purge clears project attachments',()=>{
  const {validProjectResources}=require('../app/project-resources-model.ts');const {purgeTask}=require('../app/trash.ts');
  const file={...resource('12345678-1234-1234-1234-123456789abc','document',''),localPath:'C:/Docs/Test.pdf',file:{key:'a'.repeat(64)+'/12345678-1234-1234-1234-123456789abc',name:'Test.pdf',size:15,mime:'application/pdf'}};
  assert.equal(validProjectResources([file]),true);
  for(const f of [{...file,file:{...file.file,size:3000001}},{...file,file:{...file.file,name:'test.exe',mime:undefined}},{...file,file:{...file.file,key:'../private'}},{...file,localPath:'bad\npath'}])assert.equal(validProjectResources([f]),false);
  const purged=purgeTask(goal('purge-project',{deletedAt:'2026-11-08T11:00:00Z',resources:[file]}),'2026-11-08T12:00:00Z');assert.equal(purged.resources,undefined);
});

test('project file API stores private files with board backups and restricts upload and download',async()=>{
  process.env.APP_AUTH_MODE='profiles';process.env.SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service';
  const originalFetch=global.fetch;let stored={data:state(),revision:17},bucketExists=false,publicBucket=false,collision=true,backupFailure=false;const files=new Map(),history=[];
  global.fetch=async(raw,init={})=>{const url=new URL(raw),method=init.method??'GET';
    if(url.pathname==='/rest/v1/app_state') { if(method==='POST'){if(backupFailure)return new Response(null,{status:503});history.push(JSON.parse(init.body));return new Response(null,{status:201});} return Response.json([clone(stored)]); }
    if(url.pathname==='/rest/v1/rpc/save_app_state'){const body=JSON.parse(init.body);if(collision){collision=false;stored.revision++;stored.data.goals[0].description='Concurrent edit';return Response.json({ok:false});}stored={data:body.p_data,revision:stored.revision+1};return Response.json({ok:true,revision:stored.revision});}
    if(url.pathname==='/storage/v1/bucket/foxies-project-files')return bucketExists?Response.json({public:publicBucket}):new Response(null,{status:404});
    if(url.pathname==='/storage/v1/bucket'&&method==='POST'){const body=JSON.parse(init.body);assert.equal(body.public,false);assert.equal(body.file_size_limit,3000000);bucketExists=true;return Response.json({});}
    if(url.pathname.startsWith('/storage/v1/object/authenticated/foxies-project-files/')){const key=url.pathname.split('/foxies-project-files/')[1];return files.has(key)?new Response(files.get(key)):new Response(null,{status:404});}
    if(url.pathname.startsWith('/storage/v1/object/foxies-project-files/')&&method==='POST'){assert.equal(init.headers['x-upsert'],'false');files.set(url.pathname.split('/foxies-project-files/')[1],init.body);return Response.json({});}
    throw Error('Unexpected test request '+url.pathname);
  };
  try{
    const api=require('../app/api/project-files/route.ts');const upload=(goalId='shared',name='Test.pdf',body='test-document',extra={})=>{const form=new FormData();form.set('goalId',goalId);form.set('file',new File([body],name));form.set('localPath','C:/Docs/Test.pdf');return new Request('https://foxies.test/api/project-files',{method:'POST',headers:{origin:'https://foxies.test',...extra},body:form});};
    jar.clear();assert.equal((await api.POST(upload())).status,401);jar.set('acorns-profile','person-1');
    assert.equal((await api.POST(upload('private-2'))).status,403);assert.equal(files.size,0);
    assert.equal((await api.POST(upload('shared','bad.exe'))).status,400);
    assert.equal((await api.POST(upload('shared','big.pdf','a'.repeat(3000001)))).status,413);
    assert.equal((await api.POST(upload('shared','Test.pdf','test',{'x-acorns-person-id':'person-2'}))).status,409);
    const response=await api.POST(upload());assert.equal(response.status,200);const {resource:attached}=await response.json();assert.equal(attached.file.name,'Test.pdf');assert.equal(attached.localPath,'C:/Docs/Test.pdf');assert.equal(isValidState(stored.data),true);assert.equal(stored.data.goals[0].description,'Concurrent edit');assert.equal(history.length,2);assert.equal(files.size,1);
    const get=()=>api.GET(new Request('https://foxies.test/api/project-files?goalId=shared&resourceId='+attached.id));
    const download=await get();assert.equal(download.status,200);assert.equal(await download.text(),'test-document');assert.match(download.headers.get('content-disposition'),/attachment/);
    jar.set('acorns-profile','person-2');assert.equal((await get()).status,200);
    stored.data.goals[0].resources[0].deletedAt='2026-11-08T12:00:00Z';assert.equal((await get()).status,404);
    publicBucket=true;assert.equal((await api.POST(upload())).status,503);
    publicBucket=false;backupFailure=true;assert.equal((await api.POST(upload())).status,503);
    jar.clear();assert.equal((await get()).status,401);
  }finally{global.fetch=originalFetch;process.env.APP_AUTH_MODE='supabase';jar.clear();}
});

const { createRoutine, startRoutine, advanceRoutine, routineProgress, validRoutineRun } = require('../app/routines-model.ts');
const routineFixture = () => createRoutine('routine-test', 'Ráno', [{id:'step-a',title:'Zuby'},{id:'step-b',title:'Sprcha'}], 'person-1');
const routineNow = '2026-11-08T09:00:00.000Z';
test('routines support completion, skip, back, pause, resume and fresh runs', () => {
  const g = routineFixture(); let run = startRoutine(g,'run-a',routineNow);
  assert.equal(routineProgress(run).index,0);
  run = advanceRoutine(run,'done','event-a',routineNow);
  assert.equal(routineProgress(run).index,1);
  run = advanceRoutine(run,'pause','unused',routineNow);
  assert.equal(advanceRoutine(run,'done','blocked',routineNow),run);
  run = advanceRoutine(run,'resume','unused',routineNow);
  run = advanceRoutine(run,'skipped','event-b',routineNow);
  assert.deepEqual([routineProgress(run).index,routineProgress(run).done,routineProgress(run).skipped],[-1,1,1]);
  run = advanceRoutine(run,'back','event-c',routineNow);
  assert.equal(routineProgress(run).index,1);
  run = advanceRoutine(run,'back','event-d',routineNow);
  assert.equal(routineProgress(run).index,0);
  assert.equal(validRoutineRun(run),true);
  assert.equal(startRoutine(g,'run-b',routineNow).events.length,0);
});
test('routine snapshot survives definition edits and backup roundtrip; invalid events are rejected', () => {
  const g=routineFixture();g.routineRun=startRoutine(g,'run-a',routineNow);
  g.children[0].title='Iný názov';g.children.reverse();
  assert.equal(g.routineRun.steps[0].title,'Zuby');
  const s=state();s.goals.push(g);assert.equal(isValidState(JSON.parse(JSON.stringify(s))),true);
  for(const mutate of [r=>r.steps.push({...r.steps[0]}),r=>r.events.push({id:'bad',stepId:'missing',outcome:'done',at:routineNow}),r=>r.startedAt='bad',r=>r.events.push(null)]){const r=clone(g.routineRun);mutate(r);assert.equal(validRoutineRun(r),false);}
});
test('routine synchronization merges same-run events and never combines different runs', () => {
  const b=state(),g=routineFixture();g.routineRun=startRoutine(g,'run-a',routineNow);b.goals.push(g);
  let l=clone(b),r=clone(b);
  l.goals.at(-1).routineRun=advanceRoutine(g.routineRun,'done','local-event',routineNow);
  r.goals.at(-1).routineRun=advanceRoutine(g.routineRun,'skipped','remote-event','2026-11-08T09:01:00Z');
  let m=mergeStates(b,l,r);assert.equal(m.conflicts.length,0);assert.equal(m.state.goals.at(-1).routineRun.events.length,2);assert.equal(validRoutineRun(m.state.goals.at(-1).routineRun),true);
  l.goals.at(-1).routineRun=startRoutine(g,'new-local',routineNow);r.goals.at(-1).routineRun=startRoutine(g,'new-remote',routineNow);
  m=mergeStates(b,l,r);assert.equal(m.conflicts.length,1);assert.equal(m.state.goals.at(-1).routineRun.id,'new-local');
});
test('routine progress is retained from old clients and partner routines cannot be edited', () => {
  const b=state(),g=routineFixture();g.routineRun=startRoutine(g,'run-a',routineNow);b.goals.push(g);
  const old=clone(b);delete old.goals.at(-1).routineRun;
  assert.deepEqual(authorizedState(b,old,'person-1').goals.find(x=>x.id===g.id).routineRun,g.routineRun);
  const partner=clone(b);partner.goals.at(-1).title='Changed by partner';assert.throws(()=>authorizedState(b,partner,'person-2'));
  assert.equal(authorizedState(b,clone(b),'person-2').goals.find(x=>x.id===g.id).title,g.title);
});

test('lists and routines support shared and both personal spaces without relocating legacy content', () => {
  const {createTodoList}=require('../app/lists-model.ts');
  assert.equal(createTodoList('old-list','Old list','person-1').spaceId,'shared');
  assert.equal(routineFixture().spaceId,'person-1');
  const s=state();
  for(const space of ['shared','person-1','person-2']){
    const owner=space==='person-2'?'person-2':'person-1';
    s.goals.push(createTodoList('list-'+space,'List '+space,owner,'mint',space));
    s.goals.push(createRoutine('routine-'+space,'Routine '+space,[{id:'step-'+space,title:'First step'}],owner,space));
  }
  assert.equal(isValidState(s),true);
  for(const person of ['person-1','person-2']){
    const incoming=clone(s);incoming.goals.find(g=>g.id==='list-shared').title='Shared edit by '+person;
    const routine=incoming.goals.find(g=>g.id==='routine-shared');routine.routineRun=startRoutine(routine,'shared-run-'+person,routineNow);
    const saved=authorizedState(s,incoming,person);
    assert.equal(saved.goals.find(g=>g.id==='list-shared').title,'Shared edit by '+person);
    assert.equal(saved.goals.find(g=>g.id==='routine-shared').routineRun.id,'shared-run-'+person);
    const own=clone(s);own.goals.find(g=>g.id==='list-'+person).title='My list';assert.equal(authorizedState(s,own,person).goals.find(g=>g.id==='list-'+person).title,'My list');
    for(const category of ['list','routine']){const forbidden=clone(s);forbidden.goals.find(g=>g.id===category+'-'+(person==='person-1'?'person-2':'person-1')).title='Partner edit';assert.throws(()=>authorizedState(s,forbidden,person));}
    assert.equal(visibleState(s,person).goals.filter(g=>g.category==='list'||g.category==='routine').length,6);
  }
  const moved=clone(s);moved.goals.find(g=>g.id==='list-shared').spaceId='person-1';assert.equal(authorizedState(s,moved,'person-1').goals.find(g=>g.id==='list-shared').spaceId,'person-1');
});

test('lists can move between every space from an editable source without duplication or loss', () => {
  const {createTodoList,canMoveTodoList}=require('../app/lists-model.ts');
  for(const actor of ['person-1','person-2'])for(const source of ['shared',actor])for(const destination of ['shared','person-1','person-2'].filter(x=>x!==source)){
    const b=state(),list=createTodoList('moving-list','Keep me',actor,'rose',source);
    list.children=[task('moving-done',{done:true,children:[task('moving-nested')]}),task('moving-deleted',{deletedAt:'2026-11-08T10:00:00Z'})];b.goals.push(list);
    const next=clone(b),moved=next.goals.find(g=>g.id===list.id);moved.spaceId=destination;
    assert.equal(canMoveTodoList(list,moved,actor),true);
    const saved=authorizedState(b,next,actor),result=saved.goals.find(g=>g.id===list.id);
    assert.equal(saved.goals.filter(g=>g.id===list.id).length,1);assert.equal(result.spaceId,destination);assert.equal(result.title,list.title);assert.equal(result.noteColor,'rose');assert.equal(result.ownerId,actor);assert.equal(result.deletedAt,undefined);
    assert.equal(result.children[0].done,true);assert.equal(result.children[0].children[0].id,'moving-nested');assert.equal(result.children[1].deletedAt,list.children[1].deletedAt);assert.equal(isValidState(saved),true);
    if(destination!=='shared'&&destination!==actor){const stale=clone(saved);stale.goals.find(g=>g.id===list.id).title='Unauthorized';assert.throws(()=>authorizedState(saved,stale,actor));const recipient=clone(saved);recipient.goals.find(g=>g.id===list.id).spaceId='shared';assert.equal(authorizedState(saved,recipient,destination).goals.find(g=>g.id===list.id).spaceId,'shared');}
  }
});
test('list transfers cannot take partner content, move deleted items, or disguise another category', () => {
  const {createTodoList,canMoveTodoList}=require('../app/lists-model.ts');
  for(const source of ['person-2','shared'])for(const category of ['list','plan','routine']){
    const b=state(),list=createTodoList('guard-list','Protected','person-2','sky',source);list.category=category;if(source==='shared'&&category==='list')list.deletedAt='2026-11-08T10:00:00Z';b.goals.push(list);
    const next=clone(b),moved=next.goals.find(g=>g.id===list.id);moved.spaceId='person-1';moved.category='list';assert.equal(canMoveTodoList(list,moved,'person-1'),false);assert.throws(()=>authorizedState(b,next,'person-1'));
  }
});
test('list transfer merges concurrent task edits and survives export and import', () => {
  const {createTodoList}=require('../app/lists-model.ts'),{readAppStateData}=require('../app/page-model.ts');const b=state(),list=createTodoList('merge-move','List','person-1');list.children=[task('move-task')];b.goals.push(list);
  const l=clone(b),r=clone(b);l.goals.at(-1).spaceId='person-1';r.goals.at(-1).children[0].done=true;r.goals.at(-1).children.push(task('move-added'));
  const m=mergeStates(b,l,r);assert.equal(m.conflicts.length,0);const saved=authorizedState(b,m.state,'person-1'),restored=readAppStateData(JSON.parse(JSON.stringify({version:1,data:saved})));assert.equal(isValidState(restored),true);const moved=restored.goals.find(g=>g.id===list.id);assert.equal(moved.spaceId,'person-1');assert.equal(moved.children[0].done,true);assert.equal(moved.children[1].id,'move-added');
});

test('short chore dates follow Bratislava calendar days without spaces or years', () => {
  const {shortChoreDate}=require('../app/chore-date.ts');
  assert.equal(shortChoreDate('2026-11-07T23:30:00Z'),'8.11.');
  assert.equal(shortChoreDate('2026-06-30T22:30:00Z'),'1.7.');
  assert.equal(shortChoreDate('2026-12-31T23:30:00Z'),'1.1.');
  assert.equal(shortChoreDate('invalid'),'—');
});
