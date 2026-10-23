const fs = require('node:fs');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');
const { test } = require('node:test');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

// Run the actual sync hook against a deterministic scheduler, storage and HTTP server.
// No production files, browser storage, credentials or network are used.
let rendering;
const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const hooks = {
  useState(initial) {
    const h = rendering, index = h.index++;
    const slot = h.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [slot.value, (value) => {
      const next = typeof value === 'function' ? value(slot.value) : value;
      if (!Object.is(next, slot.value)) { slot.value = next; h.schedule(); }
    }];
  },
  useRef(value) { const h = rendering; return h.slots[h.index++] ??= { current: value }; },
  useCallback(fn, deps) {
    const h = rendering, index = h.index++, old = h.slots[index];
    if (old && sameDeps(old.deps, deps)) return old.fn;
    h.slots[index] = { deps, fn }; return fn;
  },
  useEffect(fn, deps) {
    const h = rendering, index = h.index++, old = h.slots[index];
    if (old && sameDeps(old.deps, deps)) return;
    const slot = h.slots[index] = { deps, cleanup: old?.cleanup };
    h.effects.push(() => { slot.cleanup?.(); slot.cleanup = fn(); });
  },
};
const originalLoad = Module._load;
Module._load = function(request, parent, ...args) {
  if (request === 'react' && parent?.filename.endsWith('use-board-sync.ts')) return hooks;
  return originalLoad.call(this, request, parent, ...args);
};
const { useBoardSync } = require('../app/use-board-sync.ts');
const { defaultPeople } = require('../app/page-model.ts');
const { visibleState } = require('../app/state-sync.ts');
const clone = structuredClone;
const task = (id, extra = {}) => ({ id, title: id, ownerId: 'person-1', done: false, expanded: false, children: [], ...extra });
const goal = (id, extra = {}) => ({ ...task(id), description: '', spaceId: 'shared', category: 'chore', importanceByPerson: { 'person-1': 3, 'person-2': 3 }, ...extra });
const state = () => ({ activePersonId: 'person-1', people: clone(defaultPeople), goals: [goal('chores', { children: [task('washing')] })], activityLog: [], goalRankings: {} });
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate, message) { for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); } assert.fail(message); }

function harness({ remote = state(), personId = 'person-1', cache = {}, offline = false, quota = false } = {}) {
  const originals = { fetch: global.fetch, window: global.window };
  const entries = new Map(Object.entries(cache));
  let timerId = 0;
  const timers = new Map(), listeners = new Map();
  const storage = { get length() { return entries.size; }, key: i => [...entries.keys()][i],
    getItem: key => entries.get(key) ?? null, setItem: (key, value) => { if (quota) throw Error('Quota'); entries.set(key, value); }, removeItem: key => entries.delete(key) };
  global.window = { localStorage: storage,
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout: id => timers.delete(id),
    setInterval: () => ++timerId, clearInterval: () => {},
    addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
  };
  const server = { data: clone(remote), revision: 10, personId, offline, events: [], beforeSave: null, afterGet: null };
  global.fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET'; server.events.push({ url, method, personId: server.personId });
    if (url === '/api/session') {
      if (method === 'POST') server.personId = JSON.parse(init.body).personId;
      if (method === 'DELETE') server.personId = null;
      return Response.json({ personId: server.personId, mode: 'profiles' });
    }
    assert.equal(url, '/api/state');
    if (server.offline) throw Error('Test network unavailable');
    if (init.headers?.['x-acorns-person-id'] && init.headers['x-acorns-person-id'] !== server.personId) return Response.json({ error: 'Profile changed' }, { status: 409 });
    if (method === 'PUT') {
      const sent = JSON.parse(init.body);
      if (server.beforeSave) await server.beforeSave();
      if (sent.revision !== server.revision) return Response.json({ data: server.data, revision: server.revision }, { status: 409 });
      server.data = clone(sent.data); server.revision++;
    }
    const response = Response.json({ data: visibleState(clone(server.data), server.personId), revision: server.revision });
    if (method === 'GET') server.afterGet?.();
    return response;
  };
  const h = { slots: [], effects: [], index: 0, queued: false, disposed: false, renders: 0, data: state(), api: null, server, entries, listeners };
  const apply = data => { h.data = clone(data); h.schedule(); };
  h.schedule = () => { if (h.queued || h.disposed) return; h.queued = true; queueMicrotask(() => {
    if (h.disposed) return; h.queued = false; h.index = 0; rendering = h;
    assert.ok(++h.renders < 1000, 'no render loop'); h.api = useBoardSync(h.data, apply); rendering = undefined;
    const effects = h.effects.splice(0); effects.forEach(effect => effect());
  }); };
  h.edit = async mutate => { mutate(h.data); h.data = clone(h.data); h.schedule(); await tick(); };
  h.ready = () => until(() => h.api?.loaded && h.api?.authenticated, 'board initialized');
  h.close = async () => { await tick(); h.disposed = true; h.slots.forEach(s => s?.cleanup?.()); global.fetch = originals.fetch; global.window = originals.window; };
  h.schedule(); return h;
}

