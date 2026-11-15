// InboxSDK's worker injects pageWorld.js into Gmail. It must load first.
import '@inboxsdk/core/background.js';
import { CONFIG, FOLLOW_UP_ALARM, FOLLOW_UP_ALARM_PREFIX, NOTIFICATION_PREFIX, type ExtensionMessage } from '../config';
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

chrome.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as ExtensionMessage | undefined;
  if (msg?.type === 'gp:schedule-follow-up') {
    // A one-off alarm so short reminders don't wait for the 15-minute sweep.
    void chrome.alarms.create(`${FOLLOW_UP_ALARM_PREFIX}${msg.account}|${msg.threadId}`, { when: Math.max(msg.when, Date.now() + 30_000) });
  } else if (msg?.type === 'gp:open-options') {
    const hash = msg.section ? `#${encodeURIComponent(msg.section)}` : '';
    void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${hash}`) });
  }
  // No async response; leave other listeners (InboxSDK's) alone.
  return false;
});
