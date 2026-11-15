import { CONFIG } from '../../config';
import type { ConnectorSettings } from '../types';
import { ADDRESS_KINDS } from './addresses';
import { whatsapp } from './catalog/whatsapp';
import type { AddressKind, Connector, LinkConnector, LinkTarget } from './types';

/**
 * Every connector in the code. Adding one is a file in catalog/ plus a line here; the build's
 * `connectors.available` setting then decides whether a given build ships it.
 */
export const ALL_CONNECTORS: readonly Connector[] = [whatsapp];

export function connectorsFor(ids: readonly string[]): Connector[] {
  return ids.map((id) => ALL_CONNECTORS.find((c) => c.id === id)).filter((c): c is Connector => c !== undefined);
}

/** The connectors this build ships, in the configured order. */
export const CONNECTORS: readonly Connector[] = connectorsFor(CONFIG.connectors.available);

export function getConnector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

/** Shipped connectors the user hasn't switched off. */
export function enabledConnectors(settings: Pick<ConnectorSettings, 'disabled'>): Connector[] {
  return CONNECTORS.filter((c) => !settings.disabled.includes(c.id));
}

export function addressKindOf(connector: Connector): AddressKind {
  const kind = ADDRESS_KINDS[connector.address];
  if (!kind) throw new Error(`Connector "${connector.id}" needs address kind "${connector.address}", which does not exist.`);
  return kind;
}

/** The address kinds a set of connectors needs, each once, in connector order. */
export function addressKindsFor(connectors: readonly Connector[]): AddressKind[] {
  const out: AddressKind[] = [];
  for (const c of connectors) {
    const kind = addressKindOf(c);
    if (!out.includes(kind)) out.push(kind);
  }
  return out;
}

export function targetFor(connector: LinkConnector, settings: Pick<ConnectorSettings, 'targets'>): LinkTarget {
  return connector.targets.find((t) => t.id === settings.targets[connector.id]) ?? connector.targets[0]!;
}

/** Cuts the text to the connector's limit without splitting an emoji. */
export function clampText(connector: Connector, text: string): string {
  const chars = Array.from(text);
  return chars.length > connector.maxTextLength ? chars.slice(0, connector.maxTextLength).join('') : text;
}

/** Builds the link to open, and refuses one that leaves the connector's own HTTPS hosts. */
export function buildLink(connector: LinkConnector, target: LinkTarget, address: string, text: string): string {
  const url = new URL(target.build(address, clampText(connector, text.trim())));
  if (url.protocol !== 'https:' || !connector.hosts.includes(url.hostname)) {
    throw new Error(`${connector.name} tried to open ${url.host}, which is not one of its own addresses.`);
  }
  return url.href;
}
