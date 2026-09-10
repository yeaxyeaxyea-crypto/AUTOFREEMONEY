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
