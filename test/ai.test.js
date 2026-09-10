import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/ai.js';

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test('AI command verifies task access and records successful execution', async () => {
  const previous = {
    gemini: process.env.GEMINI_API_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishable: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secret: process.env.SUPABASE_SECRET_KEY
  };
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'private-test-key';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  process.env.SUPABASE_SECRET_KEY = 'secret-test-key';
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.includes('/rest/v1/tasks') && options.method === 'GET') {
      return { ok: true, json: async () => [{ id: '11111111-1111-4111-8111-111111111111', input: { prompt: 'Saved task prompt' } }] };
    }
    if (url.includes('/rest/v1/tasks')) return { ok: true, json: async () => [{ id: '11111111-1111-4111-8111-111111111111' }] };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Safe build plan' }] } }] }) };
  };

  const response = responseRecorder();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer user-jwt' },
    body: { task: 'Tampered browser prompt', taskId: '11111111-1111-4111-8111-111111111111' }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, { result: 'Safe build plan' });
  assert.match(requests[0].url, /\/rest\/v1\/tasks\?/);
  assert.equal(requests[0].options.headers.authorization, 'Bearer user-jwt');
  assert.equal(requests[0].options.headers.apikey, 'public-test-key');
  assert.deepEqual(JSON.parse(requests[1].options.body), { status: 'running', error: null });
  assert.equal(requests[1].options.headers.apikey, 'secret-test-key');
  assert.equal(requests[1].options.headers.authorization, undefined);
  assert.match(requests[2].url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent/);
  assert.equal(requests[2].options.headers['x-goog-api-key'], 'private-test-key');
  assert.equal(JSON.parse(requests[2].options.body).contents[0].parts[0].text, 'Saved task prompt');
  assert.deepEqual(JSON.parse(requests[3].options.body), { status: 'succeeded', output: { result: 'Safe build plan' }, error: null });

  globalThis.fetch = previousFetch;
  for (const [name, value] of Object.entries({ GEMINI_API_KEY: previous.gemini, NEXT_PUBLIC_SUPABASE_URL: previous.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: previous.publishable, SUPABASE_SECRET_KEY: previous.secret })) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test('AI command rejects requests without a signed-in user token', async () => {
  const response = responseRecorder();
  await handler({ method: 'POST', headers: {}, body: { task: 'Build', taskId: '11111111-1111-4111-8111-111111111111' } }, response);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.payload, { error: 'Sign in before running a command.' });
});

test('AI command records a failed task when Gemini rejects it', async () => {
  const previousFetch = globalThis.fetch;
  const previous = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY
  };
  Object.assign(process.env, {
    GEMINI_API_KEY: 'private-test-key',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
    SUPABASE_SECRET_KEY: 'secret-test-key'
  });
  const patches = [];
  globalThis.fetch = async (url, options) => {
    if (url.includes('/rest/v1/tasks') && options.method === 'GET') {
      return { ok: true, json: async () => [{ id: '11111111-1111-4111-8111-111111111111', input: { prompt: 'Build' } }] };
    }
    if (url.includes('/rest/v1/tasks')) {
      patches.push(JSON.parse(options.body));
      return { ok: true, json: async () => [{ id: '11111111-1111-4111-8111-111111111111' }] };
    }
    return { ok: false, status: 429, json: async () => ({ error: { message: 'Rate limited' } }) };
  };

  const response = responseRecorder();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer user-jwt' },
    body: { task: 'Build', taskId: '11111111-1111-4111-8111-111111111111' }
  }, response);

  assert.equal(response.statusCode, 502);
  assert.deepEqual(patches, [
    { status: 'running', error: null },
    { status: 'failed', error: 'Gemini rejected the request: Rate limited' }
  ]);

  globalThis.fetch = previousFetch;
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test('AI command does not replay a task that is no longer pending', async () => {
  const previousFetch = globalThis.fetch;
  const previous = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY
  };
  Object.assign(process.env, {
    GEMINI_API_KEY: 'private-test-key',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
    SUPABASE_SECRET_KEY: 'secret-test-key'
  });
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    if (options.method === 'GET') return { ok: true, json: async () => [{ id: '11111111-1111-4111-8111-111111111111', input: { prompt: 'Build' } }] };
    return { ok: true, json: async () => [] };
  };

  const response = responseRecorder();
  await handler({ method: 'POST', headers: { authorization: 'Bearer user-jwt' }, body: { task: 'Build', taskId: '11111111-1111-4111-8111-111111111111' } }, response);

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.payload, { error: 'This task has already started or finished.' });
  assert.equal(calls, 2);

  globalThis.fetch = previousFetch;
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

test('AI command records failure when the provider request throws', async () => {
  const previousFetch = globalThis.fetch;
  const previous = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY
  };
  Object.assign(process.env, {
    GEMINI_API_KEY: 'private-test-key',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
    SUPABASE_SECRET_KEY: 'secret-test-key'
  });
  const patches = [];
  globalThis.fetch = async (url, options) => {
    if (options.method === 'GET') return { ok: true, json: async () => [{ id: '11111111-1111-4111-8111-111111111111', input: { prompt: 'Build' } }] };
    if (url.includes('/rest/v1/tasks')) {
      patches.push(JSON.parse(options.body));
      return { ok: true, json: async () => [{ id: '11111111-1111-4111-8111-111111111111' }] };
    }
    throw new Error('network unavailable');
  };

  const response = responseRecorder();
  await handler({ method: 'POST', headers: { authorization: 'Bearer user-jwt' }, body: { task: 'Build', taskId: '11111111-1111-4111-8111-111111111111' } }, response);

  assert.equal(response.statusCode, 502);
  assert.deepEqual(patches, [
    { status: 'running', error: null },
    { status: 'failed', error: 'The AI provider request failed.' }
  ]);

  globalThis.fetch = previousFetch;
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
