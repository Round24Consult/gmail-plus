/** A playbook as shipped in playbooks/<id>.json. */
export interface PlaybookSeed {
  id: string;
  name: string;
  blurb: string;
  order: number;
  stages: Array<{ key: string; name: string; color: string; closed?: boolean }>;
  templates: Array<{ key: string; emoji?: string; name: string; subject?: string; body: string }>;
}

/** Build-time configuration: config/defaults.json, then .env and environment variables, plus playbooks/*.json. */
export interface AppConfig {
  appName: string;
  appShortName: string;
  /** Lowercase id used for route names, file names and the backup format. */
  appSlug: string;
  appDescription: string;
  /** From https://register.inboxsdk.com/. Empty means Gmail shows InboxSDK's "Invalid AppId" banner. */
  inboxSdkAppId: string;
  supportEmail: string;
  homepageUrl: string;
  privacyPolicyUrl: string;
  mailMerge: {
    defaultDailyCap: number;
    maxDailyCap: number;
    defaultIntervalSec: number;
    minIntervalSec: number;
    maxIntervalSec: number;
    maxRecipients: number;
  };
  followUps: {
    /** How often the background checks for due follow-ups. */
    sweepMinutes: number;
    /** Hour of day (0-23) used by the "Tomorrow / 3 days / 1 week" buttons. */
    reminderHour: number;
  };
  /** Playbooks switched on at first run. Empty means all of them. */
  defaultPlaybooks: string[];
  playbooks: PlaybookSeed[];
  /** The local address book behind recipient search in mail merge. */
  people: {
    /** Remember people from conversations the user views and emails, for recipient search. Users can change it. */
    remember: boolean;
    /** Most people kept per Gmail account; the least recently seen are dropped first. */
    maxRemembered: number;
  };
  /** Other apps users can message their contacts on. See docs/CONNECTORS.md. */
  connectors: {
    /** Connector ids this build ships, in display order. Each one is src/lib/connectors/catalog/<id>.ts. */
    available: string[];
    /** ISO 3166 code (GB, US, NG…) for phone numbers written without a country code, or ''. Users can change it. */
    defaultCountry: string;
    /** Text the message box starts with. Template variables work. Users can change it. */
    defaultMessage: string;
    /** After an email goes to someone with a saved number, offer to message them too. Users can change it. */
    offerAfterSend: boolean;
  };
}
