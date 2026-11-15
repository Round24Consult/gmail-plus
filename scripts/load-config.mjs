// Builds the app configuration from config/defaults.json, an optional .env file, environment
// variables and every playbooks/*.json file. Used by build.mjs and vitest.config.mjs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Environment variable → config path. */
export const ENV_VARS = {
  APP_NAME: 'appName',
  APP_SHORT_NAME: 'appShortName',
  APP_SLUG: 'appSlug',
  APP_DESCRIPTION: 'appDescription',
  INBOXSDK_APP_ID: 'inboxSdkAppId',
  SUPPORT_EMAIL: 'supportEmail',
  HOMEPAGE_URL: 'homepageUrl',
  PRIVACY_POLICY_URL: 'privacyPolicyUrl',
  MERGE_DEFAULT_DAILY_CAP: 'mailMerge.defaultDailyCap',
  MERGE_MAX_DAILY_CAP: 'mailMerge.maxDailyCap',
  MERGE_DEFAULT_INTERVAL_SEC: 'mailMerge.defaultIntervalSec',
  MERGE_MIN_INTERVAL_SEC: 'mailMerge.minIntervalSec',
  MERGE_MAX_INTERVAL_SEC: 'mailMerge.maxIntervalSec',
  MERGE_MAX_RECIPIENTS: 'mailMerge.maxRecipients',
  FOLLOW_UP_SWEEP_MINUTES: 'followUps.sweepMinutes',
  FOLLOW_UP_REMINDER_HOUR: 'followUps.reminderHour',
  DEFAULT_PLAYBOOKS: 'defaultPlaybooks',
};

const NUMBER_PATHS = new Set(Object.values(ENV_VARS).filter((p) => p.startsWith('mailMerge.') || p.startsWith('followUps.')));
const ID_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const APP_ID_RE = /^sdk_.{5,15}_[0-9a-f]{10}$/;

function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = cur[p];
  cur[parts.at(-1)] = value;
}

function readEnvFile(root) {
  const file = join(root, '.env');
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
}

export function validatePlaybook(pb, fileName = '') {
  const where = fileName || pb?.id || 'playbook';
  const errors = [];
  if (!pb || typeof pb !== 'object') return [`${where}: not a JSON object`];
  if (!ID_RE.test(pb.id ?? '')) errors.push(`${where}: "id" must be 2-31 lowercase letters, digits or dashes`);
  if (fileName && pb.id && fileName !== `${pb.id}.json`) errors.push(`${where}: file name must be "${pb.id}.json"`);
  if (typeof pb.name !== 'string' || !pb.name.trim()) errors.push(`${where}: "name" is required`);
  if (pb.blurb !== undefined && typeof pb.blurb !== 'string') errors.push(`${where}: "blurb" must be text`);
  if (pb.order !== undefined && !Number.isFinite(pb.order)) errors.push(`${where}: "order" must be a number`);
  if (!Array.isArray(pb.stages) || pb.stages.length === 0) {
    errors.push(`${where}: "stages" needs at least one stage`);
  } else {
    const keys = new Set();
    pb.stages.forEach((s, i) => {
      const at = `${where} stages[${i}]`;
      if (!KEY_RE.test(s?.key ?? '')) errors.push(`${at}: "key" must be lowercase letters, digits or dashes`);
      else if (keys.has(s.key)) errors.push(`${at}: duplicate key "${s.key}"`);
      else keys.add(s.key);
      if (typeof s?.name !== 'string' || !s.name.trim()) errors.push(`${at}: "name" is required`);
      if (!COLOR_RE.test(s?.color ?? '')) errors.push(`${at}: "color" must look like #1a73e8`);
      if (s?.closed !== undefined && typeof s.closed !== 'boolean') errors.push(`${at}: "closed" must be true or false`);
    });
  }
  if (!Array.isArray(pb.templates)) {
    errors.push(`${where}: "templates" must be a list (it can be empty)`);
  } else {
    const keys = new Set();
    pb.templates.forEach((t, i) => {
      const at = `${where} templates[${i}]`;
      if (!KEY_RE.test(t?.key ?? '')) errors.push(`${at}: "key" must be lowercase letters, digits or dashes`);
      else if (keys.has(t.key)) errors.push(`${at}: duplicate key "${t.key}"`);
      else keys.add(t.key);
      if (typeof t?.name !== 'string' || !t.name.trim()) errors.push(`${at}: "name" is required`);
      if (typeof t?.body !== 'string' || !t.body.trim()) errors.push(`${at}: "body" is required`);
      if (t?.emoji !== undefined && typeof t.emoji !== 'string') errors.push(`${at}: "emoji" must be text`);
      if (t?.subject !== undefined && typeof t.subject !== 'string') errors.push(`${at}: "subject" must be text`);
    });
  }
  return errors;
}

