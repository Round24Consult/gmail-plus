import { describe, expect, it } from 'vitest';
import { abortableSleep, SendQueue, type QueueDeps, type QueueState } from '../src/lib/sendQueue';

function harness(opts: { sentToday?: number; failOn?: number[]; startAt?: number } = {}) {
  let clock = opts.startAt ?? new Date(2026, 10, 15, 9).getTime();
  let counterDay = new Date(clock).getDate();
  let sent = opts.sentToday ?? 0;
  const sends: Array<{ index: number; at: number }> = [];
  const progress: QueueState[] = [];
  const dayOf = (t: number) => new Date(t).getDate();
  const deps: QueueDeps & { advance(ms: number): void } = {
    now: () => clock,
    advance(ms) {
      clock += ms;
    },
    async sleep(ms, signal) {
      if (!signal.aborted) clock += ms;
    },
    async send(_row, index) {
      if (opts.failOn?.includes(index)) throw new Error(`boom ${index}`);
      sends.push({ index, at: clock });
    },
    async sentToday(now) {
      if (dayOf(now) !== counterDay) {
        counterDay = dayOf(now);
        sent = 0;
      }
      return sent;
    },
    async recordSent() {
      sent += 1;
      return sent;
    },
    onProgress: (s) => progress.push(s),
  };
  return { deps, sends, progress };
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ email: `p${i}@x.com` }));

describe('SendQueue', () => {
  it('sends every row with the fixed interval between sends', async () => {
    const { deps, sends } = harness();
    const q = new SendQueue(rows(3), { intervalMs: 30_000, dailyCap: 100 }, deps);
    await q.start();
    expect(q.getState().status).toBe('done');
    expect(sends.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(sends[1]!.at - sends[0]!.at).toBe(30_000);
    expect(sends[2]!.at - sends[1]!.at).toBe(30_000);
  });

  it('stops at the daily cap and resumes the next day', async () => {
    const { deps, sends } = harness({ sentToday: 98 });
    const q = new SendQueue(rows(5), { intervalMs: 1000, dailyCap: 100 }, deps);
    await q.start();
    expect(q.getState()).toMatchObject({ status: 'capped', cursor: 2, sentToday: 100 });
    expect(sends).toHaveLength(2);

    deps.advance(24 * 3600 * 1000);
    await q.start();
    expect(q.getState().status).toBe('done');
    expect(sends.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('logs failures, keeps going, and does not count them toward the cap', async () => {
    const { deps } = harness();
    const q = new SendQueue(rows(3), { intervalMs: 10, dailyCap: 100 }, deps);
    await q.start();
    const s = q.getState();
    expect(s.results.map((r) => r.status)).toEqual(['sent', 'sent', 'sent']);

    const h2 = harness({ failOn: [1] });
    const q2 = new SendQueue(rows(3), { intervalMs: 10, dailyCap: 100 }, h2.deps);
    await q2.start();
    const s2 = q2.getState();
    expect(s2.results.map((r) => r.status)).toEqual(['sent', 'failed', 'sent']);
    expect(s2.results[1]!.error).toBe('boom 1');
    expect(s2.sentToday).toBe(2);
  });

  it('skips rows without waiting or counting them', async () => {
    const { deps, sends } = harness();
    deps.skipReason = (row) => (row.email === 'p1@x.com' ? 'missing company' : null);
    const q = new SendQueue(rows(3), { intervalMs: 1000, dailyCap: 100 }, deps);
    await q.start();
    expect(q.getState().results.map((r) => [r.status, r.error])).toEqual([
      ['sent', undefined],
      ['skipped', 'missing company'],
      ['sent', undefined],
    ]);
    expect(sends[1]!.at - sends[0]!.at).toBe(1000);
  });

  it('pauses after the send in flight and resumes where it left off', async () => {
    const { deps, sends } = harness();
    const q = new SendQueue(rows(4), { intervalMs: 1000, dailyCap: 100 }, deps);
    deps.onProgress = (s) => {
      if (s.cursor === 2 && s.status === 'running') q.pause();
    };
    await q.start();
    expect(q.getState()).toMatchObject({ status: 'paused', cursor: 2 });
    expect(sends).toHaveLength(2);

    deps.onProgress = undefined;
    await q.start();
    expect(q.getState().status).toBe('done');
    expect(sends.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it('cannot be restarted after stop', async () => {
    const { deps, sends } = harness();
    const q = new SendQueue(rows(3), { intervalMs: 1000, dailyCap: 100 }, deps);
    deps.onProgress = (s) => {
      if (s.cursor === 1) q.stop();
    };
    await q.start();
    await q.start();
    expect(q.getState().status).toBe('stopped');
    expect(sends).toHaveLength(1);
  });

  it('resumes from saved progress and honours the gap since the last send', async () => {
    const { deps, sends } = harness();
    const lastSentAt = deps.now() - 400;
    const q = new SendQueue(rows(3), { intervalMs: 1000, dailyCap: 100 }, deps, {
      cursor: 2,
      results: [
        { index: 0, email: 'p0@x.com', status: 'sent', at: 1 },
        { index: 1, email: 'p1@x.com', status: 'sent', at: 2 },
      ],
      lastSentAt,
    });
    await q.start();
    expect(sends).toEqual([{ index: 2, at: lastSentAt + 1000 }]);
    expect(q.getState().results).toHaveLength(3);
  });

  it('returns the same promise when started twice', () => {
    const { deps } = harness();
    const q = new SendQueue(rows(1), { intervalMs: 1, dailyCap: 1 }, deps);
    expect(q.start()).toBe(q.start());
  });
});

describe('abortableSleep', () => {
  it('ends early when aborted', async () => {
    const c = new AbortController();
    const started = Date.now();
    const p = abortableSleep(10_000, c.signal);
    c.abort();
    await p;
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
