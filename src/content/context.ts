import type { InboxSDK } from '@inboxsdk/core';
import type { ConnectorReply, ExtensionMessage } from '../config';
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

/** Opens a link connector through the background worker and reports whether it worked. */
export async function openConnectorLink(message: Extract<ExtensionMessage, { type: 'gp:open-connector' }>): Promise<ConnectorReply> {
  try {
    const reply = (await chrome.runtime.sendMessage(message)) as ConnectorReply | undefined;
    return reply ?? { ok: false, error: 'The extension did not answer. Reload Gmail and try again.' };
  } catch {
    return { ok: false, error: 'The extension was updated. Reload Gmail and try again.' };
  }
}

export function openSettings(section?: string): void {
  sendToBackground({ type: 'gp:open-options', section });
}
