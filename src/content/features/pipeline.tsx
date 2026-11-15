import type { LabelDescriptor, MessageView, ThreadView } from '@inboxsdk/core';
import * as Kefir from 'kefir';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { APP_NAME, ROUTES } from '../../config';
import { stagesFor, textColorFor } from '../../lib/playbooks';
import { threadKey } from '../../lib/storage';
import type { Contact, Stage, StoreData, TrackedThread } from '../../lib/types';
import { getData, store, subscribe, useData } from '../../shared/live';
import { formatDate, morningIn, relativeDue } from '../../shared/time';
import { iconUrl, sendToBackground, type Ctx } from '../context';
import { Board } from '../ui/Board';

function safeSender(m: MessageView): { name: string; emailAddress: string } | null {
  try {
    const s = m.getSender();
    return s?.emailAddress ? s : null;
  } catch {
    return null;
  }
}

/** The other person in the thread: the latest sender who isn't me, else someone I wrote to. */
export function detectContact(threadView: ThreadView, me: string): Contact | null {
  const messages = threadView.getMessageViewsAll();
  for (let i = messages.length - 1; i >= 0; i--) {
    const s = safeSender(messages[i]!);
    if (s && s.emailAddress.toLowerCase() !== me) return { name: s.name ?? '', email: s.emailAddress };
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    try {
      if (!m.isLoaded()) continue;
      const r = m.getRecipients().find((x) => x.emailAddress.toLowerCase() !== me);
      if (r) return { name: r.name ?? '', email: r.emailAddress };
    } catch {
      // collapsed or unloaded message
    }
  }
  return null;
}

export function stageOf(data: StoreData, t: TrackedThread | undefined | null): Stage | undefined {
  return t ? data.stages.find((s) => s.id === t.stageId) : undefined;
}

export function scheduleFollowUp(account: string, threadId: string, when: number): void {
  sendToBackground({ type: 'gp:schedule-follow-up', account, threadId, when });
}

function StageSelect({ data, value, onChange, placeholder }: {
  data: StoreData;
  value: string;
  onChange: (stageId: string) => void;
  placeholder?: string;
}) {
  const active = stagesFor(data.stages, data.settings.playbooks);
  const current = data.stages.find((s) => s.id === value);
  const extra = current && !active.some((s) => s.id === current.id) ? [current] : [];
  const groups = data.playbooks.map((p) => ({ p, items: [...active, ...extra].filter((s) => s.playbookId === p.id) })).filter((g) => g.items.length);
  return (
    <select class="gp-input" value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
      {placeholder && <option value="">{placeholder}</option>}
      {groups.map(({ p, items }) =>
        groups.length > 1 ? (
          <optgroup label={p.name} key={p.id}>
            {items.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}
          </optgroup>
        ) : (
          items.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)
        ),
      )}
    </select>
  );
}

function FollowUp({ ctx, t, threadView }: { ctx: Ctx; t: TrackedThread; threadView: ThreadView }) {
  const [custom, setCustom] = useState('');
  const set = (when: number) => {
    void store.saveThread({
      ...t,
      followUpAt: when,
      followUpMessageCount: threadView.getMessageViewsAll().length,
      followUpDone: false,
      notifiedAt: null,
    });
    scheduleFollowUp(ctx.account, t.threadId, when);
  };
  const clear = () => void store.saveThread({ ...t, followUpAt: null, followUpMessageCount: null, followUpDone: false, notifiedAt: null });

  if (t.followUpAt && !t.followUpDone) {
    const due = relativeDue(t.followUpAt);
    return (
      <div class="gp-field">
        <div class="gp-label">Follow-up</div>
        <div class={`gp-due gp-due-${due.tone}`}>{due.label} · {formatDate(t.followUpAt)}</div>
        <p class="gp-muted gp-small">Clears itself when they reply.</p>
        <div class="gp-row">
          <button type="button" class="gp-btn" onClick={() => void store.saveThread({ ...t, followUpDone: true })}>Done</button>
          <button type="button" class="gp-btn gp-btn-ghost" onClick={clear}>Remove</button>
        </div>
      </div>
    );
  }
  return (
    <div class="gp-field">
      <div class="gp-label">Remind me to follow up</div>
      <div class="gp-row">
        <button type="button" class="gp-btn" onClick={() => set(morningIn(1))}>Tomorrow</button>
        <button type="button" class="gp-btn" onClick={() => set(morningIn(3))}>3 days</button>
        <button type="button" class="gp-btn" onClick={() => set(morningIn(7))}>1 week</button>
      </div>
      <div class="gp-row">
        <input class="gp-input" type="datetime-local" value={custom} onInput={(e) => setCustom((e.target as HTMLInputElement).value)} />
        <button
          type="button"
          class="gp-btn"
          disabled={!custom}
          onClick={() => {
            const when = new Date(custom).getTime();
            if (Number.isFinite(when)) set(when);
            setCustom('');
          }}
        >
          Set
        </button>
      </div>
      {t.followUpDone && <p class="gp-muted gp-small">Last follow-up done.</p>}
    </div>
  );
}

