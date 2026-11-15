// Builds the extension into dist/. Flags: --watch (rebuild on change), --prod (minified, no source maps).
import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadConfig } from './scripts/load-config.mjs';

const watch = process.argv.includes('--watch');
const prod = process.argv.includes('--prod');
const outdir = 'dist';
const sdkDir = 'node_modules/@inboxsdk/core';

// config/defaults.json + .env + environment variables + playbooks/*.json (see docs/CONFIGURATION.md).
let config;
try {
  const loaded = loadConfig();
  config = loaded.config;
  for (const w of loaded.warnings) console.warn(`\n⚠️  ${w}\n`);
} catch (err) {
  console.error(`\n✘ ${err.message}\n`);
  process.exit(1);
}

async function writeStatic() {
  await cp('static', outdir, { recursive: true });
  // InboxSDK's background worker injects this exact file name into Gmail.
  await cp(`${sdkDir}/pageWorld.js`, `${outdir}/pageWorld.js`);
  if (!prod && existsSync(`${sdkDir}/pageWorld.js.map`)) await cp(`${sdkDir}/pageWorld.js.map`, `${outdir}/pageWorld.js.map`);

  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const manifest = JSON.parse(await readFile('static/manifest.json', 'utf8'));
  manifest.version = pkg.version;
  manifest.name = prod ? config.appName : `${config.appName} (dev)`;
  manifest.short_name = config.appShortName;
  manifest.description = config.appDescription;
  manifest.action.default_title = config.appName;
  if (config.homepageUrl) manifest.homepage_url = config.homepageUrl;
  if (!prod) {
    // Let DevTools load source maps for the content script.
    manifest.web_accessible_resources.push({ resources: ['*.map'], matches: ['https://mail.google.com/*'] });
  }
  await writeFile(`${outdir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

  // %APP_NAME% placeholders in the extension pages.
  for (const file of (await readdir(outdir)).filter((f) => f.endsWith('.html'))) {
    const html = await readFile(`${outdir}/${file}`, 'utf8');
    await writeFile(`${outdir}/${file}`, html.replaceAll('%APP_NAME%', escapeHtml(config.appName)));
  }
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  define: {
    'process.env.NODE_ENV': JSON.stringify(prod ? 'production' : 'development'),
    __GP_CONFIG__: JSON.stringify(config),
  },
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching src/ for changes. Static files are copied once; restart after editing static/.');
} else {
  await esbuild.build(options);
}
