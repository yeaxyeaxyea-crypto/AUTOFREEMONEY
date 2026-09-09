import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function buildSite(output = join(root, 'dist')) {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(join(root, 'public'), output, { recursive: true });
  await cp(join(root, 'src'), join(output, 'src'), { recursive: true });
  await cp(join(root, 'src', 'app.js'), join(output, 'app.js'));
  await cp(join(root, 'src', 'base.js'), join(output, 'base.js'));
  await cp(join(root, 'src', 'engine.js'), join(output, 'engine.js'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildSite();
  console.log('Built AUTO FREE MONEY to dist/');
}
