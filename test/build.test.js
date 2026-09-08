import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSite } from '../scripts/build.mjs';

test('build creates a deployable dist directory', async () => {
  const output = await mkdtemp(join(tmpdir(), 'afm-build-'));
  await buildSite(output);
  assert.equal((await stat(join(output, 'index.html'))).isFile(), true);
  assert.match(await readFile(join(output, 'index.html'), 'utf8'), /FREE AI/);
});
