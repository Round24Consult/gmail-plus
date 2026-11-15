import type { RowResult } from './types';

export type QueueStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'capped' | 'done';

export interface QueueState {
  status: QueueStatus;
  cursor: number;
  total: number;
  results: RowResult[];
  nextSendAt: number | null;
  lastSentAt: number | null;
  sentToday: number;
}

export interface QueueDeps {
  send(row: Record<string, string>, index: number): Promise<void>;
  now(): number;
  /** Resolves after `ms`, or as soon as `signal` aborts. Must not reject on abort. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  sentToday(now: number): Promise<number>;
  recordSent(now: number): Promise<number>;
  /** Return a reason to skip a row without sending it, or null to send. */
  skipReason?(row: Record<string, string>, index: number): string | null;
  onProgress?(state: QueueState): void;
}

export interface QueueOptions {
  intervalMs: number;
  dailyCap: number;
}

export interface QueueResume {
  cursor: number;
  results: RowResult[];
  lastSentAt?: number | null;
}

/**
 * Sends rows one at a time with a fixed gap between sends and stops for the day at the cap.
 * Pause and stop take effect after the send in flight finishes.
 */
export class SendQueue {
  private readonly state: QueueState;
  private abort: AbortController | null = null;
  private loop: Promise<void> | null = null;

  constructor(
    private readonly rows: Record<string, string>[],
    private readonly opts: QueueOptions,
    private readonly deps: QueueDeps,
    resume?: QueueResume,
  ) {
    this.state = {
      status: 'idle',
      cursor: Math.min(Math.max(resume?.cursor ?? 0, 0), rows.length),
      total: rows.length,
      results: [...(resume?.results ?? [])],
      nextSendAt: null,
      lastSentAt: resume?.lastSentAt ?? null,
      sentToday: 0,
    };
  }

  getState(): QueueState {
    return { ...this.state, results: [...this.state.results] };
  }

  /** Starts or resumes. Resolves when the queue finishes, pauses, stops or hits the cap. */
  start(): Promise<void> {
    if (this.loop) return this.loop;
    if (this.state.status === 'stopped' || this.state.status === 'done') return Promise.resolve();
    this.abort = new AbortController();
    this.loop = this.run(this.abort.signal).finally(() => {
      this.loop = null;
    });
    return this.loop;
  }

  pause(): void {
    if (this.state.status !== 'running') return;
    this.state.status = 'paused';
    this.state.nextSendAt = null;
    this.abort?.abort();
    this.emit();
  }

  stop(): void {
    if (this.state.status === 'done' || this.state.status === 'stopped') return;
    this.state.status = 'stopped';
    this.state.nextSendAt = null;
    this.abort?.abort();
    this.emit();
  }

  private emit(): void {
    this.deps.onProgress?.(this.getState());
  }

  private async run(signal: AbortSignal): Promise<void> {
    const { deps, opts, state } = this;
    state.status = 'running';
    state.sentToday = await deps.sentToday(deps.now());
    this.emit();

    while (state.cursor < state.total) {
      if (signal.aborted) return;
      const index = state.cursor;
      const row = this.rows[index] ?? {};
      const email = row.email ?? '';

      const skip = deps.skipReason?.(row, index) ?? null;
      if (skip) {
        state.results.push({ index, email, status: 'skipped', error: skip, at: deps.now() });
        state.cursor++;
        this.emit();
        continue;
      }

      if (state.lastSentAt !== null) {
        const wait = state.lastSentAt + opts.intervalMs - deps.now();
        if (wait > 0) {
          state.nextSendAt = deps.now() + wait;
          this.emit();
          await deps.sleep(wait, signal);
          if (signal.aborted) return;
        }
      }

      state.sentToday = await deps.sentToday(deps.now());
      if (state.sentToday >= opts.dailyCap) {
        state.status = 'capped';
        state.nextSendAt = null;
        this.emit();
        return;
      }

      state.nextSendAt = null;
      try {
        await deps.send(row, index);
        state.sentToday = await deps.recordSent(deps.now());
        state.results.push({ index, email, status: 'sent', at: deps.now() });
      } catch (err) {
        state.results.push({
          index,
          email,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          at: deps.now(),
        });
      }
      state.lastSentAt = deps.now();
      state.cursor++;
      this.emit();
    }

    if (!signal.aborted) {
      state.status = 'done';
      this.emit();
    }
  }
}

/** Real-time sleep that ends early on abort. */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}
