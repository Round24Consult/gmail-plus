import { describe, expect, it } from 'vitest';
import { makePlaybookId, SEED_STAGES, SEED_TEMPLATES } from '../src/lib/playbooks';
import { memoryArea, migrate, sanitizeSettings, SCHEMA_VERSION, Store } from '../src/lib/storage';
import type { TrackedThread } from '../src/lib/types';

function thread(stageId: string, threadId = 't1'): TrackedThread {
  return {
    account: 'me@x.com',
    threadId,
    stageId,
    subject: 'Hello',
    contact: null,
    notes: '',
    followUpAt: null,
    followUpMessageCount: null,
    followUpDone: false,
    notifiedAt: null,
    updatedAt: 0,
  };
}

async function freshStore() {
  const area = memoryArea();
  const store = new Store(area);
  await store.ensureInitialized();
  return { store, area };
}

describe('migration to schema 2', () => {
  it('keeps v1 data and adds the bundled playbooks as data', () => {
    const v1 = {
      schemaVersion: 1,
      settings: { playbooks: ['recruiter'], onboarded: true, dailySendCap: 50, sendIntervalSec: 20, myName: 'Tunde' },
      stages: SEED_STAGES,
      templates: [...SEED_TEMPLATES, { id: 'mine', name: 'Mine', emoji: '⭐', body: 'x', playbookId: 'custom' }],
      'thread:me@x.com:t1': thread('recruiter:interview'),
    };
    const d = migrate(v1);
    expect(d.schemaVersion).toBe(SCHEMA_VERSION);
    expect(d.playbooks.map((p) => p.id)).toEqual(['freelancer', 'recruiter', 'support']);
    expect(d.playbooks.every((p) => p.builtIn)).toBe(true);
    expect(d.settings).toMatchObject({ playbooks: ['recruiter'], dailySendCap: 50, myName: 'Tunde' });
    expect(d.templates.some((t) => t.id === 'mine')).toBe(true);
    expect(Object.keys(d.threads)).toHaveLength(1);
  });

  it('moves templates of a missing playbook to My templates and drops its stages', () => {
    const d = migrate({
      schemaVersion: 2,
      playbooks: [{ id: 'freelancer', name: 'Freelancer', blurb: '', builtIn: true }],
      seededPlaybooks: ['freelancer', 'recruiter', 'support'],
      stages: SEED_STAGES,
      templates: SEED_TEMPLATES,
    });
    expect(new Set(d.stages.map((s) => s.playbookId))).toEqual(new Set(['freelancer']));
    expect(d.templates.filter((t) => t.playbookId === 'custom').length).toBe(8);
  });
});

describe('bundled playbooks on update', () => {
  it('adds a newly shipped playbook once and never brings back a deleted one', async () => {
    const area = memoryArea({
      schemaVersion: 2,
      playbooks: [{ id: 'freelancer', name: 'Freelancer / agency', blurb: '', builtIn: true }],
      seededPlaybooks: ['freelancer'],
      stages: SEED_STAGES.filter((s) => s.playbookId === 'freelancer'),
      templates: SEED_TEMPLATES.filter((t) => t.playbookId === 'freelancer'),
      settings: { playbooks: ['freelancer'], onboarded: true },
    });
    const store = new Store(area);
    let d = await store.ensureInitialized();
    expect(d.playbooks.map((p) => p.id)).toEqual(['freelancer', 'recruiter', 'support']);
    expect(d.stages.some((s) => s.id === 'support:new')).toBe(true);
    expect(d.settings.playbooks).toEqual(['freelancer']);

    await store.deletePlaybook('support');
    d = await store.ensureInitialized();
    expect(d.playbooks.map((p) => p.id)).toEqual(['freelancer', 'recruiter']);
  });
});

