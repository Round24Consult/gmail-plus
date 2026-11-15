import type { Observed } from '../../lib/people';
import { getData, store } from '../../shared/live';
import type { Ctx } from '../context';

/** Sightings are batched and written at most this often, so browsing a busy inbox doesn't write constantly. */
const FLUSH_MS = 10_000;

const pending = new Map<string, Observed>();
let timer: ReturnType<typeof setTimeout> | undefined;

function observe(ctx: Ctx, people: Observed[]): void {
  if (!getData().settings.rememberPeople) return;
  for (const p of people) {
    const key = (p.email ?? '').trim().toLowerCase();
    if (!key || key === ctx.account) continue;
    const prev = pending.get(key);
    pending.set(key, { email: key, name: p.name || prev?.name || '' });
  }
  if (pending.size && !timer) timer = setTimeout(() => void flush(ctx), FLUSH_MS);
}

async function flush(ctx: Ctx): Promise<void> {
  timer = undefined;
  const batch = [...pending.values()];
  pending.clear();
  if (batch.length && getData().settings.rememberPeople) await store.rememberPeople(ctx.account, batch).catch(() => false);
}

type Address = { emailAddress: string; name?: string | null };

function safe<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

/**
 * Builds the local address book behind recipient search: people in the lists the user scrolls through, in
 * conversations they open, and in emails they send. Nothing leaves the browser; Settings can switch it off.
 */
export function registerPeople(ctx: Ctx): void {
  const { sdk } = ctx;

  sdk.Lists.registerThreadRowViewHandler((row) => {
    observe(ctx, safe<Address[]>(() => row.getContacts(), []).map((c) => ({ email: c.emailAddress, name: c.name })));
  });

  sdk.Conversations.registerMessageViewHandler((message) => {
    const people: Address[] = [];
    const sender = safe<Address | null>(() => message.getSender(), null);
    if (sender) people.push(sender);
    people.push(...safe<Address[]>(() => (message.isLoaded() ? message.getRecipients() : []), []));
    observe(ctx, people.map((c) => ({ email: c.emailAddress, name: c.name })));
  });

  sdk.Compose.registerComposeViewHandler((cv) => {
    cv.on('presending', () => {
      const all = safe<Address[]>(() => [...cv.getToRecipients(), ...cv.getCcRecipients(), ...cv.getBccRecipients()], []);
      observe(ctx, all.map((c) => ({ email: c.emailAddress, name: c.name })));
    });
  });

  // Don't lose the last batch when the tab closes or Gmail reloads.
  window.addEventListener('pagehide', () => {
    clearTimeout(timer);
    void flush(ctx);
  });
}
