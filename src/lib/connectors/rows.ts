import { buildContext, normalizeKey } from '../template';
import { addressKindOf } from './registry';
import type { Connector } from './types';

/** The mail merge column holding this connector's address, if any. App-specific names win over generic ones. */
export function addressColumn(connector: Connector, headers: readonly string[]): string | null {
  const names = [...(connector.columns ?? []), ...addressKindOf(connector).columns];
  for (const name of names) {
    const header = headers.find((h) => normalizeKey(h) === name);
    if (header) return header;
  }
  return null;
}

export interface HandleEntry {
  email: string;
  name: string;
  kind: string;
  value: string;
}

/** Valid addresses found in one mail merge row, one per address kind, ready to save on the contact. */
export function handlesFromRow(row: Record<string, string>, connectors: readonly Connector[], defaultCountry: string): HandleEntry[] {
  const email = (row.email ?? '').trim();
  if (!email) return [];
  const headers = Object.keys(row);
  const name = buildContext(row).name ?? '';
  const out: HandleEntry[] = [];
  for (const connector of connectors) {
    const kind = addressKindOf(connector);
    if (out.some((e) => e.kind === kind.id)) continue;
    const column = addressColumn(connector, headers);
    const raw = column ? (row[column] ?? '') : '';
    if (!raw.trim()) continue;
    const result = kind.normalize(raw, { defaultCountry });
    if (result.ok) out.push({ email, name, kind: kind.id, value: result.value });
  }
  return out;
}