test('actual hook shows remote-only chores during startup conflicts and stops writes until a field choice', async () => {
  const old = state(), remote = state(), empty = { ...state(), goals: [] };
  old.goals[0].title = 'Old bathroom'; remote.goals[0].title = 'Bathroom';
  remote.goals.push(goal('new-project', { children: [task('new-work', { choreIntervalDays: 90, choreWeight: 5 })] }));
  const h = harness({ remote, cache: { 'acorns-state-person-1': JSON.stringify({ data: old, base: empty }) } });
  try {
    await h.ready(); assert.equal(h.api.conflicts.length, 1);
    assert.equal(h.data.goals.length, 2); assert.equal(h.data.goals[1].children[0].choreIntervalDays, 90);
    assert.equal(h.api.conflictVersions().localAtConflict.goals.length, 1);
    await h.api.retry(); assert.equal(h.server.events.filter(e => e.method === 'PUT').length, 0);
    await h.api.chooseProfile('person-2'); assert.equal(h.server.personId, 'person-1');
    h.api.resolve({ '/goals/chores/title': 'remote' }); await tick(); await h.api.retry();
    assert.equal(h.server.data.goals.length, 2); assert.equal(h.server.data.goals[0].title, 'Bathroom');
  } finally { await h.close(); }
});

test('switching profiles saves pending edits first and does not revert to the older second-profile cache', async () => {
  const old = state(), remote = state(); remote.goals.push(goal('new-project'));
  const h = harness({ remote, cache: { 'acorns-state-person-2': JSON.stringify({ data: old, base: old }) } });
  try {
    await h.ready(); await h.edit(s => { s.goals[0].children[0].choreWeight = 5; s.goals[0].children[0].choreIntervalDays = 90; });
    await h.api.chooseProfile('person-2'); await tick();
    assert.equal(h.data.activePersonId, 'person-2'); assert.equal(h.data.goals.length, 2);
    assert.equal(h.data.goals[0].children[0].choreWeight, 5); assert.equal(h.data.goals[0].children[0].choreIntervalDays, 90);
    const writes = h.server.events.filter(e => e.method === 'PUT'); assert.equal(writes.length, 1); assert.equal(writes[0].personId, 'person-1');
    assert.ok(h.server.events.indexOf(writes[0]) < h.server.events.findIndex(e => e.url === '/api/session' && e.method === 'POST'));
  } finally { await h.close(); }
});

test('profile switching waits for an already running save instead of changing its identity', async () => {
  const h = harness(); let release;
  try {
    await h.ready(); await h.edit(s => s.goals.push(goal('pending-project')));
    h.server.beforeSave = () => new Promise(resolve => { release = resolve; });
    const saving = h.api.retry(); await until(() => release, 'save started');
    const switching = h.api.chooseProfile('person-2'); await tick();
    assert.equal(h.api.transitioning, true); assert.equal(h.server.personId, 'person-1');
    assert.equal(h.server.events.filter(e => e.url === '/api/session' && e.method === 'POST').length, 0);
    release(); await saving; await switching; await tick();
    assert.equal(h.server.personId, 'person-2'); assert.equal(h.data.goals.length, 2); assert.equal(h.api.transitioning, false);
  } finally { release?.(); await h.close(); }
});

test('network failure keeps pending edits, current profile and unload protection', async () => {
  const h = harness();
  try {
    await h.ready(); await h.edit(s => s.goals[0].children.push(task('unsaved-work'))); h.server.offline = true;
    await h.api.logout(); await tick(); assert.equal(h.api.authenticated, true); assert.equal(h.server.personId, 'person-1');
    assert.equal(JSON.parse(h.entries.get('acorns-state-person-1')).data.goals[0].children.length, 2);
    let warned = false; for (const listener of h.listeners.get('beforeunload') ?? []) listener({ preventDefault: () => warned = true });
    assert.equal(warned, true); assert.equal(h.server.events.some(e => e.method === 'DELETE'), false);
  } finally { await h.close(); }
});

