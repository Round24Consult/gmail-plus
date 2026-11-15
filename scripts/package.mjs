// Zips dist/ into release/gmail-plus-<version>.zip for the Chrome Web Store.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
mkdirSync('release', { recursive: true });
const out = resolve('release', `gmail-plus-${version}.zip`);
rmSync(out, { force: true });
execFileSync('zip', ['-qr', out, '.', '-x', '*.map'], { cwd: 'dist', stdio: 'inherit' });
console.log(`Packaged ${out}`);