function ThreadPanel({ ctx, threadView, threadId }: { ctx: Ctx; threadView: ThreadView; threadId: string }) {
  const data = useData();
  const t = data.threads[threadKey(ctx.account, threadId)];
  const [notes, setNotes] = useState(t?.notes ?? '');
  useEffect(() => setNotes(t?.notes ?? ''), [t?.notes]);

  const track = (stageId: string) => {
    if (!stageId) return;
    void store.saveThread({
      account: ctx.account,
      threadId,
      stageId,
      subject: threadView.getSubject(),
      contact: detectContact(threadView, ctx.account),
      notes: '',
      followUpAt: null,
      followUpMessageCount: null,
      followUpDone: false,
      notifiedAt: null,
      updatedAt: Date.now(),
    });
  };

  if (!t) {
    return (
      <div class="gp-root gp-panel-body">
        <p class="gp-muted">Track this conversation on your pipeline.</p>
        <StageSelect data={data} value="" placeholder="Add to pipeline…" onChange={track} />
      </div>
    );
  }

  return (
    <div class="gp-root gp-panel-body">
      {t.contact && (
        <div class="gp-field">
          <div class="gp-label">Contact</div>
          <div><strong>{t.contact.name || t.contact.email}</strong></div>
          {t.contact.name && <div class="gp-muted gp-small">{t.contact.email}</div>}
        </div>
      )}
      <div class="gp-field">
        <div class="gp-label">Stage</div>
        <StageSelect data={data} value={t.stageId} onChange={(stageId) => stageId && void store.saveThread({ ...t, stageId })} />
      </div>
      <FollowUp ctx={ctx} t={t} threadView={threadView} />
      <div class="gp-field">
        <div class="gp-label">Notes</div>
        <textarea
          class="gp-input gp-notes"
          rows={4}
          value={notes}
          placeholder="Budget, next steps, anything to remember"
          onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
          onBlur={() => notes !== t.notes && void store.saveThread({ ...t, notes })}
        />
      </div>
      <div class="gp-row gp-spread">
        <button type="button" class="gp-link" onClick={() => void ctx.sdk.Router.goto(ROUTES.pipeline)}>Open pipeline</button>
        <button type="button" class="gp-link gp-danger" onClick={() => void store.deleteThread(ctx.account, threadId)}>
          Remove from pipeline
        </button>
      </div>
    </div>
  );
}

async function autoClearFollowUp(ctx: Ctx, threadView: ThreadView, threadId: string): Promise<void> {
  const t = await store.getThread(ctx.account, threadId);
  if (!t || t.followUpDone || t.followUpAt === null || t.followUpMessageCount === null) return;
  const messages = threadView.getMessageViewsAll();
  if (messages.length <= t.followUpMessageCount) return;
  const last = safeSender(messages[messages.length - 1]!);
  if (!last || last.emailAddress.toLowerCase() === ctx.account) return;
  await store.saveThread({ ...t, followUpDone: true });
  ctx.sdk.ButterBar.showMessage({ text: `${last.name || last.emailAddress} replied, so the follow-up is cleared.`, time: 5000 });
}

function labelFor(data: StoreData, t: TrackedThread | undefined): LabelDescriptor | null {
  const stage = stageOf(data, t);
  if (!t || !stage) return null;
  const due = t.followUpAt && !t.followUpDone && t.followUpAt <= Date.now();
  return {
    title: `${due ? '⏰ ' : ''}${stage.name}`,
    backgroundColor: stage.color,
    foregroundColor: textColorFor(stage.color),
    maxWidth: '140px',
  };
}

export function registerPipeline(ctx: Ctx): void {
  const { sdk } = ctx;

  sdk.Conversations.registerThreadViewHandler((threadView) => {
    let destroyed = false;
    const el = document.createElement('div');
    threadView.once('destroy', () => {
      destroyed = true;
      render(null, el);
    });
    threadView.addSidebarContentPanel({ title: 'Pipeline', iconUrl: iconUrl('pipeline'), el, orderHint: 0 });
    threadView
      .getThreadIDAsync()
      .then((threadId) => {
        if (destroyed) return;
        render(<ThreadPanel ctx={ctx} threadView={threadView} threadId={threadId} />, el);
        void autoClearFollowUp(ctx, threadView, threadId);
      })
      .catch((err) => console.warn(`[${APP_NAME}] no thread id`, err));
  });

  sdk.Lists.registerThreadRowViewHandler((row) => {
    const labels = Kefir.stream<LabelDescriptor | null, never>((emitter) => {
      let threadId: string | null = null;
      let last = '';
      const push = (data: StoreData) => {
        if (!threadId) return;
        const label = labelFor(data, data.threads[threadKey(ctx.account, threadId)]);
        const sig = JSON.stringify(label);
        if (sig !== last) {
          last = sig;
          emitter.emit(label);
        }
      };
      row.getThreadIDAsync().then((id: string) => {
        threadId = id;
        push(getData());
      }, () => undefined);
      return subscribe(push);
    });
    row.addLabel(labels);
  });

  sdk.Router.handleCustomRoute(ROUTES.pipeline, (routeView) => {
    const el = routeView.getElement();
    routeView.setFullWidth(true);
    render(<Board ctx={ctx} />, el);
    routeView.once('destroy', () => render(null, el));
  });
}