test('even a clean profile stays selected when the connection fails during switch preparation', async () => {
  const h = harness();
  try {
    await h.ready(); h.server.offline = true; await h.api.chooseProfile('person-2'); await tick();
    assert.equal(h.server.personId, 'person-1'); assert.equal(h.data.activePersonId, 'person-1');
  } finally { await h.close(); }
});

test('offline loading another profile uses the shared acknowledged board and retains its own pending edits', async () => {
  const remote = state(); remote.goals.push(goal('new-project'));
  const old = state(), pending = state(); pending.goals[0].children.push(task('offline-work'));
  const h = harness({ personId: 'person-2', offline: true, cache: {
    'acorns-acknowledged-board': JSON.stringify({ data: remote, revision: 10 }),
    'acorns-state-person-2': JSON.stringify({ data: pending, base: old }),
  } });
  try {
    await h.ready(); assert.equal(h.data.activePersonId, 'person-2'); assert.equal(h.data.goals.length, 2);
    assert.equal(h.data.goals[0].children.length, 2); assert.equal(h.server.events.some(e => e.method === 'PUT'), false);
  } finally { await h.close(); }
});

test('a full browser cache does not hide the successfully fetched board', async () => {
  const remote = state(); remote.goals.push(goal('new-project'));
  const h = harness({ remote, quota: true });
  try { await h.ready(); assert.equal(h.data.goals.length, 2); assert.equal(h.api.loaded, true); }
  finally { await h.close(); }
});

test('another tab changing the profile pauses saving and preserves the original profile edits', async () => {
  const h = harness();
  try {
    await h.ready(); await h.edit(s => s.goals[0].children.push(task('pending-old-profile')));
    h.server.personId = 'person-2'; await h.api.retry(); await tick();
    assert.equal(h.api.authenticated, false); assert.match(h.api.status, /inom okne/);
    assert.equal(JSON.parse(h.entries.get('acorns-state-person-1')).data.goals[0].children.length, 2);
    assert.equal(h.server.events.filter(e => e.method === 'PUT').length, 0);
    await h.api.chooseProfile('person-1'); await tick(); await h.api.retry();
    assert.equal(h.server.personId, 'person-1'); assert.equal(h.server.data.goals[0].children.length, 2);
  } finally { await h.close(); }
});

test('a cookie change between reading and writing cannot attribute a save to the wrong profile', async () => {
  const h = harness();
  try {
    await h.ready(); await h.edit(s => s.goals[0].title = 'Pending original profile title');
    h.server.afterGet = () => { h.server.personId = 'person-2'; h.server.afterGet = null; };
    await h.api.retry(); await tick();
    assert.equal(h.api.authenticated, false); assert.equal(h.server.data.goals[0].title, 'chores');
    assert.equal(JSON.parse(h.entries.get('acorns-state-person-1')).data.goals[0].title, 'Pending original profile title');
  } finally { await h.close(); }
});

test('the final conflict choice starts saving immediately and does not return after retries or profile switches', async () => {
  const local = state(), remote = state(), base = { ...state(), goals: [] };
  local.goals[0].title = 'My bathroom'; remote.goals[0].title = 'Server bathroom';
  local.goals[0].description = 'My note'; remote.goals[0].description = 'Server note';
  const h = harness({ remote, cache: { 'acorns-state-person-1': JSON.stringify({ data: local, base }) } });
  try {
    await h.ready(); assert.equal(h.api.conflicts.length, 2);
    assert.equal(h.api.resolve({ '/goals/chores/title': 'local' }), false);
    await tick(); assert.equal(h.api.conflicts.length, 2); assert.equal(h.server.events.some(e => e.method === 'PUT'), false);
    assert.equal(h.api.resolve({ '/goals/chores/title': 'local', '/goals/chores/description': 'remote' }), true);
    await until(() => h.api.conflicts.length === 0 && h.api.status === 'Všetky zmeny sú uložené.', 'choices automatically saved');
    assert.equal(h.server.data.goals[0].title, 'My bathroom'); assert.equal(h.server.data.goals[0].description, 'Server note');
    await h.api.retry(); await tick(); assert.equal(h.api.conflicts.length, 0);
    await h.api.chooseProfile('person-2'); await h.api.chooseProfile('person-1'); await tick();
    assert.equal(h.api.conflicts.length, 0); assert.equal(h.data.goals[0].title, 'My bathroom');
  } finally { await h.close(); }
});
