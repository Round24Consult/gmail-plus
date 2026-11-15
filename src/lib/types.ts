export type PlaybookId = 'freelancer' | 'recruiter' | 'support';
export type OwnerId = PlaybookId | 'custom';

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

export interface Settings {
  playbooks: PlaybookId[];
  onboarded: boolean;
  dailySendCap: number;
  sendIntervalSec: number;
  myName: string;
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
}

export interface SendCounter {
  date: string;
  count: number;
}

export interface StoreData {
  schemaVersion: number;
  settings: Settings;
  templates: Template[];
  stages: Stage[];
  threads: Record<string, TrackedThread>;
  campaigns: Campaign[];
  sendCounter: SendCounter;
}
