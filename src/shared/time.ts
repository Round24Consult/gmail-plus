import { CONFIG } from '../config';

const DAY = 24 * 60 * 60 * 1000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Overdue 2d", "Due today", "Tomorrow", "In 5d". */
export function relativeDue(when: number, now = Date.now()): { label: string; tone: 'overdue' | 'today' | 'soon' } {
  const days = Math.round((startOfDay(when) - startOfDay(now)) / DAY);
  if (when <= now && days < 0) return { label: `Overdue ${-days}d`, tone: 'overdue' };
  if (days <= 0) return { label: when <= now ? 'Due now' : 'Due today', tone: when <= now ? 'overdue' : 'today' };
  if (days === 1) return { label: 'Tomorrow', tone: 'soon' };
  return { label: `In ${days}d`, tone: 'soon' };
}

/** The configured reminder hour (default 9:00) local time, `days` days from now. */
export function morningIn(days: number, now = Date.now(), hour = CONFIG.followUps.reminderHour): number {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** "just now", "5 min. ago", "2 hr. ago", "3 days ago" in the browser's language. */
export function timeAgo(ts: number, now = Date.now()): string {
  const sec = Math.round((now - ts) / 1000);
  if (sec < 60) return 'just now';
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });
  if (sec < 3600) return rtf.format(-Math.round(sec / 60), 'minute');
  if (sec < 86_400) return rtf.format(-Math.round(sec / 3600), 'hour');
  return rtf.format(-Math.round(sec / 86_400), 'day');
}
