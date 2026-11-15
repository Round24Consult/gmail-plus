import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, validatePlaybook } from '../scripts/load-config.mjs';
import { CONFIG } from '../src/config';

const ROOT = join(__dirname, '..');
const roots: string[] = [];

/** A copy of config/ and playbooks/ in a temp folder, so tests never read the developer's .env. */
function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gp-config-'));
  cpSync(join(ROOT, 'config'), join(dir, 'config'), { recursive: true });
  cpSync(join(ROOT, 'playbooks'), join(dir, 'playbooks'), { recursive: true });
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

const goodPlaybook = {
  id: 'real-estate',
  name: 'Real estate',
  blurb: 'Listings and viewings.',
  stages: [{ key: 'new', name: 'New', color: '#1a73e8' }, { key: 'viewing', name: 'Viewing', color: '#e37400' }],
  templates: [{ key: 'hello', emoji: '🏠', name: 'Hello', body: 'Hi {{firstName|there}}' }],
};

describe('loadConfig', () => {
  it('bundles every playbook file in order and warns when no InboxSDK app id is set', () => {
    const { config, warnings } = loadConfig({ useEnv: false, root: fixture() });
    expect(config.playbooks.map((p) => p.id)).toEqual(['freelancer', 'recruiter', 'support']);
    expect(config.appName).toBe('Gmail Plus');
    expect(warnings.join(' ')).toMatch(/INBOXSDK_APP_ID/);
  });

  it('applies environment variables over the defaults', () => {
    const { config, warnings } = loadConfig({
      root: fixture(),
      env: {
        APP_NAME: 'Inbox Pro',
        APP_SLUG: 'inbox-pro',
        INBOXSDK_APP_ID: 'sdk_InboxPro_0123456789',
        MERGE_MAX_DAILY_CAP: '2000',
        MERGE_DEFAULT_DAILY_CAP: '500',
        FOLLOW_UP_REMINDER_HOUR: '8',
        DEFAULT_PLAYBOOKS: 'recruiter, support',
      },
    });
    expect(config).toMatchObject({ appName: 'Inbox Pro', appSlug: 'inbox-pro', inboxSdkAppId: 'sdk_InboxPro_0123456789', defaultPlaybooks: ['recruiter', 'support'] });
    expect(config.mailMerge).toMatchObject({ maxDailyCap: 2000, defaultDailyCap: 500 });
    expect(config.followUps.reminderHour).toBe(8);
    expect(warnings).toEqual([]);
  });

  it('reads a .env file, with real environment variables taking priority', () => {
    const root = fixture();
    writeFileSync(join(root, '.env'), 'APP_NAME=From File\nSUPPORT_EMAIL=help@example.com\n');
    const { config } = loadConfig({ root, env: { APP_NAME: 'From Env' } });
    expect(config.appName).toBe('From Env');
    expect(config.supportEmail).toBe('help@example.com');
  });

  it('can limit which playbooks are bundled', () => {
    const { config } = loadConfig({ root: fixture(), env: { PLAYBOOKS: 'support' } });
    expect(config.playbooks.map((p) => p.id)).toEqual(['support']);
  });

  it('picks up a new playbook file with no code change', () => {
    const root = fixture();
    writeFileSync(join(root, 'playbooks/real-estate.json'), JSON.stringify({ ...goodPlaybook, order: 5 }));
    const { config } = loadConfig({ useEnv: false, root });
    expect(config.playbooks[0]).toMatchObject({ id: 'real-estate', order: 5 });
  });

  it.each([
    [{ MERGE_DEFAULT_DAILY_CAP: '900' }, /defaultDailyCap/],
    [{ MERGE_MAX_DAILY_CAP: '5000' }, /2000 or less/],
    [{ MERGE_MIN_INTERVAL_SEC: '60', MERGE_DEFAULT_INTERVAL_SEC: '30' }, /intervals/],
    [{ MERGE_MAX_INTERVAL_SEC: '7200' }, /3600/],
    [{ MERGE_MAX_RECIPIENTS: 'lots' }, /whole number/],
    [{ FOLLOW_UP_REMINDER_HOUR: '25' }, /reminderHour/],
    [{ INBOXSDK_APP_ID: 'my-app' }, /inboxSdkAppId/],
    [{ APP_SLUG: 'Not A Slug' }, /appSlug/],
    [{ DEFAULT_PLAYBOOKS: 'nope' }, /no playbooks\/nope.json/],
    [{ PLAYBOOKS: 'nope' }, /PLAYBOOKS lists "nope"/],
  ])('rejects %j', (env, message) => {
    expect(() => loadConfig({ root: fixture(), env })).toThrow(message);
  });

  it('reports a broken playbook file by name', () => {
    const root = fixture();
    writeFileSync(join(root, 'playbooks/broken.json'), '{ not json');
    expect(() => loadConfig({ useEnv: false, root })).toThrow(/playbooks\/broken.json: invalid JSON/);
  });

  it('feeds the same defaults to the app during tests', () => {
    expect(CONFIG.playbooks.length).toBe(3);
    expect(CONFIG.mailMerge.maxDailyCap).toBe(400);
  });
});

describe('validatePlaybook', () => {
  it('accepts a well-formed playbook', () => {
    expect(validatePlaybook(goodPlaybook, 'real-estate.json')).toEqual([]);
  });

  it('lists every problem', () => {
    const errors = validatePlaybook(
      {
        id: 'X',
        name: '',
        stages: [{ key: 'a', name: 'A', color: 'blue' }, { key: 'a', name: '', color: '#000000' }],
        templates: [{ key: 't', name: 'T', body: '' }],
      },
      'other.json',
    );
    expect(errors.join('\n')).toMatch(/"id"/);
    expect(errors.join('\n')).toMatch(/"name" is required/);
    expect(errors.join('\n')).toMatch(/"color"/);
    expect(errors.join('\n')).toMatch(/duplicate key "a"/);
    expect(errors.join('\n')).toMatch(/"body" is required/);
  });

  it('requires the file name to match the id and at least one stage', () => {
    expect(validatePlaybook({ ...goodPlaybook }, 'wrong.json').join(' ')).toMatch(/real-estate.json/);
    expect(validatePlaybook({ ...goodPlaybook, stages: [] }, 'real-estate.json').join(' ')).toMatch(/at least one stage/);
  });
});
