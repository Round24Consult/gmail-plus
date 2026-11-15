import type { ThreadRowView } from '@inboxsdk/core';
import { toCsv } from '../../lib/csv';
import { firstNameFrom } from '../../lib/names';
import { downloadText, todayStamp } from '../../shared/download';
import { iconUrl, type Ctx } from '../context';

interface ContactRow {
  name: string;
  first_name: string;
  email: string;
  conversations: number;
  last_subject: string;
}

/** Everyone in the given rows except me, merged by email address. */
export function collectContacts(rows: ThreadRowView[], me: string): ContactRow[] {
  const byEmail = new Map<string, ContactRow>();
  for (const row of rows) {
    let contacts: Array<{ name?: string; emailAddress: string }> = [];
    let subject = '';
    try {
      contacts = row.getContacts();
      subject = row.getSubject();
    } catch {
      continue;
    }
    const seenInRow = new Set<string>();
    for (const c of contacts) {
      const email = (c.emailAddress ?? '').trim();
      const key = email.toLowerCase();
      if (!email || key === me || seenInRow.has(key)) continue;
      seenInRow.add(key);
      const existing = byEmail.get(key);
      if (existing) {
        existing.conversations++;
        if (!existing.name && c.name) {
          existing.name = c.name;
          existing.first_name = firstNameFrom({ name: c.name, email });
        }
      } else {
        const name = c.name && c.name !== email ? c.name : '';
        byEmail.set(key, { name, first_name: firstNameFrom({ name, email }), email, conversations: 1, last_subject: subject });
      }
    }
  }
  return [...byEmail.values()];
}

export function registerExport(ctx: Ctx): void {
  ctx.sdk.Toolbars.registerThreadButton({
    title: 'Export contacts to CSV',
    iconUrl: iconUrl('export'),
    positions: ['LIST'],
    onClick(event) {
      const rows = event.selectedThreadRowViews;
      const contacts = collectContacts(rows, ctx.account);
      if (!contacts.length) {
        ctx.sdk.ButterBar.showMessage({ text: 'No contacts found in the selected conversations.', time: 4000 });
        return;
      }
      const headers: Array<keyof ContactRow> = ['name', 'first_name', 'email', 'conversations', 'last_subject'];
      downloadText(`gmail-contacts-${todayStamp()}.csv`, toCsv(headers, contacts as unknown as Record<string, string | number>[]));
      ctx.sdk.ButterBar.showMessage({
        text: `Exported ${contacts.length} contact${contacts.length === 1 ? '' : 's'} from ${rows.length} conversation${rows.length === 1 ? '' : 's'}.`,
        time: 4000,
      });
    },
  });
}
