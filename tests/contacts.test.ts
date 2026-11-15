import { describe, expect, it } from 'vitest';
import { contactKey, defaultConnectorSettings, memoryArea, migrate, sanitizeConnectorSettings, SCHEMA_VERSION, Store } from '../src/lib/storage';
import type { ContactCard } from '../src/lib/types';

const ME = 'me@x.com';
const ADA = { email: 'Ada@X.com', name: 'Ada Okafor' };

describe('contact cards', () => {
  it('saves, updates and removes a phone number per account and lower-cased email', async () => {
    const area = memoryArea();
    const store = new Store(area);
    await store.setHandle('Me@X.com', ADA, 'phone', '+447911123456');
    const key = contactKey(ME, 'ada@x.com');
    expect(key).toBe('contact:me@x.com:ada@x.com');
    expect(area.dump()[key]).toMatchObject({ account: ME, email: 'ada@x.com', name: 'Ada Okafor', handles: { phone: '+447911123456' } });

    await store.setHandle(ME, { email: 'ada@x.com' }, 'phone', '+2348031234567');
    expect(await store.getContact(ME, 'ADA@x.com')).toMatchObject({ name: 'Ada Okafor', handles: { phone: '+2348031234567' } });

    await store.setHandle(ME, ADA, 'phone', null);
    expect(area.dump()[key]).toBeUndefined();
    expect(await store.getContact(ME, ADA.email)).toBeNull();
  });

  it('remembers when a connector was opened, even without a saved number', async () => {
    const area = memoryArea();
    const store = new Store(area);
    await store.setHandle(ME, ADA, 'phone', '+447911123456');
    await store.markReached(ME, ADA, 'whatsapp', 1234);
    await store.setHandle(ME, ADA, 'phone', null);
    expect(await store.getContact(ME, ADA.email)).toMatchObject({ handles: {}, lastReached: { whatsapp: 1234 } });
  });

  it('adds numbers from a list without replacing ones the user saved', async () => {
    const store = new Store(memoryArea());
    await store.setHandle(ME, ADA, 'phone', '+447911123456');
    const added = await store.addHandles(ME, [
      { email: 'ada@x.com', name: 'Ada', kind: 'phone', value: '+2348031234567' },
      { email: 'bo@x.com', name: 'Bo', kind: 'phone', value: '+12025550123' },
      { email: 'BO@x.com', name: 'Bo', kind: 'phone', value: '+12025550199' },
    ]);
    expect(added).toBe(1);
    expect((await store.getContact(ME, 'ada@x.com'))?.handles.phone).toBe('+447911123456');
    expect(await store.getContact(ME, 'bo@x.com')).toMatchObject({ name: 'Bo', handles: { phone: '+12025550123' } });
    expect(await store.addHandles(ME, [])).toBe(0);
  });

  it('loads valid cards and drops malformed or mis-filed ones', () => {
    const good: ContactCard = { account: ME, email: 'ada@x.com', name: 'Ada', handles: { phone: '+447911123456', bad: 7 as unknown as string }, lastReached: { whatsapp: 5, x: 'no' as unknown as number }, updatedAt: 1 };
    const d = migrate({
      schemaVersion: 2,
      [contactKey(ME, 'ada@x.com')]: good,
      'contact:me@x.com:bo@x.com': { account: ME },
      'contact:me@x.com:wrong@x.com': { ...good, email: 'other@x.com' },
    });
    expect(Object.keys(d.contacts)).toEqual([contactKey(ME, 'ada@x.com')]);
    expect(d.contacts[contactKey(ME, 'ada@x.com')]).toMatchObject({ handles: { phone: '+447911123456' }, lastReached: { whatsapp: 5 } });
  });

  it('round-trips contacts through a backup', async () => {
    const store = new Store(memoryArea());
    await store.ensureInitialized();
    await store.setHandle(ME, ADA, 'phone', '+447911123456');
    const json = await store.exportBackup();
    const other = new Store(memoryArea());
    const restored = await other.importBackup(json);
    expect(Object.values(restored.contacts).map((c) => c.handles.phone)).toEqual(['+447911123456']);
    expect((await other.getContact(ME, 'ada@x.com'))?.name).toBe('Ada Okafor');
  });
});

describe('connector settings', () => {
  it('upgrades schema 2 data with connector defaults', () => {
    const d = migrate({ schemaVersion: 2, settings: { playbooks: ['support'], onboarded: true, dailySendCap: 50, sendIntervalSec: 30, myName: 'Sam' } });
    expect(d.schemaVersion).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(3);
    expect(d.settings.connectors).toEqual(defaultConnectorSettings());
    expect(d.settings).toMatchObject({ myName: 'Sam', dailySendCap: 50 });
    expect(d.contacts).toEqual({});
  });

  it('cleans stored values', () => {
    const s = sanitizeConnectorSettings({
      disabled: ['whatsapp', 'whatsapp', 7, 'Bad Id'],
      defaultCountry: 'gb',
      targets: { whatsapp: 'link', 'Bad Id': 'web', sms: 3 },
      message: 'x'.repeat(5000),
      offerAfterSend: 'yes',
    });
    expect(s.disabled).toEqual(['whatsapp']);
    expect(s.defaultCountry).toBe('');
    expect(s.targets).toEqual({ whatsapp: 'link' });
    expect(s.message).toHaveLength(4000);
    expect(s.offerAfterSend).toBe(true);
    expect(sanitizeConnectorSettings({ defaultCountry: '' }).defaultCountry).toBe('');
    expect(sanitizeConnectorSettings({ defaultCountry: 'NG' }).defaultCountry).toBe('NG');
    expect(sanitizeConnectorSettings(null)).toEqual(defaultConnectorSettings());
  });

  it('changes one connector setting and keeps the rest', async () => {
    const store = new Store(memoryArea());
    await store.ensureInitialized();
    await store.saveConnectorSettings({ defaultCountry: 'NG', targets: { whatsapp: 'link' } });
    const next = await store.saveConnectorSettings({ offerAfterSend: false });
    expect(next.connectors).toMatchObject({ defaultCountry: 'NG', targets: { whatsapp: 'link' }, offerAfterSend: false });
  });
});
