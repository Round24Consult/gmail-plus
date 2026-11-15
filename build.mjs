// Builds the extension into dist/. Flags: --watch (rebuild on change), --prod (minified, no source maps).
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const prod = process.argv.includes('--prod');
const outdir = 'dist';
const sdkDir = 'node_modules/@inboxsdk/core';

async function writeStatic() {
  await cp('static', outdir, { recursive: true });
  // InboxSDK's background worker injects this exact file name into Gmail.
  await cp(`${sdkDir}/pageWorld.js`, `${outdir}/pageWorld.js`);
  if (!prod && existsSync(`${sdkDir}/pageWorld.js.map`)) await cp(`${sdkDir}/pageWorld.js.map`, `${outdir}/pageWorld.js.map`);

  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const manifest = JSON.parse(await readFile('static/manifest.json', 'utf8'));
  manifest.version = pkg.version;
  if (prod) {
    manifest.name = manifest.name.replace(/\s*\(dev\)$/, '');
  } else {
    // Let DevTools load source maps for the content script.
    manifest.web_accessible_resources.push({ resources: ['*.map'], matches: ['https://mail.google.com/*'] });
  }
  await writeFile(`${outdir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await writeStatic();

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: {
    content: 'src/content/index.tsx',
    background: 'src/background/index.ts',
    popup: 'src/popup/index.tsx',
    options: 'src/options/index.tsx',
  },
  outdir,
  bundle: true,
  format: 'iife',
  target: ['chrome120'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  sourcemap: prod ? false : 'linked',
  minify: prod,
  legalComments: prod ? 'external' : 'inline',
  define: { 'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development') },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching src/ for changes. Static files are copied once; restart after editing static/.');
} else {
  await esbuild.build(options);
}
