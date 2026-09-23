const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { join } = require('node:path');

const source = readFileSync(join(__dirname, '../api-client.js'), 'utf8');
function harness(fetch) {
  const state = { title: {}, meta: {}, summary: {}, rendered: [], datasets: [] };
  const context = vm.createContext({
    AbortController, fetch, serverCatalogAvailable: true, contractors: [{ id: 'visitor-csv' }],
    datasetRevision: 1, form: { reportValidity: () => true },
    cityInput: { value: 'Алматы' }, categoryInput: { value: 'Ведущий' },
    formatInput: { value: 'корпоратив' }, dateInput: { value: '2026-10-15' },
    budgetInput: { value: '2000000' }, languageInput: { value: '' }, durationInput: { value: '' },
    resultTitle: state.title, resultMeta: state.meta, resultContainer: { replaceChildren() {} },
    renderState: (...args) => state.rendered.push(args),
    setDataset: (...args) => state.datasets.push(args),
    datasetError: message => { state.error = message; },
    byId: () => state.summary
  });
  vm.runInContext(source, context);
  return { context, state };
}
const response = (message = 'no match') => ({ ok: true, json: async () => ({ status: 'no_match', message, results: [] }) });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('server catalog search sends the FastAPI contract and no catalog or credential', async () => {
  let call;
  const { context } = harness(async (url, options) => { call = { url, ...options }; return response(); });
  await context.submitBackendSearch();
  assert.equal(call.url, '/api/search');
  assert.equal(call.method, 'POST');
  assert.deepEqual(JSON.parse(call.body), { city: 'Алматы', category: 'Ведущий', event_format: 'корпоратив',
    event_date: '2026-10-15', budget: 2000000, language: null, duration: null, use_ai: true });
  assert.equal(call.headers.Authorization, undefined);
});

test('visitor CSV is sent only for the visitor search', async () => {
  let payload;
  const { context } = harness(async (_, options) => { payload = JSON.parse(options.body); return response(); });
  context.serverCatalogAvailable = false;
  await context.submitBackendSearch();
  assert.deepEqual(payload.contractors, [{ id: 'visitor-csv' }]);
});

test('late response cannot replace a newer search or reset', async () => {
  const first = deferred(), second = deferred();
  let calls = 0;
  const { context, state } = harness(() => (++calls === 1 ? first.promise : second.promise));
  const a = context.submitBackendSearch();
  const b = context.submitBackendSearch();
  second.resolve(response('new result'));
  await b;
  first.resolve(response('stale result'));
  await a;
  assert.equal(state.rendered.length, 1);
  assert.equal(state.rendered[0][2], 'new result');
  const pending = deferred();
  context.fetch = () => pending.promise;
  const c = context.submitBackendSearch();
  context.cancelBackendSearch();
  pending.resolve(response('after reset'));
  await c;
  assert.equal(state.rendered.length, 1);
});

test('server error is shown without pretending that local matching succeeded', async () => {
  const { context, state } = harness(async () => ({ ok: false, json: async () => ({ detail: 'Invalid CSV' }) }));
  await context.submitBackendSearch();
  assert.equal(state.title.textContent, 'Не удалось выполнить поиск');
  assert.equal(state.rendered[0][2], 'Invalid CSV');
});

test('initial catalog response cannot overwrite a visitor dataset selected during loading', async () => {
  const pending = deferred();
  const { context, state } = harness(() => pending.promise);
  const loading = context.loadServerCatalog();
  context.datasetRevision++;
  pending.resolve({ ok: true, json: async () => ({ items: [], source: 'contractors.csv' }) });
  await loading;
  assert.equal(state.datasets.length, 0);
});

test('catalog success selects server source; failure is reported', async () => {
  const { context, state } = harness(async () => ({ ok: true, json: async () => ({ items: [], source: 'contractors.csv' }) }));
  await context.loadServerCatalog();
  assert.equal(state.datasets[0][1], 'contractors.csv');
  assert.equal(state.datasets[0][2], true);
  context.fetch = async () => { throw new Error('network unavailable'); };
  await context.loadServerCatalog();
  assert.match(state.error, /network unavailable/);
});
