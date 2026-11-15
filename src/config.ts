/**
 * InboxSDK app id, from https://register.inboxsdk.com/ (free). It looks like
 * sdk_<name>_<10 hex characters>. Any other value still loads the SDK, but Gmail
 * shows a red "Invalid AppId" developer banner.
 */
export const APP_ID = 'sdk_GPlusSettings_a5074a55a5';
export const APP_NAME = 'Gmail Plus';

export const ROUTES = {
  pipeline: 'gmail-plus-pipeline',
  merge: 'gmail-plus-merge',
} as const;

export const FOLLOW_UP_ALARM = 'gp-followups';
export const FOLLOW_UP_ALARM_PREFIX = 'gp-fu|';
export const NOTIFICATION_PREFIX = 'gp-fu|';

export type ExtensionMessage =
  | { type: 'gp:schedule-follow-up'; account: string; threadId: string; when: number }
  | { type: 'gp:open-options'; section?: string };
