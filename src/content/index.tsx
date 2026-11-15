import * as InboxSDK from '@inboxsdk/core';
import type { InboxSDK as SDK } from '@inboxsdk/core';
import { APP_ID, APP_NAME, ROUTES } from '../config';
import { getData, initLive } from '../shared/live';
import { iconUrl, type Ctx } from './context';
import { registerConnectors } from './features/connectors';
import { registerExport } from './features/export';
import { registerMailMerge } from './features/mailmerge';
import { registerPeople } from './features/people';
import { registerPipeline } from './features/pipeline';
import { registerTemplates } from './features/templates';
import { watchTheme } from './theme';

/** Where the page was opened, read before Gmail starts and replaces addresses it doesn't know with #inbox. */
const START_HASH = location.hash;

/**
 * Makes links such as mail.google.com/mail/u/0/#gmail-plus-pipeline work when they open a fresh Gmail tab. Gmail
 * finishes loading (and sends unknown addresses to the inbox) before InboxSDK is ready and our routes exist, so
 * go to the route the page was opened on once they do.
 */
function restoreStartRoute(sdk: SDK): void {
  const route = Object.values(ROUTES).find((r) => START_HASH === `#${r}` || START_HASH.startsWith(`#${r}/`));
  if (route && location.hash !== START_HASH) void sdk.Router.goto(route);
}

async function main(): Promise<void> {
  const [sdk] = await Promise.all([
    InboxSDK.load(2, APP_ID, {
      appName: APP_NAME,
      appIconUrl: chrome.runtime.getURL('icons/48.png'),
      // Keep everything local: no InboxSDK error or usage reporting.
      globalErrorLogging: false,
      eventTracking: false,
    }),
    initLive(),
  ]);

  const ctx: Ctx = { sdk, account: sdk.User.getEmailAddress().toLowerCase() };
  watchTheme(sdk);

  sdk.NavMenu.addNavItem({ name: 'Pipeline', routeID: ROUTES.pipeline, iconUrl: iconUrl('pipeline'), orderHint: 0 });
  sdk.NavMenu.addNavItem({ name: 'Mail merge', routeID: ROUTES.merge, iconUrl: iconUrl('merge'), orderHint: 1 });

  registerTemplates(ctx);
  registerPipeline(ctx);
  registerExport(ctx);
  registerMailMerge(ctx);
  registerConnectors(ctx);
  registerPeople(ctx);
  restoreStartRoute(sdk);

  if (!getData().settings.onboarded) {
    sdk.ButterBar.showMessage({
      text: `${APP_NAME} is on. Open its settings from the extension icon to pick your playbook.`,
      time: 8000,
    });
  }
}

main().catch((err) => console.error(`[${APP_NAME}] failed to start`, err));
