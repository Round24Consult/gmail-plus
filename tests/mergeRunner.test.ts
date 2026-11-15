import { describe, expect, it } from 'vitest';
import { missingFor, recoverInFlight, runningElsewhere } from '../src/content/mergeRunner';
import type { Campaign } from '../src/lib/types';

function campaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: 'c1',
    account: 'me@x.com',
    name: 'list',
    subject: 'Hi {{firstName}}',
    body: 'About {{company}}',
    rows: [{ email: 'a@x.com', name: 'Ada' }, { email: 'b@x.com', name: 'Bo', company: 'Acme' }, { email: 'c@x.com' }],
    status: 'running',
    cursor: 1,
    log: [{ index: 0, email: 'a@x.com', status: 'sent', at: 1 }],
    createdAt: 0,
    heartbeatAt: null,
    ...over,
  };
}

describe('recoverInFlight', () => {
  it('marks the row that was sending when the page closed and moves past it', () => {
    const c = recoverInFlight(campaign({ inFlight: 1 }), 99);
    expect(c.cursor).toBe(2);
    expect(c.inFlight).toBeNull();
    expect(c.log.at(-1)).toMatchObject({ index: 1, email: 'b@x.com', status: 'failed', at: 99 });
    expect(c.log.at(-1)?.error).toMatch(/Sent folder/);
  });

  it('leaves the campaign alone when nothing was in flight or the row already finished', () => {
    expect(recoverInFlight(campaign()).cursor).toBe(1);
    expect(recoverInFlight(campaign({ inFlight: 0 })).cursor).toBe(1);
    expect(recoverInFlight(campaign({ inFlight: 3, cursor: 3 })).cursor).toBe(3);
    expect(recoverInFlight(campaign({ inFlight: 1 })).log).toHaveLength(2);
  });
});

describe('missingFor', () => {
  it('lists variables with no value for a row, across subject and body', () => {
    const c = campaign();
    expect(missingFor(c, { email: 'a@x.com', name: 'Ada' }, 'Me')).toEqual(['company']);
    expect(missingFor(c, { email: 'info@x.com' }, 'Me').sort()).toEqual(['company', 'firstname']);
    expect(missingFor(c, { email: 'b@x.com', name: 'Bo', company: 'Acme' }, 'Me')).toEqual([]);
  });
});

describe('runningElsewhere', () => {
  it('trusts a fresh heartbeat and ignores a stale one', () => {
    expect(runningElsewhere(campaign({ heartbeatAt: 1_000 }), 30_000)).toBe(true);
    expect(runningElsewhere(campaign({ heartbeatAt: 1_000 }), 120_000)).toBe(false);
    expect(runningElsewhere(campaign({ status: 'paused', heartbeatAt: 1_000 }), 2_000)).toBe(false);
  });
});
