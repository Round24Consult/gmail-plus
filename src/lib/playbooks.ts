import { CONFIG } from '../config';
import type { PlaybookSeed } from '../configTypes';
import { CUSTOM_OWNER, type Playbook, type PlaybookId, type Stage, type Template } from './types';

/** Stage ids are "<playbook>:<stage key>"; template ids are "<playbook>:<template key>". */
export function seedStages(seed: PlaybookSeed): Stage[] {
  return seed.stages.map((s, order) => ({
    id: `${seed.id}:${s.key}`,
    name: s.name,
    color: s.color,
    order,
    playbookId: seed.id,
    ...(s.closed ? { closed: true } : {}),
  }));
}

export function seedTemplates(seed: PlaybookSeed): Template[] {
  return seed.templates.map((t) => ({
    id: `${seed.id}:${t.key}`,
    name: t.name,
    emoji: t.emoji ?? '✉️',
    ...(t.subject ? { subject: t.subject } : {}),
    body: t.body,
    playbookId: seed.id,
  }));
}

export function seedPlaybook(seed: PlaybookSeed): Playbook {
  return { id: seed.id, name: seed.name, blurb: seed.blurb, builtIn: true };
}

/** Everything bundled from playbooks/*.json. */
export const SEEDS: readonly PlaybookSeed[] = CONFIG.playbooks;
export const SEED_PLAYBOOKS: readonly Playbook[] = SEEDS.map(seedPlaybook);
export const SEED_STAGES: readonly Stage[] = SEEDS.flatMap(seedStages);
export const SEED_TEMPLATES: readonly Template[] = SEEDS.flatMap(seedTemplates);

/** Playbooks switched on at first run. */
export function defaultActivePlaybooks(): PlaybookId[] {
  const ids = SEEDS.map((s) => s.id);
  const wanted = CONFIG.defaultPlaybooks.filter((id) => ids.includes(id));
  return wanted.length ? wanted : ids;
}

export function isPlaybookIdShape(value: unknown): value is PlaybookId {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,40}$/.test(value);
}

/** Stages of the given playbooks, in playbook order and then stage order. */
export function stagesFor(all: readonly Stage[], playbooks: readonly PlaybookId[]): Stage[] {
  return all
    .filter((s) => playbooks.includes(s.playbookId))
    .sort((a, b) => playbooks.indexOf(a.playbookId) - playbooks.indexOf(b.playbookId) || a.order - b.order);
}

export function templatesFor(all: readonly Template[], playbooks: readonly PlaybookId[]): Template[] {
  return all.filter((t) => t.playbookId === CUSTOM_OWNER || playbooks.includes(t.playbookId));
}

/** Active playbooks in the order they are listed in `playbooks`. */
export function orderedActive(playbooks: readonly Playbook[], active: readonly PlaybookId[]): Playbook[] {
  return playbooks.filter((p) => active.includes(p.id));
}

export function playbookName(playbooks: readonly Playbook[], id: string): string {
  if (id === CUSTOM_OWNER) return 'My templates';
  return playbooks.find((p) => p.id === id)?.name ?? id;
}

/** Turns a name into a playbook id that is not taken yet. */
export function makePlaybookId(name: string, taken: readonly string[]): PlaybookId {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'playbook';
  let id = base.length >= 2 ? base : `${base}-pb`;
  for (let n = 2; taken.includes(id) || id === CUSTOM_OWNER; n++) id = `${base}-${n}`;
  return id;
}

/** Black or white text, whichever reads better on the given hex background. */
export function textColorFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return '#ffffff';
  const n = parseInt(m[1], 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  const contrastWhite = 1.05 / (lum + 0.05);
  const contrastBlack = (lum + 0.05) / 0.05;
  // White wherever it meets WCAG AA (4.5:1), which keeps Gmail-style blue and green badges white.
  return contrastWhite >= 4.5 || contrastWhite >= contrastBlack ? '#ffffff' : '#202124';
}
