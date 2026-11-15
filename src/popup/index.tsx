import { render } from 'preact';
import { APP_NAME, ROUTES } from '../config';
import { dayKey } from '../lib/storage';
import { initLive, useData } from '../shared/live';

const GMAIL = 'https://mail.google.com/mail/u/0/';

function openTab(url: string): void {
  void chrome.tabs.create({ url });
  window.close();
}

function Popup() {
  const data = useData();
  const tracked = Object.values(data.threads);
  const due = tracked.filter((t) => t.followUpAt !== null && !t.followUpDone && t.followUpAt <= Date.now()).length;
  const sentToday = data.sendCounter.date === dayKey(Date.now()) ? data.sendCounter.count : 0;
  return (
    <main class="gp-root gp-popup">
      <header class="gp-row">
        <img src="icons/48.png" alt="" width={24} height={24} />
        <strong>{APP_NAME}</strong>
      </header>
      <ul class="gp-stats">
        <li><strong>{tracked.length}</strong> in pipeline</li>
        <li class={due ? 'gp-due-overdue' : ''}><strong>{due}</strong> follow-ups due</li>
        <li><strong>{sentToday}</strong> / {data.settings.dailySendCap} merge emails today</li>
      </ul>
      <div class="gp-stack">
        <button type="button" class="gp-btn gp-btn-primary" onClick={() => openTab(`${GMAIL}#${ROUTES.pipeline}`)}>Open pipeline</button>
        <button type="button" class="gp-btn" onClick={() => openTab(`${GMAIL}#${ROUTES.merge}`)}>New mail merge</button>
        <button type="button" class="gp-btn gp-btn-ghost" onClick={() => { void chrome.runtime.openOptionsPage(); window.close(); }}>Settings</button>
      </div>
      {!data.settings.onboarded && <p class="gp-small gp-muted">Start in Settings: pick your playbook.</p>}
    </main>
  );
}

void initLive().then(() => render(<Popup />, document.getElementById('app')!));
