import Papa from 'papaparse';
import { normalizeKey } from './template';

// local@label.label.tld: no empty labels, a TLD of two or more characters.
const EMAIL_RE = /^[^\s@<>()[\],;:"]+@(?:[^\s@<>()[\],;:".]+\.)+[^\s@<>()[\],;:".]{2,}$/;
const EMAIL_HEADERS = new Set(['email', 'emailaddress', 'mail', 'emails', 'workemail']);

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export interface InvalidRow {
  /** 1-based line number in the file, counting the header as line 1. */
  line: number;
  value: string;
  reason: 'missing email' | 'invalid email';
}

export interface ParsedRecipients {
  headers: string[];
  emailColumn: string | null;
  /** Valid, de-duplicated rows. Each has an `email` field with the trimmed address. */
  rows: Record<string, string>[];
  invalid: InvalidRow[];
  duplicates: number;
}

function pickEmailColumn(headers: string[], data: Record<string, unknown>[]): string | null {
  const byName = headers.find((h) => EMAIL_HEADERS.has(normalizeKey(h)));
  if (byName) return byName;
  // Otherwise the first column where most filled values look like emails.
  for (const h of headers) {
    const values = data.map((r) => String(r[h] ?? '').trim()).filter(Boolean);
    if (values.length && values.filter(isValidEmail).length / values.length >= 0.8) return h;
  }
  return null;
}

export function parseRecipientCsv(text: string): ParsedRecipients {
  const result = Papa.parse<Record<string, unknown>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  const headers = (result.meta.fields ?? []).filter((h) => h !== '');
  const data = result.data;
  const emailColumn = pickEmailColumn(headers, data);

  const rows: Record<string, string>[] = [];
  const invalid: InvalidRow[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  data.forEach((raw, i) => {
    const line = i + 2;
    const row: Record<string, string> = {};
    for (const h of headers) row[h] = String(raw[h] ?? '').trim();
    const email = emailColumn ? (row[emailColumn] ?? '') : '';
    if (!email) {
      invalid.push({ line, value: '', reason: 'missing email' });
      return;
    }
    if (!isValidEmail(email)) {
      invalid.push({ line, value: email, reason: 'invalid email' });
      return;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      return;
    }
    seen.add(key);
    row.email = email;
    rows.push(row);
  });

  return { headers, emailColumn, rows, invalid, duplicates };
}

/** Neutralise values that spreadsheet apps would run as formulas (OWASP CSV injection). */
export function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function toCsv(headers: string[], rows: Array<Record<string, string | number | null | undefined>>): string {
  return Papa.unparse(
    {
      fields: headers,
      data: rows.map((r) => headers.map((h) => safeCell(String(r[h] ?? '')))),
    },
    { newline: '\r\n' },
  );
}
