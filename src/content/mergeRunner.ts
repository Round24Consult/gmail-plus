import type { ComposeView, InboxSDK } from '@inboxsdk/core';
import { enabledConnectors } from '../lib/connectors/registry';
import { handlesFromRow } from '../lib/connectors/rows';
import { abortableSleep, SendQueue, type QueueState, type QueueStatus } from '../lib/sendQueue';
import { buildContext, render, renderHtml } from '../lib/template';
import type { Campaign, CampaignStatus, RowResult, TrackedThread } from '../lib/types';
import { getData, store } from '../shared/live';
import { myName, type Ctx } from './context';

/** A campaign whose runner has not written a heartbeat for this long is treated as interrupted. */
export const HEARTBEAT_STALE_MS = 60_000;
const HEARTBEAT_EVERY_MS = 20_000;
const SEND_CONFIRM_TIMEOUT_MS = 90_000;

/** Compose windows opened by mail merge, so other features (the after-send offer) can leave them alone. */
const automatedComposes = new WeakSet<ComposeView>();

export function isAutomatedCompose(cv: ComposeView): boolean {
  return automatedComposes.has(cv);
}

/** Saves phone numbers (and other connector addresses) from a sent row on the contact, keeping any already saved. */
function rememberAddresses(account: string, row: Record<string, string>): void {
  const { connectors } = getData().settings;
  const entries = handlesFromRow(row, enabledConnectors(connectors), connectors.defaultCountry);
  if (entries.length) void store.addHandles(account, entries).catch(() => undefined);
}

