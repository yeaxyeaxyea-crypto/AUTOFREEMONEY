import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommand, getConnectionSummary } from '../src/engine.js';

test('empty commands are rejected instead of entering the queue', () => {
  assert.deepEqual(createCommand('   '), {
    ok: false,
    message: 'Tell FREE AI what you want to build.'
  });
});

test('a valid command becomes an honest pending task', () => {
  assert.deepEqual(createCommand('Build a product video'), {
    ok: true,
    task: 'Build a product video',
    status: 'Connection required'
  });
});

test('connection summary counts only verified connections', () => {
  const result = getConnectionSummary([
    { status: 'connected' },
    { status: 'setup' },
    { status: 'planned' }
  ]);
  assert.deepEqual(result, { connected: 1, total: 3 });
});
