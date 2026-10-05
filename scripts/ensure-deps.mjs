// Runs before `npm run dev`: if package.json lists a dependency node_modules doesn't have yet (say,
// after a git pull that added one), install it first instead of failing with "could not be resolved".
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const missing = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) => !existsSync(join(root, 'node_modules', d, 'package.json')));
if (missing.length) {
  console.log(`\n  Installing missing dependencies: ${missing.join(', ')}\n`);
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  process.exit(r.status ?? 1);
}
