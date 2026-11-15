import { describe, expect, it } from 'vitest';
import { SEED_STAGES, SEED_TEMPLATES, stagesFor, templatesFor, textColorFor } from '../src/lib/playbooks';
import { dayKey, memoryArea, migrate, SCHEMA_VERSION, SEND_CAP_CEILING, sanitizeSettings, Store, threadKey } from '../src/lib/storage';
import type { TrackedThread } from '../src/lib/types';

function thread(over: Partial<TrackedThread> = {}): TrackedThread {
  return {
    account: 'me@x.com',
    threadId: '18c1',
    stageId: 'freelancer:lead',
    subject: 'Hello',
    contact: { name: 'Ada', email: 'ada@x.com' },
    notes: '',
    followUpAt: null,
    followUpMessageCount: null,
    followUpDone: false,
    notifiedAt: null,
    updatedAt: 0,
    ...over,
  };
}

describe('migrate', () => {
  it('turns empty storage into seeded defaults', () => {
    const d = migrate({});
    expect(d.schemaVersion).toBe(SCHEMA_VERSION);
    expect(d.settings.playbooks).toEqual(['freelancer', 'recruiter', 'support']);
    expect(d.settings.onboarded).toBe(false);
    expect(d.templates).toHaveLength(SEED_TEMPLATES.length);
    expect(d.stages).toHaveLength(SEED_STAGES.length);
    expect(d.threads).toEqual({});
  });

  it('drops malformed templates, threads and campaigns', () => {
    const d = migrate({
      schemaVersion: 1,
      templates: [{ id: 'ok', name: 'Ok', emoji: '🙂', body: 'x', playbookId: 'custom' }, { id: 'bad' }, null],
      'thread:me@x.com:1': thread({ threadId: '1' }),
      'thread:me@x.com:2': { nope: true },
      'campaign:c1': { id: 'c1', rows: [], log: [], cursor: 0, createdAt: 1 },
      'campaign:c2': { id: 'c2' },
    });
    expect(d.templates.map((t) => t.id)).toEqual(['ok']);
    expect(Object.keys(d.threads)).toEqual(['thread:me@x.com:1']);
    expect(d.campaigns.map((c) => c.id)).toEqual(['c1']);
  });

  it('refuses data written by a newer schema', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/newer version/);
  });
});

describe('sanitizeSettings', () => {
  it('clamps the cap and interval and filters unknown playbooks', () => {
    const s = sanitizeSettings({ dailySendCap: 5000, sendIntervalSec: 1, playbooks: ['recruiter', 'nope', 'recruiter'], myName: 7 });
    expect(s.dailySendCap).toBe(SEND_CAP_CEILING);
    expect(s.sendIntervalSec).toBe(10);
    expect(s.playbooks).toEqual(['recruiter']);
    expect(s.myName).toBe('');
  });

  it('falls back to defaults for garbage values', () => {
    expect(sanitizeSettings({ dailySendCap: 'lots', sendIntervalSec: NaN })).toMatchObject({ dailySendCap: 100, sendIntervalSec: 30 });
    expect(sanitizeSettings({ dailySendCap: 0 }).dailySendCap).toBe(1);
  });
});

describe('Store', () => {
  it('initialises storage once and keeps user changes afterwards', async () => {
    const area = memoryArea();
    const store = new Store(area);
    await store.ensureInitialized();
    await store.saveSettings({ myName: 'Tunde', onboarded: true });
    await store.ensureInitialized();
    expect((await store.load()).settings).toMatchObject({ myName: 'Tunde', onboarded: true });
  });

  it('stores threads per account and thread id', async () => {
    const store = new Store(memoryArea());
    await store.saveThread(thread({ account: 'Me@X.com' }));
    await store.saveThread(thread({ account: 'other@x.com', stageId: 'freelancer:won' }));
    const data = await store.load();
    expect(Object.keys(data.threads).sort()).toEqual([threadKey('me@x.com', '18c1'), threadKey('other@x.com', '18c1')].sort());
    expect((await store.getThread('me@x.com', '18c1'))?.stageId).toBe('freelancer:lead');
    await store.deleteThread('me@x.com', '18c1');
    expect(await store.getThread('me@x.com', '18c1')).toBeNull();
  });

  it('counts sends per local day and resets on a new day', async () => {
    const store = new Store(memoryArea());
    const day1 = new Date(2026, 10, 15, 9).getTime();
    const day2 = new Date(2026, 10, 16, 0, 1).getTime();
    expect(await store.getSentToday(day1)).toBe(0);
    await store.incrementSent(day1);
    expect(await store.incrementSent(day1)).toBe(2);
    expect(await store.getSentToday(day2)).toBe(0);
    expect(await store.incrementSent(day2)).toBe(1);
    expect(dayKey(day2)).toBe('2026-11-16');
  });

  it('round-trips a backup and rejects foreign files', async () => {
    const a = new Store(memoryArea());
    await a.ensureInitialized();
    await a.saveSettings({ myName: 'Tunde' });
    await a.saveThread(thread());
    const json = await a.exportBackup();

    const b = new Store(memoryArea({ junk: 1 }));
    const restored = await b.importBackup(json);
    expect(restored.settings.myName).toBe('Tunde');
    expect(Object.keys(restored.threads)).toHaveLength(1);
    expect(Object.keys(await (b as unknown as { area: { get(k: null): Promise<object> } }).area.get(null))).not.toContain('junk');

    await expect(b.importBackup('{')).rejects.toThrow(/not valid JSON/);
    await expect(b.importBackup('{"app":"other","data":{}}')).rejects.toThrow(/not a Gmail Plus backup/);
  });
});

describe('playbooks', () => {
  it('filters stages and templates by active playbooks, keeping custom templates', () => {
    const stages = stagesFor(SEED_STAGES, ['support']);
    expect(stages.map((s) => s.name)).toEqual(['New', 'Waiting on customer', 'Resolved']);
    const templates = templatesFor([...SEED_TEMPLATES, { id: 'c', name: 'Mine', emoji: '⭐', body: 'x', playbookId: 'custom' }], ['recruiter']);
    expect(templates.every((t) => t.playbookId === 'recruiter' || t.playbookId === 'custom')).toBe(true);
    expect(templates.some((t) => t.id === 'c')).toBe(true);
  });

  it('keeps the order of the chosen playbooks', () => {
    const ids = stagesFor(SEED_STAGES, ['support', 'freelancer']).map((s) => s.playbookId);
    expect(ids.indexOf('freelancer')).toBeGreaterThan(ids.lastIndexOf('support'));
  });

  it('has unique ids and only valid colours', () => {
    expect(new Set(SEED_STAGES.map((s) => s.id)).size).toBe(SEED_STAGES.length);
    expect(new Set(SEED_TEMPLATES.map((t) => t.id)).size).toBe(SEED_TEMPLATES.length);
    expect(SEED_STAGES.every((s) => /^#[0-9a-f]{6}$/i.test(s.color))).toBe(true);
  });

  it('picks readable text colours', () => {
    expect(textColorFor('#1a73e8')).toBe('#ffffff');
    expect(textColorFor('#fbbc04')).toBe('#202124');
    expect(textColorFor('nonsense')).toBe('#ffffff');
  });
});
