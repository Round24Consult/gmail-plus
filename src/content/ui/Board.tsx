import { useEffect, useState } from 'preact/hooks';
import { toCsv } from '../../lib/csv';
import { APP_NAME } from '../../config';
import { orderedActive, playbookName, stagesFor } from '../../lib/playbooks';
import { threadKey } from '../../lib/storage';
import type { PlaybookId, Stage, StoreData, TrackedThread } from '../../lib/types';
import { downloadText, todayStamp } from '../../shared/download';
import { store, useData } from '../../shared/live';
import { formatDate, relativeDue } from '../../shared/time';
import { openSettings, type Ctx } from '../context';

function isDue(t: TrackedThread, now: number): boolean {
  return t.followUpAt !== null && !t.followUpDone && t.followUpAt <= now;
}

function sortThreads(list: TrackedThread[], now: number): TrackedThread[] {
  return [...list].sort((a, b) => {
    const dueA = isDue(a, now) ? 0 : 1;
    const dueB = isDue(b, now) ? 0 : 1;
    if (dueA !== dueB) return dueA - dueB;
    return b.updatedAt - a.updatedAt;
  });
}

function exportPipeline(data: StoreData, threads: TrackedThread[]): void {
  const stageById = new Map(data.stages.map((s) => [s.id, s]));
  const rows = threads.map((t) => {
    const stage = stageById.get(t.stageId);
    return {
      name: t.contact?.name ?? '',
      email: t.contact?.email ?? '',
      subject: t.subject,
      stage: stage?.name ?? '',
      playbook: stage ? playbookName(data.playbooks, stage.playbookId) : '',
      follow_up: t.followUpAt && !t.followUpDone ? new Date(t.followUpAt).toISOString() : '',
      notes: t.notes,
      updated: new Date(t.updatedAt).toISOString(),
    };
  });
  const headers = ['name', 'email', 'subject', 'stage', 'playbook', 'follow_up', 'notes', 'updated'];
  downloadText(`pipeline-${todayStamp()}.csv`, toCsv(headers, rows));
}

function Card({ ctx, t, stages, now }: { ctx: Ctx; t: TrackedThread; stages: Stage[]; now: number }) {
  const due = t.followUpAt && !t.followUpDone ? relativeDue(t.followUpAt, now) : null;
  const open = () => void ctx.sdk.Router.goto(ctx.sdk.Router.NativeRouteIDs.THREAD, { threadID: t.threadId });
  return (
    <div
      class="gp-card"
      draggable
      onDragStart={(e) => e.dataTransfer?.setData('text/plain', threadKey(t.account, t.threadId))}
    >
      <button type="button" class="gp-card-title" onClick={open} title="Open conversation">
        {t.subject || '(no subject)'}
      </button>
      {t.contact && <div class="gp-muted gp-small">{t.contact.name || t.contact.email}</div>}
      {due && (
        <div class={`gp-due gp-due-${due.tone}`} title={formatDate(t.followUpAt!)}>
          ⏰ {due.label}
        </div>
      )}
      {t.notes && <div class="gp-card-notes">{t.notes.slice(0, 120)}</div>}
      <select
        class="gp-input gp-card-stage"
        aria-label="Move to stage"
        value={t.stageId}
        onChange={(e) => void store.saveThread({ ...t, stageId: (e.target as HTMLSelectElement).value })}
      >
        {stages.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
}

export function Board({ ctx }: { ctx: Ctx }) {
  const data = useData();
  const active = orderedActive(data.playbooks, data.settings.playbooks).map((p) => p.id);
  const [picked, setPicked] = useState<PlaybookId | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    // Re-evaluate "due" labels every minute while the board is open.
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const playbook = picked && active.includes(picked) ? picked : active[0];

  const mine = Object.values(data.threads).filter((t) => t.account === ctx.account);
  const due = sortThreads(mine.filter((t) => isDue(t, now)), now);

  if (!playbook) {
    return (
      <div class="gp-root gp-page">
        <h1 class="gp-h1">Pipeline</h1>
        <p>No playbook is switched on.</p>
        <button type="button" class="gp-btn gp-btn-primary" onClick={() => openSettings('playbooks')}>Choose a playbook</button>
      </div>
    );
  }

  const stages = stagesFor(data.stages, [playbook]);
  const inPlaybook = mine.filter((t) => stages.some((s) => s.id === t.stageId));

  const drop = (stageId: string, e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const key = e.dataTransfer?.getData('text/plain');
    const t = key ? data.threads[key] : undefined;
    if (t && t.stageId !== stageId) void store.saveThread({ ...t, stageId });
  };

  return (
    <div class="gp-root gp-page">
      <div class="gp-row gp-spread gp-page-head">
        <h1 class="gp-h1">Pipeline</h1>
        <div class="gp-row">
          <button type="button" class="gp-btn" disabled={!mine.length} onClick={() => exportPipeline(data, mine)}>
            Export CSV
          </button>
          <button type="button" class="gp-btn gp-btn-ghost" onClick={() => openSettings('playbooks')}>Settings</button>
        </div>
      </div>

      {active.length > 1 && (
        <div class="gp-tabs" role="tablist">
          {active.map((id) => (
            <button
              type="button"
              role="tab"
              aria-selected={id === playbook}
              class={`gp-tab ${id === playbook ? 'gp-tab-on' : ''}`}
              onClick={() => setPicked(id)}
              key={id}
            >
              {playbookName(data.playbooks, id)}
            </button>
          ))}
        </div>
      )}

      {due.length > 0 && (
        <div class="gp-banner">
          <strong>{due.length} follow-up{due.length === 1 ? '' : 's'} due:</strong>{' '}
          {due.slice(0, 5).map((t, i) => (
            <span key={t.threadId}>
              {i > 0 && ', '}
              <button
                type="button"
                class="gp-link"
                onClick={() => void ctx.sdk.Router.goto(ctx.sdk.Router.NativeRouteIDs.THREAD, { threadID: t.threadId })}
              >
                {t.contact?.name || t.contact?.email || t.subject}
              </button>
            </span>
          ))}
          {due.length > 5 && ` and ${due.length - 5} more`}
        </div>
      )}

      {mine.length === 0 && (
        <p class="gp-muted">
          Nothing here yet. Open any conversation and choose a stage in the {APP_NAME} side panel, or add people
          automatically when you send a mail merge.
        </p>
      )}

      <div class="gp-board">
        {stages.map((s) => {
          const items = sortThreads(inPlaybook.filter((t) => t.stageId === s.id), now);
          return (
            <section
              class={`gp-col ${dragOver === s.id ? 'gp-col-over' : ''}`}
              key={s.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(s.id);
              }}
              onDragLeave={() => setDragOver((cur) => (cur === s.id ? null : cur))}
              onDrop={(e) => drop(s.id, e)}
            >
              <header class="gp-col-head">
                <span class="gp-dot" style={{ background: s.color }} />
                <span>{s.name}</span>
                <span class="gp-count">{items.length}</span>
              </header>
              {items.map((t) => (
                <Card ctx={ctx} t={t} stages={stages} now={now} key={t.threadId} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
