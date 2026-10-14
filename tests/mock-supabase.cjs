// Disposable, loopback-only Supabase stand-in for browser QA. Never production.
const http = require('node:http');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { defaultPeople } = require('../app/page-model.ts');
const goal = (id, title, spaceId) => ({ id, title, spaceId, description: 'Testovacia poznámka', ownerId: 'person-1', done: false, expanded: true, kind: 'topic', children: [], category: 'plan', importanceByPerson: { 'person-1': 4, 'person-2': 2 }, feasibilityByPerson: { 'person-1': 3, 'person-2': 3 } });
let stored = { revision: 1, data: { activePersonId: 'person-1', people: defaultPeople, goals: [goal('shared-test', 'Spoločný testovací plán', 'shared'), goal('rini-test', 'Rini osobný test', 'person-1'), goal('fluffy-test', 'Fluffy súkromný test', 'person-2')], activityLog: [], goalRankings: { 'person-1': ['shared-test', 'rini-test'], 'person-2': ['shared-test', 'fluffy-test'] } } };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const send = (data, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
  if (url.pathname === '/auth/v1/token') {
    const personId = body.email === 'rini@example.test' ? 'person-1' : body.email === 'fluffy@example.test' ? 'person-2' : null;
    if (!personId || body.password !== 'test-password') return send({ error: 'Invalid test credentials' }, 400);
    return send({ access_token: `test-${personId}`, refresh_token: `refresh-${personId}`, expires_in: 3600 });
  }
  if (url.pathname === '/auth/v1/user') {
    const personId = req.headers.authorization?.replace('Bearer test-', '');
    return ['person-1', 'person-2'].includes(personId) ? send({ id: personId }) : send({}, 401);
  }
  if (url.pathname === '/auth/v1/logout') return send({});
  if (url.pathname === '/rest/v1/app_members') return send([{ person_id: url.searchParams.get('user_id').replace('eq.', '') }]);
  if (url.pathname === '/rest/v1/app_state') return send([stored]);
  if (url.pathname === '/rest/v1/rpc/save_app_state') {
    if (body.p_expected_revision !== stored.revision) return send({ ok: false });
    stored = { data: body.p_data, revision: stored.revision + 1 }; return send({ ok: true, revision: stored.revision });
  }
  if (url.pathname === '/test/remote-edit' && req.method === 'POST') {
    const goal = stored.data.goals.find((item) => item.id === body.id);
    if (goal) { Object.assign(goal, body.fields); stored.revision++; }
    return send({ ok: true, revision: stored.revision });
  }
  return send({ error: 'Unknown test route' }, 404);
});
server.listen(54329, '127.0.0.1', () => process.stdout.write('Disposable test Supabase listening at http://127.0.0.1:54329\n'));
