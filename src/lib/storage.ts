import { isPlaybookId, PLAYBOOK_IDS, SEED_STAGES, SEED_TEMPLATES } from './playbooks';
import type { Campaign, SendCounter, Settings, Stage, StoreData, Template, TrackedThread } from './types';

export const SCHEMA_VERSION = 1;
export const SEND_CAP_CEILING = 400;
export const SEND_INTERVAL_MIN_SEC = 10;
export const SEND_INTERVAL_MAX_SEC = 600;

/** The subset of chrome.storage.local this module needs, so tests can pass an in-memory version. */
export interface StorageArea {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

const THREAD_PREFIX = 'thread:';
const CAMPAIGN_PREFIX = 'campaign:';

export function threadKey(account: string, threadId: string): string {
  return `${THREAD_PREFIX}${account.toLowerCase()}:${threadId}`;
}

export function campaignKey(id: string): string {
  return `${CAMPAIGN_PREFIX}${id}`;
}

export function defaultSettings(): Settings {
  return {
    playbooks: [...PLAYBOOK_IDS],
    onboarded: false,
    dailySendCap: 100,
    sendIntervalSec: 30,
    myName: '',
  };
}

export function defaultData(): StoreData {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: defaultSettings(),
    templates: SEED_TEMPLATES.map((t) => ({ ...t })),
    stages: SEED_STAGES.map((s) => ({ ...s })),
    threads: {},
    campaigns: [],
    sendCounter: { date: '', count: 0 },
  };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<Record<keyof Settings, unknown>>;
  const playbooks = Array.isArray(r.playbooks) ? [...new Set(r.playbooks.filter(isPlaybookId))] : d.playbooks;
  return {
    playbooks,
    onboarded: r.onboarded === true,
    dailySendCap: clampInt(r.dailySendCap, 1, SEND_CAP_CEILING, d.dailySendCap),
    sendIntervalSec: clampInt(r.sendIntervalSec, SEND_INTERVAL_MIN_SEC, SEND_INTERVAL_MAX_SEC, d.sendIntervalSec),
    myName: typeof r.myName === 'string' ? r.myName.slice(0, 120) : '',
  };
}

function isTemplate(t: unknown): t is Template {
  if (!t || typeof t !== 'object') return false;
  const x = t as Record<string, unknown>;
  return typeof x.id === 'string' && typeof x.name === 'string' && typeof x.body === 'string' &&
    typeof x.emoji === 'string' && (x.playbookId === 'custom' || isPlaybookId(x.playbookId)) &&
    (x.subject === undefined || typeof x.subject === 'string');
}

function isStage(s: unknown): s is Stage {
  if (!s || typeof s !== 'object') return false;
  const x = s as Record<string, unknown>;
  return typeof x.id === 'string' && typeof x.name === 'string' && typeof x.color === 'string' &&
    typeof x.order === 'number' && isPlaybookId(x.playbookId);
}

function isThread(t: unknown): t is TrackedThread {
  if (!t || typeof t !== 'object') return false;
  const x = t as Record<string, unknown>;
  return typeof x.account === 'string' && typeof x.threadId === 'string' && typeof x.stageId === 'string';
}

function isCampaign(c: unknown): c is Campaign {
  if (!c || typeof c !== 'object') return false;
  const x = c as Record<string, unknown>;
  return typeof x.id === 'string' && Array.isArray(x.rows) && Array.isArray(x.log) && typeof x.cursor === 'number';
}

/**
 * Turns whatever is in storage (possibly empty, older or hand-edited) into valid StoreData.
 * Later schema versions add their steps here.
 */
export function migrate(raw: Record<string, unknown>): StoreData {
  const d = defaultData();
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(`Stored data is from a newer version (schema ${version}). Update the extension.`);
  }
  const templates = Array.isArray(raw.templates) ? raw.templates.filter(isTemplate) : d.templates;
  const stages = Array.isArray(raw.stages) && raw.stages.some(isStage) ? raw.stages.filter(isStage) : d.stages;
  const threads: Record<string, TrackedThread> = {};
  const campaigns: Campaign[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith(THREAD_PREFIX) && isThread(value)) threads[key] = value;
    if (key.startsWith(CAMPAIGN_PREFIX) && isCampaign(value)) campaigns.push(value);
  }
  campaigns.sort((a, b) => b.createdAt - a.createdAt);
  const counter = raw.sendCounter as Partial<SendCounter> | undefined;
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: sanitizeSettings(raw.settings),
    templates,
    stages,
    threads,
    campaigns,
    sendCounter: {
      date: typeof counter?.date === 'string' ? counter.date : '',
      count: typeof counter?.count === 'number' ? counter.count : 0,
    },
  };
}

