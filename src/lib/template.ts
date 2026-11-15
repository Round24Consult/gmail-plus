import { firstNameFrom } from './names';

/** {{ key }} or {{ key | fallback }}. Keys may contain letters, digits, spaces, _ and -. */
const VAR_RE = /\{\{\s*([\p{L}\p{N}][\p{L}\p{N} _-]*?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/gu;

/** "First Name", "first_name" and "firstName" all become "firstname". */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export type RenderContext = Record<string, string>;

export interface RenderResult {
  text: string;
  /** Normalised keys that had no value and no fallback. */
  missing: string[];
}

export function listVariables(text: string): string[] {
  const keys = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) {
    if (m[1]) keys.add(normalizeKey(m[1]));
  }
  return [...keys];
}

export function render(text: string, ctx: RenderContext): RenderResult {
  const missing = new Set<string>();
  const out = text.replace(VAR_RE, (_whole, rawKey: string, fallback: string | undefined) => {
    const key = normalizeKey(rawKey);
    const value = ctx[key];
    if (value !== undefined && value.trim() !== '') return value;
    if (fallback !== undefined) return fallback;
    missing.add(key);
    return '';
  });
  return { text: out, missing: [...missing] };
}

/**
 * Context for one recipient: every column of the row under its normalised key,
 * plus name, firstname, email and myname derived where missing.
 */
export function buildContext(row: Record<string, string | undefined>, extras: { myName?: string } = {}): RenderContext {
  const ctx: RenderContext = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    const k = normalizeKey(key);
    if (k && ctx[k] === undefined) ctx[k] = value.trim();
  }
  if (!ctx.email && ctx.emailaddress) ctx.email = ctx.emailaddress;
  if (!ctx.name && ctx.fullname) ctx.name = ctx.fullname;
  if (!ctx.firstname) {
    const first = firstNameFrom({ name: ctx.name, email: ctx.email });
    if (first) ctx.firstname = first;
  }
  if (extras.myName && !ctx.myname) ctx.myname = extras.myName.trim();
  return ctx;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Plain text to Gmail-friendly HTML: escaped, with line breaks kept. */
export function textToHtml(text: string): string {
  return escapeHtml(text.replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>');
}

export function renderHtml(text: string, ctx: RenderContext): { html: string; missing: string[] } {
  const { text: rendered, missing } = render(text, ctx);
  return { html: textToHtml(rendered), missing };
}
