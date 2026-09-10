import test from 'node:test';
import assert from 'node:assert/strict';
import { saveCommand } from '../src/base.js';

function query(result, selectedResult) {
  return {
    then(resolve) { return Promise.resolve(result).then(resolve); },
    select() { return query(selectedResult || result, selectedResult); },
    limit() { return Promise.resolve(result); },
    single() { return Promise.resolve(selectedResult || result); }
  };
}

test('first saved command creates the default workspace and project', async () => {
  const inserts = [];
  const client = {
    from(table) {
      return {
        select() {
          return { limit: async () => ({ data: [], error: null }) };
        },
        insert(value) {
          inserts.push({ table, value });
          if (table === 'workspaces') return query({}, { data: { id: 'workspace-1' }, error: null });
          if (table === 'projects') return query({}, { data: { id: 'project-1' }, error: null });
          if (table === 'tasks') return query({}, { data: { id: 'task-1' }, error: null });
          return Promise.resolve({ error: null });
        }
      };
    }
  };

  const taskId = await saveCommand(client, { id: 'user-1' }, 'Build my app');

  assert.equal(taskId, 'task-1');

  assert.deepEqual(inserts, [
    { table: 'workspaces', value: { name: 'AUTO FREE MONEY', owner_id: 'user-1' } },
    { table: 'projects', value: { workspace_id: 'workspace-1', name: 'Command Center', created_by: 'user-1' } },
    { table: 'tasks', value: { project_id: 'project-1', title: 'Build my app', input: { prompt: 'Build my app' } } }
  ]);
});

test('saving a command requires an authenticated user', async () => {
  await assert.rejects(() => saveCommand({}, null, 'Build my app'), /Sign in to save/);
});

test('task history reads newest accessible tasks and propagates read errors', async () => {
  const { loadTasks } = await import('../src/base.js');
  const rows = [{ id: 'task-1', title: 'Build', status: 'succeeded', output: { result: 'Plan' } }];
  const client = { from(table) {
    assert.equal(table, 'tasks');
    return { select(fields) {
      assert.ok(fields.includes('output'));
      return { order(field, options) {
        assert.equal(field, 'created_at');
        assert.equal(options.ascending, false);
        return { limit: async () => ({ data: rows, error: null }) };
      } };
    } };
  } };
  assert.deepEqual(await loadTasks(client), rows);
  const broken = { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ error: { message: 'Access denied' } }) }) }) }) };
  await assert.rejects(() => loadTasks(broken), /Access denied/);
});

test('running a saved task sends its existing id with a fresh session token', async () => {
  const { runSavedTask } = await import('../src/base.js');
  const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'fresh-token' } }, error: null }) } };
  const result = await runSavedTask(client, { id: 'existing-id', title: 'Plan', status: 'pending' }, async (url, options) => {
    assert.equal(url, '/api/ai');
    assert.equal(options.headers.authorization, 'Bearer fresh-token');
    assert.deepEqual(JSON.parse(options.body), { task: 'Plan', taskId: 'existing-id' });
    return { ok: true, json: async () => ({ result: 'Saved plan' }) };
  });
  assert.equal(result, 'Saved plan');
  await assert.rejects(() => runSavedTask(client, { status: 'succeeded' }), /pending/);
  await assert.rejects(() => runSavedTask({ auth: { getSession: async () => ({ data: { session: null } }) } }, { status: 'pending' }), /Sign in/);
  await assert.rejects(() => runSavedTask(client, { status: 'pending', id: 'existing-id', title: 'Plan' }, async () => ({ ok: false, json: async () => ({ error: 'Already running' }) })), /Already running/);
});
