import type { AppConfig } from './configTypes';

// Injected at build time by build.mjs (and by vitest.config.mjs for tests). See docs/CONFIGURATION.md.
declare const __GP_CONFIG__: AppConfig;

export const CONFIG: AppConfig = __GP_CONFIG__;

export const APP_NAME = CONFIG.appName;

/** InboxSDK needs some string; an unregistered one only triggers its developer banner. */
export const APP_ID = CONFIG.inboxSdkAppId || `${CONFIG.appSlug}-unregistered`;

export const ROUTES = {
  pipeline: `${CONFIG.appSlug}-pipeline`,
  merge: `${CONFIG.appSlug}-merge`,
} as const;

export const FOLLOW_UP_ALARM = 'gp-followups';
export const FOLLOW_UP_ALARM_PREFIX = 'gp-fu|';
export const NOTIFICATION_PREFIX = 'gp-fu|';

export type ExtensionMessage =
  | { type: 'gp:schedule-follow-up'; account: string; threadId: string; when: number }
  | { type: 'gp:open-options'; section?: string };