/** Local calendar day, YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export class Store {
  constructor(private readonly area: StorageArea) {}

  async load(): Promise<StoreData> {
    return migrate(await this.area.get(null));
  }

  /** Writes defaults (or the migrated shape) the first time the extension runs. */
  async ensureInitialized(): Promise<StoreData> {
    const raw = await this.area.get(['schemaVersion', 'settings', 'templates', 'stages']);
    const data = await this.load();
    if (raw.schemaVersion !== SCHEMA_VERSION || !raw.settings || !raw.templates || !raw.stages) {
      await this.area.set({
        schemaVersion: SCHEMA_VERSION,
        settings: data.settings,
        templates: data.templates,
        stages: data.stages,
      });
    }
    return data;
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const current = sanitizeSettings((await this.area.get(['settings'])).settings);
    const next = sanitizeSettings({ ...current, ...patch });
    await this.area.set({ settings: next });
    return next;
  }

  async saveTemplates(templates: Template[]): Promise<void> {
    await this.area.set({ templates: templates.filter(isTemplate) });
  }

  async saveThread(thread: TrackedThread): Promise<void> {
    await this.area.set({ [threadKey(thread.account, thread.threadId)]: { ...thread, updatedAt: Date.now() } });
  }

  async getThread(account: string, threadId: string): Promise<TrackedThread | null> {
    const key = threadKey(account, threadId);
    const value = (await this.area.get([key]))[key];
    return isThread(value) ? value : null;
  }

  async deleteThread(account: string, threadId: string): Promise<void> {
    await this.area.remove([threadKey(account, threadId)]);
  }

  async saveCampaign(campaign: Campaign): Promise<void> {
    await this.area.set({ [campaignKey(campaign.id)]: campaign });
  }

  async deleteCampaign(id: string): Promise<void> {
    await this.area.remove([campaignKey(id)]);
  }

  async getSentToday(now: number): Promise<number> {
    const counter = (await this.area.get(['sendCounter'])).sendCounter as SendCounter | undefined;
    return counter && counter.date === dayKey(now) ? counter.count : 0;
  }

  async incrementSent(now: number): Promise<number> {
    const today = dayKey(now);
    const count = (await this.getSentToday(now)) + 1;
    await this.area.set({ sendCounter: { date: today, count } });
    return count;
  }

  async exportBackup(): Promise<string> {
    const raw = await this.area.get(null);
    return JSON.stringify({ app: 'gmail-plus', exportedAt: new Date().toISOString(), data: raw }, null, 2);
  }

  /** Replaces everything with the backup's contents after validating them. */
  async importBackup(json: string): Promise<StoreData> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('That file is not valid JSON.');
    }
    const payload = parsed as { app?: unknown; data?: unknown };
    if (payload?.app !== 'gmail-plus' || !payload.data || typeof payload.data !== 'object') {
      throw new Error('That file is not a Gmail Plus backup.');
    }
    const data = migrate(payload.data as Record<string, unknown>);
    const existing = Object.keys(await this.area.get(null));
    if (existing.length) await this.area.remove(existing);
    const items: Record<string, unknown> = {
      schemaVersion: data.schemaVersion,
      settings: data.settings,
      templates: data.templates,
      stages: data.stages,
      sendCounter: data.sendCounter,
    };
    for (const [key, thread] of Object.entries(data.threads)) items[key] = thread;
    for (const c of data.campaigns) items[campaignKey(c.id)] = c;
    await this.area.set(items);
    return data;
  }
}

export function memoryArea(initial: Record<string, unknown> = {}): StorageArea & { dump(): Record<string, unknown> } {
  let state: Record<string, unknown> = structuredClone(initial);
  return {
    async get(keys) {
      if (keys === null) return structuredClone(state);
      const out: Record<string, unknown> = {};
      for (const k of keys) if (k in state) out[k] = structuredClone(state[k]);
      return out;
    },
    async set(items) {
      state = { ...state, ...structuredClone(items) };
    },
    async remove(keys) {
      for (const k of keys) delete state[k];
    },
    dump: () => structuredClone(state),
  };
}
