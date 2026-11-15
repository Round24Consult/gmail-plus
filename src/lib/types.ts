/** Playbook ids come from playbooks/*.json or are created by the user in Settings. */
export type PlaybookId = string;
/** A playbook id, or 'custom' for the user's own templates group. */
export type OwnerId = string;
export const CUSTOM_OWNER = 'custom';

export interface Playbook {
  id: PlaybookId;
  name: string;
  blurb: string;
  /** Shipped in playbooks/*.json (as opposed to created by the user). */
  builtIn: boolean;
}

export interface Template {
  id: string;
  name: string;
  emoji: string;
  /** Used when the template starts a new message or a mail merge. */
  subject?: string;
  /** Plain text with {{variables}}. Rendered to HTML on insert. */
  body: string;
  playbookId: OwnerId;
}

export interface Stage {
  id: string;
  name: string;
  /** Badge background colour. Text colour is picked for contrast. */
  color: string;
  order: number;
  playbookId: PlaybookId;
  /** Won, lost, hired, resolved: hidden from "open" counts. */
  closed?: boolean;
}

export interface Contact {
  name: string;
  email: string;
}

export interface TrackedThread {
  /** Gmail account the thread belongs to. */
  account: string;
  threadId: string;
  stageId: string;
  subject: string;
  contact: Contact | null;
  notes: string;
  followUpAt: number | null;
  /** Message count when the follow-up was set; a later reply from the contact clears it. */
  followUpMessageCount: number | null;
  followUpDone: boolean;
  notifiedAt: number | null;
  updatedAt: number;
}

export interface ConnectorSettings {
  /** Connector ids the user switched off. Connectors added in an update start switched on. */
  disabled: string[];
  /** ISO 3166 code for phone numbers written without a country code, or ''. */
  defaultCountry: string;
  /** Chosen way to open each link connector, e.g. { whatsapp: 'web' }. Missing means its first target. */
  targets: Record<string, string>;
  /** Text the message box starts with. Template variables work. */
  message: string;
  /** After an email goes to someone with a saved number, offer to message them too. */
  offerAfterSend: boolean;
}

export interface Settings {
  playbooks: PlaybookId[];
  onboarded: boolean;
  dailySendCap: number;
  sendIntervalSec: number;
  myName: string;
  /** Remember people from conversations and sent emails, for recipient search. */
  rememberPeople: boolean;
  connectors: ConnectorSettings;
}

/** What is known about a person beyond their email address, shared by every conversation with them. */
export interface ContactCard {
  account: string;
  /** Lower-cased. */
  email: string;
  name: string;
  /** Saved addresses by address kind id, normalised, e.g. { phone: '+447911123456' }. */
  handles: Record<string, string>;
  /** When each connector was last opened for this person, by connector id. */
  lastReached: Record<string, number>;
  updatedAt: number;
}

export type RowStatus = 'sent' | 'failed' | 'skipped';

export interface RowResult {
  index: number;
  email: string;
  status: RowStatus;
  error?: string;
  at: number;
}

export type CampaignStatus = 'draft' | 'running' | 'paused' | 'stopped' | 'capped' | 'done';

export interface Campaign {
  id: string;
  account: string;
  name: string;
  subject: string;
  body: string;
  rows: Record<string, string>[];
  status: CampaignStatus;
  cursor: number;
  log: RowResult[];
  createdAt: number;
  heartbeatAt: number | null;
  /** Send rows even when a variable has no value (it is left blank). */
  sendAnyway?: boolean;
  /** Pipeline stage for each sent conversation, or '' for none. */
  addToStageId?: string;
  /** Row index being sent right now. If the page closes mid-send, that row is not retried. */
  inFlight?: number | null;
  /** Message used for connector follow-ups (WhatsApp…) after this merge. Falls back to the default message. */
  reachMessage?: string;
}

export interface SendCounter {
  date: string;
  count: number;
}

export interface StoreData {
  schemaVersion: number;
  settings: Settings;
  playbooks: Playbook[];
  /** Ids of bundled playbooks already added once, so a deleted one is not re-added on update. */
  seededPlaybooks: string[];
  templates: Template[];
  stages: Stage[];
  threads: Record<string, TrackedThread>;
  /** Keyed like storage: contact:<account>:<email>. */
  contacts: Record<string, ContactCard>;
  campaigns: Campaign[];
  sendCounter: SendCounter;
}
