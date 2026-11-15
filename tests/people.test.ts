import { describe, expect, it } from 'vitest';
import { isAutomatedAddress, mergePeople, parseAddressList, rememberPeople, SEEN_GAP_MS, searchPeople, toPeopleList, type Person } from '../src/lib/people';
import { memoryArea, migrate, peopleKey, sanitizeSettings, Store } from '../src/lib/storage';

const ME = 'me@x.com';
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function person(email: string, name = '', over: Partial<Person> = {}): Person {
  return { email, name, seen: NOW, count: 1, ...over };
}

describe('rememberPeople', () => {
  it('adds new people, lower-cases addresses and skips me, automated senders and invalid addresses', () => {
    const { list, changed } = rememberPeople([], [
      { email: 'Ada@X.com', name: 'Ada Okafor' },
      { email: ME, name: 'Me' },
      { email: 'noreply@shop.com', name: 'Shop' },
      { email: 'notifications@github.com' },
      { email: 'not-an-address' },
      { email: 'bo@y.com', name: 'bo@y.com' },
    ], NOW, { cap: 100, me: ME });
    expect(changed).toBe(true);
    expect(list).toEqual([person('ada@x.com', 'Ada Okafor'), person('bo@y.com', '')]);
  });

  it('only reports a change when something worth saving happened', () => {
    const start = [person('ada@x.com', '')];
    expect(rememberPeople(start, [{ email: 'ada@x.com' }], NOW + 1000, { cap: 100, me: ME }).changed).toBe(false);
    const named = rememberPeople(start, [{ email: 'ada@x.com', name: 'Ada' }], NOW + 1000, { cap: 100, me: ME });
    expect(named).toEqual({ changed: true, list: [person('ada@x.com', 'Ada')] });
    const later = rememberPeople(start, [{ email: 'ada@x.com' }], NOW + SEEN_GAP_MS, { cap: 100, me: ME });
    expect(later.list[0]).toMatchObject({ seen: NOW + SEEN_GAP_MS, count: 2 });
  });

  it('keeps the most recently seen people when over the cap', () => {
    const start = [person('old@x.com', '', { seen: NOW - 10 * DAY }), person('mid@x.com', '', { seen: NOW - DAY })];
    const { list } = rememberPeople(start, [{ email: 'new@x.com' }], NOW, { cap: 2, me: ME });
    expect(list.map((p) => p.email).sort()).toEqual(['mid@x.com', 'new@x.com']);
  });

  it('recognises automated senders without catching real people', () => {
    expect(['noreply@a.com', 'no-reply@a.com', 'do-not-reply@a.com', 'mailer-daemon@a.com', 'alerts+x@a.com', 'billing-noreply@a.com'].every(isAutomatedAddress)).toBe(true);
    expect(['nora@a.com', 'info@a.com', 'ada.okafor@a.com', 'alertness@a.com'].some(isAutomatedAddress)).toBe(false);
  });
});

describe('searchPeople', () => {
  const people = [
    person('ada.okafor@acme.com', 'Ada Okafor', { count: 2 }),
    person('adam@beta.io', 'Adam Smith', { count: 9 }),
    person('obi@acme.com', 'Chidi Obi'),
    person('kunle@bello.ng', '', { seen: NOW - 90 * DAY }),
  ];

  it('matches the start of names, words and addresses before substrings', () => {
    expect(searchPeople(people, 'oka', { now: NOW }).map((p) => p.email)).toEqual(['ada.okafor@acme.com']);
    expect(searchPeople(people, 'acme', { now: NOW }).map((p) => p.email)).toEqual(['ada.okafor@acme.com', 'obi@acme.com']);
    expect(searchPeople(people, 'ada', { now: NOW })[0]?.email).toBe('ada.okafor@acme.com');
  });

  it('needs every word to match, and leaves out people already picked', () => {
    expect(searchPeople(people, 'ada smith', { now: NOW }).map((p) => p.email)).toEqual(['adam@beta.io']);
    expect(searchPeople(people, 'ada', { now: NOW, exclude: new Set(['ada.okafor@acme.com']) }).map((p) => p.email)).toEqual(['adam@beta.io']);
    expect(searchPeople(people, 'zzz', { now: NOW })).toEqual([]);
  });

  it('lists the most relevant people for an empty query, up to the limit', () => {
    const top = searchPeople(people, '  ', { now: NOW, limit: 2 });
    expect(top.map((p) => p.email)).toEqual(['adam@beta.io', 'ada.okafor@acme.com']);
  });
});

describe('address lists', () => {
  it('reads names and addresses in the usual forms', () => {
    const { people, invalid } = parseAddressList('Okafor, Ada <ada@x.com>; bo@y.com\n"Chi Obi" <chi@z.org>, BO@y.com, broken@, x@y');
    expect(people).toEqual([
      { email: 'ada@x.com', name: 'Okafor, Ada' },
      { email: 'bo@y.com', name: undefined },
      { email: 'chi@z.org', name: 'Chi Obi' },
    ]);
    expect(invalid).toBe(2);
  });

  it('merges sources by address, keeping names and adding counts', () => {
    const merged = mergePeople([person('ada@x.com', '', { count: 2, seen: 5 })], [person('ADA@x.com', 'Ada', { seen: 9 })]);
    expect(merged).toEqual([{ email: 'ada@x.com', name: 'Ada', seen: 9, count: 3 }]);
  });

  it('cleans stored lists', () => {
    expect(toPeopleList([{ email: 'A@x.com', name: 'A', seen: 1, count: 2 }, { email: 'bad' }, null, 'x'])).toEqual([{ email: 'a@x.com', name: 'A', seen: 1, count: 2 }]);
    expect(toPeopleList('nope')).toEqual([]);
  });
});

describe('address book storage', () => {
  it('keeps one key per account, written only when something changed', async () => {
    const area = memoryArea();
    const store = new Store(area);
    expect(await store.rememberPeople('Me@X.com', [{ email: 'ada@x.com', name: 'Ada' }], NOW)).toBe(true);
    expect(await store.rememberPeople(ME, [{ email: 'ada@x.com', name: 'Ada' }], NOW + 1000)).toBe(false);
    expect(area.dump()[peopleKey(ME)]).toEqual([person('ada@x.com', 'Ada')]);
    expect(await store.getPeople('ME@x.com')).toHaveLength(1);
    expect(await store.countPeople()).toBe(1);
    await store.forgetPeople();
    expect(await store.countPeople()).toBe(0);
  });

  it('stays out of StoreData but survives a backup', async () => {
    const store = new Store(memoryArea());
    await store.ensureInitialized();
    await store.rememberPeople(ME, [{ email: 'ada@x.com', name: 'Ada' }], NOW);
    expect(Object.keys(migrate({ [peopleKey(ME)]: [person('ada@x.com')] }))).not.toContain(peopleKey(ME));
    const other = new Store(memoryArea());
    await other.importBackup(await store.exportBackup());
    expect(await other.getPeople(ME)).toEqual([person('ada@x.com', 'Ada')]);
  });

  it('has a setting that defaults to on', () => {
    expect(sanitizeSettings({}).rememberPeople).toBe(true);
    expect(sanitizeSettings({ rememberPeople: false }).rememberPeople).toBe(false);
    expect(sanitizeSettings({ rememberPeople: 'no' }).rememberPeople).toBe(true);
  });
});
