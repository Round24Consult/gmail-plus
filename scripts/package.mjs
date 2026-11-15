// Zips dist/ into release/<appSlug>-<version>.zip for the Chrome Web Store.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './load-config.mjs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const { appSlug } = loadConfig().config;
mkdirSync('release', { recursive: true });
const out = resolve('release', `${appSlug}-${version}.zip`);
rmSync(out, { force: true });
execFileSync('zip', ['-qr', out, '.', '-x', '*.map'], { cwd: 'dist', stdio: 'inherit' });
console.log(`Packaged ${out}`);
