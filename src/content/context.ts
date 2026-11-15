import type { InboxSDK } from '@inboxsdk/core';
import type { ExtensionMessage } from '../config';
import { getData } from '../shared/live';

export interface Ctx {
  sdk: InboxSDK;
  /** Lower-cased address of the Gmail account in this tab. */
  account: string;
}

export function myName(ctx: Ctx): string {
  const fromSettings = getData().settings.myName.trim();
  if (fromSettings) return fromSettings;
  try {
    return ctx.sdk.User.getUserContact().name ?? '';
  } catch {
    return '';
  }
}

export function iconUrl(name: string): string {
  return chrome.runtime.getURL(`icons/${name}.svg`);
}

/** Fire-and-forget message to the background worker. Survives a missing receiver. */
export function sendToBackground(message: ExtensionMessage): void {
  try {
    chrome.runtime.sendMessage(message).catch(() => undefined);
  } catch {
    // The extension was reloaded while this Gmail tab stayed open.
  }
}

export function openSettings(section?: string): void {
  sendToBackground({ type: 'gp:open-options', section });
}
