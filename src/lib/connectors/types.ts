/**
 * Connectors let users reach a contact on another app (WhatsApp today) from inside Gmail.
 *
 * The design keeps three things apart so new apps are cheap to add:
 * - An AddressKind is how a person is reached: a phone number, a username… Several connectors can share one,
 *   so a number saved once works for every phone-based app.
 * - A Connector is an app. It names the address kind it needs and how a message gets there.
 * - Delivery is how the message leaves. `link` opens the app with the message typed in and the user presses
 *   Send; no account, server or API key is involved. An `api` delivery (sending through a provider's API from
 *   the background worker) is planned; see docs/CONNECTORS.md for its shape.
 */

/** Longest message a connector may prefill. Matches MAX_CONNECTOR_MESSAGE in scripts/load-config.mjs. */
export const MAX_CONNECTOR_MESSAGE = 4000;

export interface NormalizeOptions {
  /** ISO 3166 code used when the value has no country code, or ''. */
  defaultCountry: string;
}

export type NormalizeResult = { ok: true; value: string } | { ok: false; error: string };

export interface AddressKind {
  /** Stable id, used as the key in saved contacts. Never change it after release. */
  id: string;
  /** Shown as the field label, e.g. "Phone number". */
  label: string;
  placeholder: string;
  inputType: 'tel' | 'text' | 'url';
  /** Mail merge column names, normalised like template keys ("Mobile Number" → "mobilenumber"). */
  columns: readonly string[];
  /** Validates what the user typed and returns the canonical form to store. */
  normalize(raw: string, options: NormalizeOptions): NormalizeResult;
  /** Readable form of a stored value. */
  format(value: string): string;
}

/** One way a link connector can open, e.g. WhatsApp Web or the app picker. */
export interface LinkTarget {
  id: string;
  label: string;
  hint: string;
  /** Builds the URL from a normalised address and the message text. Must stay on the connector's `hosts`. */
  build(address: string, text: string): string;
}

interface ConnectorBase {
  /** Stable id. Matches the file name in catalog/ and is stored in settings and contacts. */
  id: string;
  name: string;
  /** Background of the round icon. */
  color: string;
  /** SVG path data for a 24×24 icon, drawn in white. */
  iconPath: string;
  /** One sentence for the Settings page. */
  description: string;
  /** Id of the AddressKind this connector needs. */
  address: string;
  /** Extra mail merge column names for this app only, checked before the address kind's own. */
  columns?: readonly string[];
  /** Longest message this connector accepts, at most MAX_CONNECTOR_MESSAGE. */
  maxTextLength: number;
}

/** Opens the other app with the message ready. The user checks it and presses Send there. */
export interface LinkConnector extends ConnectorBase {
  delivery: 'link';
  /** The first one is the default. Users pick another in Settings. */
  targets: readonly LinkTarget[];
  /** Hosts the built links may point to. Anything else is refused before a tab opens. */
  hosts: readonly string[];
}

/**
 * Every kind of connector. To add API delivery later, add an `ApiConnector` with `delivery: 'api'` to this
 * union; the compiler then points at every place that has to handle it.
 */
export type Connector = LinkConnector;
