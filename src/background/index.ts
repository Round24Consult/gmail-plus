// InboxSDK's worker injects pageWorld.js into Gmail. It must load first.
import '@inboxsdk/core/background.js';
import { CONFIG, FOLLOW_UP_ALARM, FOLLOW_UP_ALARM_PREFIX, NOTIFICATION_PREFIX, type ConnectorReply, type ExtensionMessage } from '../config';
import { addressKindOf, buildLink, enabledConnectors, targetFor } from '../lib/connectors/registry';
import { Store } from '../lib/storage';
import { chromeArea } from '../shared/chromeArea';

const store = new Store(chromeArea);

function ensureAlarm(): void {
  const period = CONFIG.followUps.sweepMinutes;
  void chrome.alarms.get(FOLLOW_UP_ALARM).then((existing) => {
    // Recreate when missing or when a new build changed the sweep interval.
    if (!existing || existing.periodInMinutes !== period) void chrome.alarms.create(FOLLOW_UP_ALARM, { periodInMinutes: period, delayInMinutes: 1 });
  });
}

function gmailThreadUrl(account: string, threadId: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#all/${encodeURIComponent(threadId)}`;
}

/** Shows one notification per follow-up that is due and has not been announced yet. */
async function notifyDueFollowUps(): Promise<void> {
  const data = await store.load();
  const now = Date.now();
  for (const t of Object.values(data.threads)) {
    if (t.followUpAt === null || t.followUpDone || t.notifiedAt !== null || t.followUpAt > now) continue;
    const who = t.contact?.name || t.contact?.email || 'your contact';
    await chrome.notifications.create(`${NOTIFICATION_PREFIX}${t.account}|${t.threadId}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/128.png'),
      title: `Follow up with ${who}`,
      message: t.subject || '(no subject)',
      contextMessage: t.account,
      priority: 1,
    });
    await store.saveThread({ ...t, notifiedAt: now });
  }
}

const CONNECTOR_TAB_PREFIX = 'connectorTab:';
/** Redirects right after we open a link (wa.me → WhatsApp Web) are ours; later page loads are the user's. */
const CONNECTOR_TAB_SETTLE_MS = 15_000;

interface ConnectorTab {
  tabId: number;
  openedAt: number;
}

/**
 * Opens a URL in the tab this connector used last (so WhatsApp Web isn't opened twenty times during a list),
 * or in a new tab. The tab is only reused while it still shows what we opened: see the onUpdated listener.
 * The record lives in session storage, which survives the worker stopping but not a browser restart.
 */
async function openInConnectorTab(connectorId: string, url: string): Promise<void> {
  const key = `${CONNECTOR_TAB_PREFIX}${connectorId}`;
  const saved = (await chrome.storage.session.get(key))[key] as ConnectorTab | undefined;
  if (saved && typeof saved.tabId === 'number') {
    try {
      const current = await chrome.tabs.get(saved.tabId);
      // `url` is only visible for sites this extension may access, i.e. Gmail. Never take over a Gmail tab.
      if (current.url === undefined) {
        await chrome.storage.session.set({ [key]: { tabId: saved.tabId, openedAt: Date.now() } satisfies ConnectorTab });
        const tab = await chrome.tabs.update(saved.tabId, { url, active: true });
        if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
        return;
      }
    } catch {
      // The tab was closed; open a new one.
    }
  }
  const tab = await chrome.tabs.create({ url });
  if (tab.id !== undefined) await chrome.storage.session.set({ [key]: { tabId: tab.id, openedAt: Date.now() } satisfies ConnectorTab });
}

/** Stops reusing a connector tab once it starts loading a page we didn't open, so the user's page is never replaced. */
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== 'loading') return;
  void chrome.storage.session.get(null).then((all) => {
    const stale = Object.entries(all)
      .filter(([k, v]) => k.startsWith(CONNECTOR_TAB_PREFIX) && (v as ConnectorTab)?.tabId === tabId && Date.now() - (v as ConnectorTab).openedAt > CONNECTOR_TAB_SETTLE_MS)
      .map(([k]) => k);
    if (stale.length) void chrome.storage.session.remove(stale);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.get(null).then((all) => {
    const gone = Object.entries(all).filter(([k, v]) => k.startsWith(CONNECTOR_TAB_PREFIX) && (v as ConnectorTab)?.tabId === tabId).map(([k]) => k);
    if (gone.length) void chrome.storage.session.remove(gone);
  });
});

/** Validates the request against the user's settings, builds the link here and opens it. */
async function openConnector(msg: Extract<ExtensionMessage, { type: 'gp:open-connector' }>): Promise<ConnectorReply> {
  const { settings } = await store.load();
  const connector = enabledConnectors(settings.connectors).find((c) => c.id === msg.connectorId);
  if (!connector) return { ok: false, error: 'That connector is switched off in Settings.' };
  const address = addressKindOf(connector).normalize(String(msg.address ?? ''), { defaultCountry: settings.connectors.defaultCountry });
  if (!address.ok) return { ok: false, error: address.error };
  try {
    const url = buildLink(connector, targetFor(connector, settings.connectors), address.value, String(msg.text ?? ''));
    await openInConnectorTab(connector.id, url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  ensureAlarm();
  void store.ensureInitialized();
  if (details.reason === 'install') void chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  void notifyDueFollowUps();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FOLLOW_UP_ALARM || alarm.name.startsWith(FOLLOW_UP_ALARM_PREFIX)) void notifyDueFollowUps();
});

chrome.notifications.onClicked.addListener((id) => {
  if (!id.startsWith(NOTIFICATION_PREFIX)) return;
  const [account = '', threadId = ''] = id.slice(NOTIFICATION_PREFIX.length).split('|');
  if (account && threadId) void chrome.tabs.create({ url: gmailThreadUrl(account, threadId) });
  void chrome.notifications.clear(id);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const msg = message as ExtensionMessage | undefined;
  // Only this extension's own pages and content scripts.
  if (sender.id !== chrome.runtime.id) return false;
  if (msg?.type === 'gp:open-connector') {
    void openConnector(msg).then(sendResponse, (err: unknown) => sendResponse({ ok: false, error: String(err) } satisfies ConnectorReply));
    return true; // answer asynchronously
  }
  if (msg?.type === 'gp:schedule-follow-up') {
    // A one-off alarm so short reminders don't wait for the 15-minute sweep.
    void chrome.alarms.create(`${FOLLOW_UP_ALARM_PREFIX}${msg.account}|${msg.threadId}`, { when: Math.max(msg.when, Date.now() + 30_000) });
  } else if (msg?.type === 'gp:open-options') {
    const hash = msg.section ? `#${encodeURIComponent(msg.section)}` : '';
    void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${hash}`) });
  }
  // No async response for the rest; leave other listeners (InboxSDK's) alone.
  return false;
});
