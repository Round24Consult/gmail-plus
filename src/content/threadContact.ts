import type { MessageView, ThreadView } from '@inboxsdk/core';
import type { Contact } from '../lib/types';

export function safeSender(m: MessageView): { name: string; emailAddress: string } | null {
  try {
    const s = m.getSender();
    return s?.emailAddress ? s : null;
  } catch {
    return null;
  }
}

/** The other person in the thread: the latest sender who isn't me, else someone I wrote to. */
export function detectContact(threadView: ThreadView, me: string): Contact | null {
  const messages = threadView.getMessageViewsAll();
  for (let i = messages.length - 1; i >= 0; i--) {
    const s = safeSender(messages[i]!);
    if (s && s.emailAddress.toLowerCase() !== me) return { name: s.name ?? '', email: s.emailAddress };
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    try {
      if (!m.isLoaded()) continue;
      const r = m.getRecipients().find((x) => x.emailAddress.toLowerCase() !== me);
      if (r) return { name: r.name ?? '', email: r.emailAddress };
    } catch {
      // collapsed or unloaded message
    }
  }
  return null;
}