describe('creating and deleting playbooks', () => {
  it('creates a playbook with its stages and switches it on', async () => {
    const { store } = await freshStore();
    await store.createPlaybook({ id: 'real-estate', name: 'Real estate', blurb: '' }, [
      { name: 'New', color: '#1a73e8' },
      { name: 'Sold', color: '#188038', closed: true },
    ]);
    const d = await store.load();
    expect(d.playbooks.at(-1)).toMatchObject({ id: 'real-estate', builtIn: false });
    expect(d.stages.filter((s) => s.playbookId === 'real-estate').map((s) => [s.name, s.order, !!s.closed])).toEqual([
      ['New', 0, false],
      ['Sold', 1, true],
    ]);
    expect(d.settings.playbooks).toContain('real-estate');
    await expect(store.createPlaybook({ id: 'real-estate', name: 'Again', blurb: '' }, [{ name: 'A', color: '#000000' }])).rejects.toThrow(/not available/);
  });

  it('refuses to delete a playbook with tracked conversations, then keeps its templates', async () => {
    const { store } = await freshStore();
    await store.saveThread(thread('support:new'));
    await expect(store.deletePlaybook('support')).rejects.toThrow(/1 tracked conversation/);
    await store.deleteThread('me@x.com', 't1');
    await store.deletePlaybook('support');
    const d = await store.load();
    expect(d.playbooks.some((p) => p.id === 'support')).toBe(false);
    expect(d.stages.some((s) => s.playbookId === 'support')).toBe(false);
    expect(d.settings.playbooks).not.toContain('support');
    expect(d.templates.filter((t) => t.id.startsWith('support:')).every((t) => t.playbookId === 'custom')).toBe(true);
  });
});

describe('deleting stages', () => {
  it('moves conversations to the chosen stage and renumbers the rest', async () => {
    const { store } = await freshStore();
    await store.saveThread(thread('freelancer:proposal', 'a'));
    await store.saveThread(thread('freelancer:proposal', 'b'));
    await expect(store.deleteStage('freelancer:proposal')).rejects.toThrow(/Choose a stage/);
    await expect(store.deleteStage('freelancer:proposal', 'recruiter:offer')).rejects.toThrow(/Choose a stage/);
    await store.deleteStage('freelancer:proposal', 'freelancer:negotiating');
    const d = await store.load();
    expect(Object.values(d.threads).map((t) => t.stageId)).toEqual(['freelancer:negotiating', 'freelancer:negotiating']);
    expect(d.stages.filter((s) => s.playbookId === 'freelancer').map((s) => [s.id, s.order])).toEqual([
      ['freelancer:lead', 0],
      ['freelancer:negotiating', 1],
      ['freelancer:won', 2],
      ['freelancer:lost', 3],
    ]);
  });

  it('keeps at least one stage per playbook', async () => {
    const { store } = await freshStore();
    await store.deleteStage('support:new');
    await store.deleteStage('support:waiting');
    await expect(store.deleteStage('support:resolved')).rejects.toThrow(/at least one stage/);
  });
});

describe('settings and ids', () => {
  it('drops active playbooks that no longer exist', () => {
    expect(sanitizeSettings({ playbooks: ['freelancer', 'gone'] }, ['freelancer', 'mine']).playbooks).toEqual(['freelancer']);
  });

  it('turns names into unique ids', () => {
    expect(makePlaybookId('Real Estate!', [])).toBe('real-estate');
    expect(makePlaybookId('Real Estate', ['real-estate'])).toBe('real-estate-2');
    expect(makePlaybookId('Custom', [])).toBe('custom-2');
    expect(makePlaybookId('???', [])).toBe('playbook');
    expect(makePlaybookId('Café', [])).toBe('cafe');
  });

  it('round-trips user playbooks through a backup', async () => {
    const { store } = await freshStore();
    await store.createPlaybook({ id: 'events', name: 'Events', blurb: '' }, [{ name: 'Booked', color: '#1a73e8' }]);
    const json = await store.exportBackup();
    const other = new Store(memoryArea());
    const restored = await other.importBackup(json);
    expect(restored.playbooks.some((p) => p.id === 'events' && !p.builtIn)).toBe(true);
    expect(restored.stages.some((s) => s.playbookId === 'events')).toBe(true);
  });
});