/** Opens a Gmail compose window, fills it and sends it. Resolves with the new thread id once Gmail confirms. */
export async function sendViaCompose(sdk: InboxSDK, to: string, subject: string, html: string): Promise<{ threadId: string | null }> {
  const cv = await sdk.Compose.openNewComposeView();
  automatedComposes.add(cv);
  return new Promise((resolve, reject) => {
    let sending = false;
    let settled = false;
    const timer = setTimeout(
      () => finish(new Error('Gmail did not confirm the send in time. Check your Sent folder before sending to this person again.')),
      SEND_CONFIRM_TIMEOUT_MS,
    );

    function finish(err: Error | null, threadId: string | null = null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        if (!sending && !cv.destroyed) cv.close();
        reject(err);
      } else {
        resolve({ threadId });
      }
    }

    cv.on('sending', () => {
      sending = true;
    });
    cv.on('sendCanceled', () => finish(new Error('The send was cancelled in Gmail.')));
    cv.on('sent', (event) => {
      event.getThreadID().then(
        (id) => finish(null, id),
        () => finish(null, null),
      );
    });
    cv.on('destroy', (event) => {
      if (event.closedByInboxSDK) return;
      // Gmail closes the window as it starts sending and may report "sending" or "sent" a little later.
      setTimeout(() => {
        if (!sending) finish(new Error('The message window closed before sending.'));
      }, 10_000);
    });

    try {
      cv.setToRecipients([to]);
      cv.setSubject(subject);
      const existing = cv.getHTMLContent(); // usually just the Gmail signature
      cv.setBodyHTML(existing.trim() ? `${html}<br><br>${existing}` : html);
      cv.send();
    } catch (err) {
      finish(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export function missingFor(campaign: Pick<Campaign, 'subject' | 'body'>, row: Record<string, string>, me: string): string[] {
  const vars = buildContext(row, { myName: me });
  return [...new Set([...render(campaign.subject, vars).missing, ...render(campaign.body, vars).missing])];
}

function toCampaignStatus(s: QueueStatus): CampaignStatus {
  return s === 'idle' ? 'paused' : s;
}

function lastAttemptAt(log: RowResult[]): number | null {
  const times = log.filter((r) => r.status !== 'skipped').map((r) => r.at);
  return times.length ? Math.max(...times) : null;
}

export interface RunOptions {
  sendAnyway: boolean;
  /** Stage to put each sent conversation in, or '' to leave the pipeline alone. */
  addToStageId: string;
}

interface Active {
  campaignId: string;
  queue: SendQueue;
  state: QueueState;
}

let active: Active | null = null;
/** Set synchronously so a double click cannot start two runs before `active` is assigned. */
let starting = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function activeRun(): Readonly<Active> | null {
  return active;
}

export function isBusy(): boolean {
  return starting || active !== null;
}

export function onRunChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pauseActive(): void {
  active?.queue.pause();
}

export function stopActive(): void {
  active?.queue.stop();
}

function warnBeforeLeaving(e: BeforeUnloadEvent): void {
  e.preventDefault();
}

/** Runs (or resumes) a campaign in this tab until it finishes, pauses, stops or reaches the daily cap. */
export async function runCampaign(ctx: Ctx, campaign: Campaign, opts: RunOptions): Promise<void> {
  if (starting || active) throw new Error('A mail merge is already running in this tab.');
  starting = true;
  notify();
  try {
    await runCampaignInner(ctx, campaign, opts);
  } finally {
    starting = false;
    notify();
  }
}

/** If the page closed while a row was sending, mark that row as unknown instead of sending it twice. */
export function recoverInFlight(campaign: Campaign, now = Date.now()): Campaign {
  if (campaign.inFlight == null || campaign.inFlight !== campaign.cursor || campaign.cursor >= campaign.rows.length) {
    return { ...campaign, inFlight: null };
  }
  const index = campaign.cursor;
  return {
    ...campaign,
    cursor: index + 1,
    inFlight: null,
    log: [
      ...campaign.log,
      {
        index,
        email: campaign.rows[index]?.email ?? '',
        status: 'failed',
        error: 'The page closed while this email was sending. Check your Sent folder before sending to this person again.',
        at: now,
      },
    ],
  };
}

async function runCampaignInner(ctx: Ctx, original: Campaign, opts: RunOptions): Promise<void> {
  const campaign = recoverInFlight(original);
  const settings = getData().settings;
  const me = myName(ctx);
  let latest: Campaign = { ...campaign, status: 'running', heartbeatAt: Date.now() };
  await store.saveCampaign(latest);

  const save = () => void store.saveCampaign(latest);

  const queue = new SendQueue(
    campaign.rows,
    { intervalMs: settings.sendIntervalSec * 1000, dailyCap: settings.dailySendCap },
    {
      now: () => Date.now(),
      sleep: abortableSleep,
      sentToday: (now) => store.getSentToday(now),
      recordSent: (now) => store.incrementSent(now),
      skipReason: (row) => {
        if (opts.sendAnyway) return null;
        const missing = missingFor(campaign, row, me);
        return missing.length ? `Missing ${missing.join(', ')}` : null;
      },
      send: async (row, index) => {
        latest = { ...latest, inFlight: index, heartbeatAt: Date.now() };
        await store.saveCampaign(latest);
        const vars = buildContext(row, { myName: me });
        const email = row.email ?? '';
        const { threadId } = await sendViaCompose(ctx.sdk, email, render(campaign.subject, vars).text, renderHtml(campaign.body, vars).html);
        rememberAddresses(ctx.account, row);
        if (opts.addToStageId && threadId) {
          const tracked: TrackedThread = {
            account: ctx.account,
            threadId,
            stageId: opts.addToStageId,
            subject: render(campaign.subject, vars).text,
            contact: { name: vars.name ?? '', email },
            notes: '',
            followUpAt: null,
            followUpMessageCount: null,
            followUpDone: false,
            notifiedAt: null,
            updatedAt: Date.now(),
          };
          await store.saveThread(tracked);
        }
      },
      onProgress: (state) => {
        latest = { ...latest, status: toCampaignStatus(state.status), cursor: state.cursor, log: state.results, inFlight: null, heartbeatAt: Date.now() };
        if (active) active.state = state;
        save();
        notify();
      },
    },
    { cursor: campaign.cursor, results: campaign.log, lastSentAt: lastAttemptAt(campaign.log) },
  );

  active = { campaignId: campaign.id, queue, state: queue.getState() };
  window.addEventListener('beforeunload', warnBeforeLeaving);
  const heartbeat = setInterval(() => {
    latest = { ...latest, heartbeatAt: Date.now() };
    save();
  }, HEARTBEAT_EVERY_MS);
  notify();

  try {
    await queue.start();
  } finally {
    clearInterval(heartbeat);
    window.removeEventListener('beforeunload', warnBeforeLeaving);
    const final = queue.getState();
    latest = { ...latest, status: toCampaignStatus(final.status), cursor: final.cursor, log: final.results, inFlight: null, heartbeatAt: null };
    active = null;
    await store.saveCampaign(latest);
    notify();
  }
}

/** Is another tab currently running this campaign? */
export function runningElsewhere(c: Campaign, now = Date.now()): boolean {
  return c.status === 'running' && active?.campaignId !== c.id && c.heartbeatAt !== null && now - c.heartbeatAt < HEARTBEAT_STALE_MS;
}
