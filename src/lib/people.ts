import { isValidEmail } from './csv';

/**
 * A local address book for recipient search. InboxSDK can't read Google Contacts and the People API would need
 * OAuth, so the extension remembers people it sees: in lists and conversations, and in emails the user sends.
 */
export interface Person {
  /** Lower-cased. */
  email: string;
  name: string;
  /** When last seen. */
  seen: number;
  /** On how many separate days (roughly) they were seen. Used to rank suggestions. */
  count: number;
}

export interface Observed {
  email: string;
  name?: string | null;
}

/** A sighting less than this long after the previous one doesn't bump the count. */
export const SEEN_GAP_MS = 12 * 60 * 60 * 1000;

const AUTOMATED_LOCAL = /^(?:no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?|notify|alerts?)(?:[+._-].*)?$/i;

/** Senders nobody writes back to, such as noreply@ and mailer-daemon@. */
export function isAutomatedAddress(email: string): boolean {
  const local = email.split('@')[0] ?? '';
  return AUTOMATED_LOCAL.test(local) || /(?:^|[._-])(?:no-?reply|bounces?)(?:[._-]|$)/i.test(local);
}

function cleanName(name: string | null | undefined, email: string): string {
  const n = (name ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
  return !n || n.includes('@') || n.toLowerCase() === email ? '' : n.slice(0, 120);
}

/**
 * Adds sightings to the list. Returns the same array and `changed: false` when nothing worth saving happened,
 * so callers can skip the write. Keeps at most `cap` people, dropping the least recently seen.
 */
export function rememberPeople(
  list: readonly Person[],
  observed: readonly Observed[],
  now: number,
  options: { cap: number; me: string },
): { list: Person[]; changed: boolean } {
  const byEmail = new Map(list.map((p) => [p.email, p]));
  let changed = false;
  for (const o of observed) {
    const email = (o.email ?? '').trim().toLowerCase();
    if (!email || email === options.me || !isValidEmail(email) || isAutomatedAddress(email)) continue;
    const name = cleanName(o.name, email);
    const current = byEmail.get(email);
    if (!current) {
      byEmail.set(email, { email, name, seen: now, count: 1 });
      changed = true;
      continue;
    }
    const next = { ...current };
    if (name && !current.name) next.name = name;
    if (now - current.seen >= SEEN_GAP_MS) {
      next.seen = now;
      next.count = current.count + 1;
    }
    if (next.name !== current.name || next.seen !== current.seen) {
      byEmail.set(email, next);
      changed = true;
    }
  }
  if (!changed) return { list: [...list], changed: false };
  let out = [...byEmail.values()];
  if (out.length > options.cap) out = out.sort((a, b) => b.seen - a.seen).slice(0, options.cap);
  return { list: out, changed: true };
}

/** Clean Person[] from whatever is stored. */
export function toPeopleList(raw: unknown): Person[] {
  if (!Array.isArray(raw)) return [];
  const out: Person[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const p = x as Record<string, unknown>;
    if (typeof p.email !== 'string' || !isValidEmail(p.email)) continue;
    out.push({
      email: p.email.toLowerCase(),
      name: typeof p.name === 'string' ? p.name : '',
      seen: typeof p.seen === 'number' && Number.isFinite(p.seen) ? p.seen : 0,
      count: typeof p.count === 'number' && p.count > 0 ? Math.floor(p.count) : 1,
    });
  }
  return out;
}

/** Merges people from several sources by email: names fill in, counts add up, the latest sighting wins. */
export function mergePeople(...sources: ReadonlyArray<readonly Person[]>): Person[] {
  const byEmail = new Map<string, Person>();
  for (const source of sources) {
    for (const p of source) {
      const email = p.email.toLowerCase();
      const cur = byEmail.get(email);
      byEmail.set(email, cur
        ? { email, name: cur.name || p.name, seen: Math.max(cur.seen, p.seen), count: cur.count + p.count }
        : { ...p, email });
    }
  }
  return [...byEmail.values()];
}

const DAY = 24 * 60 * 60 * 1000;

function matchScore(p: Person, token: string): number {
  const name = p.name.toLowerCase();
  const [local = '', domain = ''] = p.email.split('@');
  const words = name.split(/[\s.'-]+/);
  const localParts = local.split(/[._+-]+/);
  // A whole word ("ada" for Ada Okafor) beats the start of a longer one ("ada" in Adam).
  if (p.email === token || words.includes(token) || localParts.includes(token)) return 6;
  if (name.startsWith(token) || p.email.startsWith(token)) return 4;
  if (words.some((w) => w.startsWith(token)) || localParts.some((w) => w.startsWith(token))) return 3;
  if (domain.startsWith(token)) return 2;
  if (name.includes(token) || p.email.includes(token)) return 1;
  return 0;
}

/**
 * Suggestions for what the user typed. Every word must match the name or the address; matches at the start
 * of a name, word or address rank first, then people seen more often and more recently. An empty query lists
 * the most relevant people.
 */
export function searchPeople(candidates: readonly Person[], query: string, options: { limit?: number; exclude?: ReadonlySet<string>; now?: number } = {}): Person[] {
  const { limit = 8, exclude = new Set<string>(), now = Date.now() } = options;
  const tokens = query.trim().toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const scored: Array<{ p: Person; score: number }> = [];
  for (const p of candidates) {
    if (exclude.has(p.email)) continue;
    let score = 0;
    let matched = true;
    for (const t of tokens) {
      const s = matchScore(p, t);
      if (!s) {
        matched = false;
        break;
      }
      score += s;
    }
    if (!matched) continue;
    score += Math.log2(p.count + 1) * 0.5 + (now - p.seen < 30 * DAY ? 0.5 : 0);
    scored.push({ p, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || b.p.seen - a.p.seen || (a.p.name || a.p.email).localeCompare(b.p.name || b.p.email))
    .slice(0, limit)
    .map((x) => x.p);
}

/**
 * Reads addresses from pasted or typed text: "Ada Okafor <ada@x.com>", "Okafor, Ada <ada@x.com>", bare
 * addresses, separated by commas, semicolons, spaces or new lines. Returns each valid address once, plus how
 * many address-like pieces were not valid.
 */
export function parseAddressList(text: string): { people: Observed[]; invalid: number } {
  const people: Observed[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  const re = /(?:"?([^"<>;\n]*?)"?\s*<([^<>\s]+)>)|([^\s<>,;"']+@[^\s<>,;"']*)/g;
  for (const m of text.matchAll(re)) {
    const email = (m[2] ?? m[3] ?? '').trim().replace(/[.)]+$/, '');
    if (!isValidEmail(email)) {
      invalid++;
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const name = (m[1] ?? '').replace(/^[\s,;]+/, '').trim();
    people.push({ email, name: name || undefined });
  }
  return { people, invalid };
}
