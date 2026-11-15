import { CONFIG } from '../config';
import { defaultActivePlaybooks, isPlaybookIdShape, SEED_PLAYBOOKS, SEED_STAGES, SEED_TEMPLATES, SEEDS, seedStages, seedTemplates } from './playbooks';
import { CUSTOM_OWNER, type Campaign, type Playbook, type SendCounter, type Settings, type Stage, type StoreData, type Template, type TrackedThread } from './types';

/**
 * 1: first release (fixed playbooks).
 * 2: playbooks stored as data (`playbooks`, `seededPlaybooks`), so users can add their own and edit stages.
 */
export const SCHEMA_VERSION = 2;
export const SEND_CAP_CEILING = CONFIG.mailMerge.maxDailyCap;
export const SEND_INTERVAL_MIN_SEC = CONFIG.mailMerge.minIntervalSec;
export const SEND_INTERVAL_MAX_SEC = CONFIG.mailMerge.maxIntervalSec;
/** Tag written into backup files and checked on restore. */
export const BACKUP_APP_TAG = CONFIG.appSlug;

/** The subset of chrome.storage.local this module needs, so tests can pass an in-memory version. */
export interface StorageArea {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

const THREAD_PREFIX = 'thread:';
const CAMPAIGN_PREFIX = 'campaign:';
const CORE_KEYS = ['schemaVersion', 'settings', 'templates', 'stages', 'playbooks', 'seededPlaybooks'];

export function threadKey(account: string, threadId: string): string {
  return `${THREAD_PREFIX}${account.toLowerCase()}:${threadId}`;
}

export function campaignKey(id: string): string {
  return `${CAMPAIGN_PREFIX}${id}`;
}

export function defaultSettings(): Settings {
  return {
    playbooks: defaultActivePlaybooks(),
    onboarded: false,
    dailySendCap: CONFIG.mailMerge.defaultDailyCap,
    sendIntervalSec: CONFIG.mailMerge.defaultIntervalSec,
    myName: '',
  };
}

export function defaultData(): StoreData {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: defaultSettings(),
    playbooks: SEED_PLAYBOOKS.map((p) => ({ ...p })),
    seededPlaybooks: SEEDS.map((s) => s.id),
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

/** @param knownPlaybooks ids that exist; active playbooks not in this list are dropped. */
export function sanitizeSettings(raw: unknown, knownPlaybooks: readonly string[] = SEEDS.map((s) => s.id)): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return { ...d, playbooks: d.playbooks.filter((p) => knownPlaybooks.includes(p)) };
  const r = raw as Partial<Record<keyof Settings, unknown>>;
  const playbooks = Array.isArray(r.playbooks)
    ? [...new Set(r.playbooks.filter((p): p is string => typeof p === 'string' && knownPlaybooks.includes(p)))]
    : d.playbooks.filter((p) => knownPlaybooks.includes(p));
  return {
    playbooks,
    onboarded: r.onboarded === true,
    dailySendCap: clampInt(r.dailySendCap, 1, SEND_CAP_CEILING, d.dailySendCap),
    sendIntervalSec: clampInt(r.sendIntervalSec, SEND_INTERVAL_MIN_SEC, SEND_INTERVAL_MAX_SEC, d.sendIntervalSec),
    myName: typeof r.myName === 'string' ? r.myName.slice(0, 120) : '',
  };
}

function isPlaybook(p: unknown): p is Playbook {
  if (!p || typeof p !== 'object') return false;
  const x = p as Record<string, unknown>;
  return isPlaybookIdShape(x.id) && x.id !== CUSTOM_OWNER && typeof x.name === 'string';
}

function isTemplate(t: unknown): t is Template {
  if (!t || typeof t !== 'object') return false;
  const x = t as Record<string, unknown>;
  return typeof x.id === 'string' && typeof x.name === 'string' && typeof x.body === 'string' &&
    typeof x.emoji === 'string' && typeof x.playbookId === 'string' &&
    (x.subject === undefined || typeof x.subject === 'string');
}

function isStage(s: unknown): s is Stage {
  if (!s || typeof s !== 'object') return false;
  const x = s as Record<string, unknown>;
  return typeof x.id === 'string' && typeof x.name === 'string' && typeof x.color === 'string' &&
    typeof x.order === 'number' && typeof x.playbookId === 'string';
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
 * Turns whatever is in storage (empty, older, or hand-edited) into valid StoreData.
 * Add a step here whenever SCHEMA_VERSION goes up.
 */
export function migrate(raw: Record<string, unknown>): StoreData {
  const d = defaultData();
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(`Stored data is from a newer version (schema ${version}). Update the extension.`);
  }

  let playbooks: Playbook[];
  let seededPlaybooks: string[];
  if (Array.isArray(raw.playbooks) && raw.playbooks.some(isPlaybook)) {
    playbooks = raw.playbooks
      .filter(isPlaybook)
      .map((p) => ({ id: p.id, name: p.name, blurb: typeof p.blurb === 'string' ? p.blurb : '', builtIn: p.builtIn === true }));
    seededPlaybooks = Array.isArray(raw.seededPlaybooks) ? raw.seededPlaybooks.filter((x): x is string => typeof x === 'string') : playbooks.map((p) => p.id);
  } else {
    // Fresh install, or v1 → v2: v1 shipped exactly the bundled playbooks with the same ids.
    playbooks = d.playbooks;
    seededPlaybooks = d.seededPlaybooks;
  }
  const known = playbooks.map((p) => p.id);

  const templates = Array.isArray(raw.templates)
    ? raw.templates.filter(isTemplate).map((t) => (t.playbookId === CUSTOM_OWNER || known.includes(t.playbookId) ? t : { ...t, playbookId: CUSTOM_OWNER }))
    : d.templates;
  const stages = Array.isArray(raw.stages) && raw.stages.some(isStage)
    ? raw.stages.filter(isStage).filter((s) => known.includes(s.playbookId))
    : d.stages.filter((s) => known.includes(s.playbookId));

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
    settings: sanitizeSettings(raw.settings, known),
    playbooks,
    seededPlaybooks,
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

  /**
   * Writes defaults or the migrated shape, and adds bundled playbooks that this browser has never
   * seen (for example after an update ships a new playbooks/*.json file).
   */
  async ensureInitialized(): Promise<StoreData> {
    const raw = await this.area.get(CORE_KEYS);
    const data = await this.load();
    let changed = raw.schemaVersion !== SCHEMA_VERSION || CORE_KEYS.some((k) => raw[k] === undefined);

    for (const seed of SEEDS) {
      if (data.seededPlaybooks.includes(seed.id)) continue;
      changed = true;
      data.seededPlaybooks.push(seed.id);
      if (data.playbooks.some((p) => p.id === seed.id)) continue;
      data.playbooks.push({ id: seed.id, name: seed.name, blurb: seed.blurb, builtIn: true });
      data.stages.push(...seedStages(seed));
      data.templates.push(...seedTemplates(seed).filter((t) => !data.templates.some((x) => x.id === t.id)));
    }

    if (changed) {
      await this.area.set({
        schemaVersion: SCHEMA_VERSION,
        settings: data.settings,
        templates: data.templates,
        stages: data.stages,
        playbooks: data.playbooks,
        seededPlaybooks: data.seededPlaybooks,
      });
    }
    return data;
  }

  private async knownPlaybookIds(): Promise<string[]> {
    const raw = (await this.area.get(['playbooks'])).playbooks;
    return Array.isArray(raw) && raw.some(isPlaybook) ? raw.filter(isPlaybook).map((p) => p.id) : SEEDS.map((s) => s.id);
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const known = await this.knownPlaybookIds();
    const current = sanitizeSettings((await this.area.get(['settings'])).settings, known);
    const next = sanitizeSettings({ ...current, ...patch }, known);
    await this.area.set({ settings: next });
    return next;
  }

  async saveTemplates(templates: Template[]): Promise<void> {
    await this.area.set({ templates: templates.filter(isTemplate) });
  }

  async savePlaybooks(playbooks: Playbook[]): Promise<void> {
    await this.area.set({ playbooks: playbooks.filter(isPlaybook) });
  }

  async saveStages(stages: Stage[]): Promise<void> {
    await this.area.set({ stages: stages.filter(isStage) });
  }

  /** Adds a user playbook with the given stages and switches it on. */
  async createPlaybook(playbook: Omit<Playbook, 'builtIn'>, stages: Array<{ name: string; color: string; closed?: boolean }>): Promise<void> {
    const data = await this.load();
    if (!isPlaybookIdShape(playbook.id) || playbook.id === CUSTOM_OWNER || data.playbooks.some((p) => p.id === playbook.id)) {
      throw new Error('That playbook id is not available.');
    }
    const newStages: Stage[] = stages.map((s, order) => ({
      id: `${playbook.id}:${crypto.randomUUID().slice(0, 8)}`,
      name: s.name,
      color: s.color,
      order,
      playbookId: playbook.id,
      ...(s.closed ? { closed: true } : {}),
    }));
    await this.area.set({
      playbooks: [...data.playbooks, { ...playbook, builtIn: false }],
      stages: [...data.stages, ...newStages],
      settings: { ...data.settings, playbooks: [...data.settings.playbooks, playbook.id] },
    });
  }

  /** Moves every tracked conversation from one stage to another. Returns how many moved. */
  async moveThreads(fromStageId: string, toStageId: string): Promise<number> {
    const data = await this.load();
    const items: Record<string, unknown> = {};
    for (const [key, t] of Object.entries(data.threads)) {
      if (t.stageId === fromStageId) items[key] = { ...t, stageId: toStageId, updatedAt: Date.now() };
    }
    if (Object.keys(items).length) await this.area.set(items);
    return Object.keys(items).length;
  }

  /** Deletes a stage. Conversations on it move to `moveTo`, which is required when there are any. */
  async deleteStage(stageId: string, moveTo?: string): Promise<void> {
    const data = await this.load();
    const stage = data.stages.find((s) => s.id === stageId);
    if (!stage) return;
    const siblings = data.stages.filter((s) => s.playbookId === stage.playbookId && s.id !== stageId);
    if (!siblings.length) throw new Error('A playbook needs at least one stage.');
    const inUse = Object.values(data.threads).some((t) => t.stageId === stageId);
    if (inUse) {
      if (!moveTo || !siblings.some((s) => s.id === moveTo)) throw new Error('Choose a stage in the same playbook to move its conversations to.');
      await this.moveThreads(stageId, moveTo);
    }
    const remaining = data.stages.filter((s) => s.id !== stageId);
    let order = 0;
    await this.saveStages(remaining.map((s) => (s.playbookId === stage.playbookId ? { ...s, order: order++ } : s)));
  }

  /**
   * Deletes a playbook and its stages. Its templates move to "My templates" so nothing written is lost.
   * Refuses while conversations are still on its stages.
   */
  async deletePlaybook(id: string): Promise<void> {
    const data = await this.load();
    const stageIds = new Set(data.stages.filter((s) => s.playbookId === id).map((s) => s.id));
    const inUse = Object.values(data.threads).filter((t) => stageIds.has(t.stageId)).length;
    if (inUse) throw new Error(`Move or remove its ${inUse} tracked conversation${inUse === 1 ? '' : 's'} first.`);
    await this.area.set({
      playbooks: data.playbooks.filter((p) => p.id !== id),
      stages: data.stages.filter((s) => s.playbookId !== id),
      templates: data.templates.map((t) => (t.playbookId === id ? { ...t, playbookId: CUSTOM_OWNER } : t)),
      settings: { ...data.settings, playbooks: data.settings.playbooks.filter((p) => p !== id) },
    });
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
    return JSON.stringify({ app: BACKUP_APP_TAG, exportedAt: new Date().toISOString(), data: raw }, null, 2);
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
    if (payload?.app !== BACKUP_APP_TAG || !payload.data || typeof payload.data !== 'object') {
      throw new Error(`That file is not a ${CONFIG.appName} backup.`);
    }
    const data = migrate(payload.data as Record<string, unknown>);
    const existing = Object.keys(await this.area.get(null));
    if (existing.length) await this.area.remove(existing);
    const items: Record<string, unknown> = {
      schemaVersion: data.schemaVersion,
      settings: data.settings,
      playbooks: data.playbooks,
      seededPlaybooks: data.seededPlaybooks,
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