export function validateConfig(config) {
  const errors = [];
  const warnings = [];
  const str = (key, max) => {
    const v = config[key];
    if (typeof v !== 'string' || !v.trim()) errors.push(`${key} is required`);
    else if (max && v.length > max) errors.push(`${key} must be at most ${max} characters`);
  };
  str('appName', 75);
  str('appShortName', 45);
  str('appDescription', 132);
  if (!ID_RE.test(config.appSlug ?? '')) errors.push('appSlug must be 2-31 lowercase letters, digits or dashes');
  if (config.inboxSdkAppId && !APP_ID_RE.test(config.inboxSdkAppId)) {
    errors.push('inboxSdkAppId must look like sdk_<label>_<10 hex characters>; register one at https://register.inboxsdk.com/');
  }
  if (!config.inboxSdkAppId) {
    warnings.push('No INBOXSDK_APP_ID set. The extension works, but Gmail shows a red "Invalid AppId" banner. Register a free id at https://register.inboxsdk.com/ and put it in .env.');
  }
  const m = config.mailMerge;
  const f = config.followUps;
  for (const path of NUMBER_PATHS) {
    const [group, key] = path.split('.');
    if (!Number.isInteger(config[group]?.[key])) errors.push(`${path} must be a whole number`);
  }
  if (!errors.length) {
    if (!(m.defaultDailyCap >= 1 && m.defaultDailyCap <= m.maxDailyCap)) errors.push('mailMerge.defaultDailyCap must be between 1 and maxDailyCap');
    if (m.maxDailyCap > 2000) errors.push('mailMerge.maxDailyCap must be 2000 or less (Gmail\'s own limit for Workspace accounts)');
    if (!(m.minIntervalSec >= 1 && m.minIntervalSec <= m.defaultIntervalSec && m.defaultIntervalSec <= m.maxIntervalSec && m.maxIntervalSec <= 3600)) {
      errors.push('mailMerge intervals must satisfy 1 <= minIntervalSec <= defaultIntervalSec <= maxIntervalSec <= 3600');
    }
    if (!(m.maxRecipients >= 1 && m.maxRecipients <= 100000)) errors.push('mailMerge.maxRecipients must be between 1 and 100000');
    if (!(f.sweepMinutes >= 1 && f.sweepMinutes <= 1440)) errors.push('followUps.sweepMinutes must be between 1 and 1440');
    if (!(f.reminderHour >= 0 && f.reminderHour <= 23)) errors.push('followUps.reminderHour must be between 0 and 23');
  }
  const ids = new Set((config.playbooks ?? []).map((p) => p.id));
  if (!ids.size) errors.push('At least one playbook is required in playbooks/');
  for (const id of config.defaultPlaybooks ?? []) {
    if (!ids.has(id)) errors.push(`defaultPlaybooks lists "${id}", but there is no playbooks/${id}.json`);
  }
  return { errors, warnings };
}

/**
 * @param {{ useEnv?: boolean, env?: Record<string, string | undefined>, root?: string }} [options]
 * useEnv: false gives the committed defaults only (used by tests, so a local .env can't change results).
 */
export function loadConfig({ useEnv = true, env = process.env, root = ROOT } = {}) {
  const config = JSON.parse(readFileSync(join(root, 'config/defaults.json'), 'utf8'));
  const errors = [];
  let only = null;

  if (useEnv) {
    const merged = { ...readEnvFile(root), ...env };
    for (const [name, path] of Object.entries(ENV_VARS)) {
      const raw = merged[name];
      if (raw === undefined || raw === '') continue;
      if (path === 'defaultPlaybooks') setPath(config, path, raw.split(',').map((s) => s.trim()).filter(Boolean));
      else if (NUMBER_PATHS.has(path)) {
        const n = Number(raw);
        if (!Number.isInteger(n)) errors.push(`${name} must be a whole number (got "${raw}")`);
        else setPath(config, path, n);
      } else setPath(config, path, raw.trim());
    }
    // PLAYBOOKS=freelancer,recruiter limits which playbook files are bundled.
    if (merged.PLAYBOOKS) only = merged.PLAYBOOKS.split(',').map((s) => s.trim()).filter(Boolean);
  }

  const dir = join(root, 'playbooks');
  const playbooks = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    let pb;
    try {
      pb = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    } catch (err) {
      errors.push(`playbooks/${file}: invalid JSON (${err.message})`);
      continue;
    }
    const problems = validatePlaybook(pb, file);
    if (problems.length) errors.push(...problems.map((p) => `playbooks/${p}`));
    else if (!only || only.includes(pb.id)) playbooks.push({ blurb: '', order: 100, ...pb });
  }
  if (only) for (const id of only) if (!playbooks.some((p) => p.id === id)) errors.push(`PLAYBOOKS lists "${id}", but there is no valid playbooks/${id}.json`);
  playbooks.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  config.playbooks = playbooks;

  const checked = validateConfig(config);
  errors.push(...checked.errors);
  if (errors.length) {
    throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
  }
  return { config, warnings: checked.warnings };
}
