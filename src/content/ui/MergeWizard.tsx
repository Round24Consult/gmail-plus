import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { parseRecipientCsv, toCsv, type ParsedRecipients } from '../../lib/csv';
import { stagesFor, templatesFor } from '../../lib/playbooks';
import { dayKey } from '../../lib/storage';
import { buildContext, render, renderHtml } from '../../lib/template';
import type { Campaign, StoreData } from '../../lib/types';
import { downloadText } from '../../shared/download';
import { store, useData } from '../../shared/live';
import { formatDate } from '../../shared/time';
import { myName, openSettings, type Ctx } from '../context';
import {
  activeRun,
  HEARTBEAT_STALE_MS,
  isBusy,
  missingFor,
  onRunChange,
  pauseActive,
  runCampaign,
  runningElsewhere,
  sendViaCompose,
  stopActive,
} from '../mergeRunner';

const MAX_ROWS = 2000;

function useRun() {
  const [, setTick] = useState(0);
  useEffect(() => onRunChange(() => setTick((n) => n + 1)), []);
  return activeRun();
}

function useClock(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function sentTodayFrom(data: StoreData, now: number): number {
  return data.sendCounter.date === dayKey(now) ? data.sendCounter.count : 0;
}

function start(ctx: Ctx, campaign: Campaign): void {
  runCampaign(ctx, campaign, { sendAnyway: campaign.sendAnyway ?? false, addToStageId: campaign.addToStageId ?? '' }).catch((err: unknown) =>
    ctx.sdk.ButterBar.showError({ text: err instanceof Error ? err.message : String(err), time: 8000 }),
  );
}

function downloadLog(c: Campaign): void {
  const rows = c.log.map((r) => ({ row: r.index + 1, email: r.email, status: r.status, detail: r.error ?? '', at: new Date(r.at).toISOString() }));
  downloadText(`mail-merge-log-${c.createdAt}.csv`, toCsv(['row', 'email', 'status', 'detail', 'at'], rows));
}

function counts(c: Campaign) {
  return {
    sent: c.log.filter((r) => r.status === 'sent').length,
    failed: c.log.filter((r) => r.status === 'failed').length,
    skipped: c.log.filter((r) => r.status === 'skipped').length,
  };
}

function RunPanel({ c, data }: { c: Campaign; data: StoreData }) {
  const run = useRun();
  const now = useClock(1000);
  const state = run?.campaignId === c.id ? run.state : null;
  const { sent, failed, skipped } = counts(c);
  const pct = c.rows.length ? Math.round((c.cursor / c.rows.length) * 100) : 0;
  const wait = state?.nextSendAt ? Math.max(0, Math.ceil((state.nextSendAt - now) / 1000)) : null;
  return (
    <div class="gp-card gp-run">
      <div class="gp-row gp-spread">
        <strong>{c.name}</strong>
        <span class="gp-muted">{c.cursor} of {c.rows.length}</span>
      </div>
      <div class="gp-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <p class="gp-small">
        {sent} sent · {failed} failed · {skipped} skipped · {sentTodayFrom(data, now)} of {data.settings.dailySendCap} sent today
        {wait !== null && ` · next in ${wait}s`}
      </p>
      <p class="gp-warn">Sending. Keep this Gmail tab open; other tabs and windows are fine.</p>
      <div class="gp-row">
        <button type="button" class="gp-btn" onClick={pauseActive}>Pause</button>
        <button type="button" class="gp-btn gp-btn-ghost gp-danger" onClick={stopActive}>Stop</button>
      </div>
    </div>
  );
}

function statusLabel(c: Campaign, now: number): string {
  if (runningElsewhere(c, now)) return 'Running in another tab';
  if (c.status === 'running' && activeRun()?.campaignId !== c.id && (c.heartbeatAt === null || now - c.heartbeatAt >= HEARTBEAT_STALE_MS)) {
    return 'Interrupted';
  }
  return { draft: 'Not started', running: 'Running', paused: 'Paused', stopped: 'Stopped', capped: 'Daily limit reached', done: 'Finished' }[c.status];
}

function PastCampaigns({ ctx, data }: { ctx: Ctx; data: StoreData }) {
  const run = useRun();
  const now = useClock(5000);
  const list = data.campaigns.filter((c) => c.account === ctx.account);
  if (!list.length) return null;
  return (
    <section class="gp-section">
      <h2 class="gp-h2">Previous merges</h2>
      <table class="gp-table">
        <thead>
          <tr><th>Merge</th><th>Status</th><th>Progress</th><th /></tr>
        </thead>
        <tbody>
          {list.map((c) => {
            const { sent, failed, skipped } = counts(c);
            const label = statusLabel(c, now);
            const resumable = !run && !isBusy() && c.cursor < c.rows.length && !runningElsewhere(c, now) && ['paused', 'capped', 'running', 'draft'].includes(c.status);
            const deletable = run?.campaignId !== c.id && !runningElsewhere(c, now);
            return (
              <tr key={c.id}>
                <td>
                  <div>{c.name}</div>
                  <div class="gp-muted gp-small">{formatDate(c.createdAt)} · “{c.subject}”</div>
                </td>
                <td>{label}</td>
                <td class="gp-small">{sent} sent, {failed} failed, {skipped} skipped of {c.rows.length}</td>
                <td>
                  <div class="gp-row gp-end">
                    {resumable && <button type="button" class="gp-btn" onClick={() => start(ctx, c)}>Resume</button>}
                    {c.log.length > 0 && <button type="button" class="gp-btn gp-btn-ghost" onClick={() => downloadLog(c)}>Log</button>}
                    {deletable && (
                      <button type="button" class="gp-btn gp-btn-ghost gp-danger" onClick={() => void store.deleteCampaign(c.id)}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function NewMerge({ ctx, data }: { ctx: Ctx; data: StoreData }) {
  const [fileName, setFileName] = useState('');
  const [pasted, setPasted] = useState('');
  const [parsed, setParsed] = useState<ParsedRecipients | null>(null);
  const [parseError, setParseError] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(0);
  const [sendAnyway, setSendAnyway] = useState(false);
  const [stageId, setStageId] = useState('');
  const [consent, setConsent] = useState(false);
  const [testing, setTesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const me = myName(ctx);
  const now = Date.now();

  const load = (text: string, name: string) => {
    const result = parseRecipientCsv(text);
    if (!result.emailColumn) {
      setParsed(null);
      setParseError('No email column found. Add a column called "email".');
      return;
    }
    if (result.rows.length > MAX_ROWS) {
      setParsed(null);
      setParseError(`That list has ${result.rows.length} recipients. Split it into lists of up to ${MAX_ROWS}.`);
      return;
    }
    setParseError('');
    setParsed(result);
    setFileName(name);
    setPreview(0);
  };

  const templates = templatesFor(data.templates, data.settings.playbooks);
  const stages = stagesFor(data.stages, data.settings.playbooks);
  const rows = parsed?.rows ?? [];
  const row = rows[Math.min(preview, Math.max(rows.length - 1, 0))];
  const rendered = row ? { vars: buildContext(row, { myName: me }) } : null;
  const missingRows = useMemo(
    () => (subject || body ? rows.filter((r) => missingFor({ subject, body }, r, me).length > 0).length : 0),
    [rows, subject, body, me],
  );
  const toSend = sendAnyway ? rows.length : rows.length - missingRows;
  const sentToday = sentTodayFrom(data, now);
  const capLeft = Math.max(0, data.settings.dailySendCap - sentToday);
  const todayBatch = Math.min(toSend, capLeft);
  const minutes = Math.ceil((Math.max(todayBatch - 1, 0) * data.settings.sendIntervalSec) / 60);
  const ready = rows.length > 0 && subject.trim() !== '' && body.trim() !== '' && toSend > 0 && consent && capLeft > 0 && !starting && !isBusy();

  const insertToken = (header: string) => {
    const el = bodyRef.current;
    const token = `{{${header}}}`;
    if (!el) return setBody(body + token);
    const at = el.selectionStart ?? body.length;
    const next = body.slice(0, at) + token + body.slice(el.selectionEnd ?? at);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = at + token.length;
    });
  };

  const sendTest = async () => {
    if (!row) return;
    setTesting(true);
    try {
      const vars = buildContext(row, { myName: me });
      await sendViaCompose(ctx.sdk, ctx.account, `[Test] ${render(subject, vars).text}`, renderHtml(body, vars).html);
      await store.incrementSent(Date.now());
      ctx.sdk.ButterBar.showMessage({ text: `Test sent to ${ctx.account}.`, time: 4000 });
    } catch (err) {
      ctx.sdk.ButterBar.showError({ text: err instanceof Error ? err.message : String(err), time: 6000 });
    } finally {
      setTesting(false);
    }
  };

  const begin = async () => {
    if (!ready || !parsed || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    const campaign: Campaign = {
      id: crypto.randomUUID(),
      account: ctx.account,
      name: `${fileName || 'Pasted list'} (${rows.length})`,
      subject,
      body,
      rows,
      status: 'draft',
      cursor: 0,
      log: [],
      createdAt: Date.now(),
      heartbeatAt: null,
      sendAnyway,
      addToStageId: stageId,
    };
    try {
      await store.saveCampaign(campaign);
      start(ctx, campaign);
      setParsed(null);
      setFileName('');
      setPasted('');
      setConsent(false);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  };

  return (
    <>
      <section class="gp-section">
        <h2 class="gp-h2">1. Recipients</h2>
        <p class="gp-muted gp-small">A CSV with an email column. Other columns (name, company, role…) become variables.</p>
        <div class="gp-row">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) load(await file.text(), file.name);
              (e.target as HTMLInputElement).value = '';
            }}
          />
        </div>
        <details class="gp-small">
          <summary>Or paste a list</summary>
          <textarea class="gp-input" rows={4} placeholder={'email,name,company\nada@example.com,Ada Okafor,Acme'} value={pasted} onInput={(e) => setPasted((e.target as HTMLTextAreaElement).value)} />
          <button type="button" class="gp-btn" disabled={!pasted.trim()} onClick={() => load(pasted, 'Pasted list')}>Use this list</button>
        </details>
        {parseError && <p class="gp-error">{parseError}</p>}
        {parsed && (
          <p class="gp-small">
            <strong>{parsed.rows.length} recipients</strong> from {fileName}
            {parsed.duplicates > 0 && ` · ${parsed.duplicates} duplicates removed`}
            {parsed.invalid.length > 0 && ` · ${parsed.invalid.length} skipped (line ${parsed.invalid.slice(0, 5).map((i) => i.line).join(', ')}${parsed.invalid.length > 5 ? '…' : ''})`}
            {' · columns: '}{parsed.headers.join(', ')}
          </p>
        )}
      </section>

      <section class="gp-section">
        <h2 class="gp-h2">2. Message</h2>
        <div class="gp-row">
          <select
            class="gp-input"
            value=""
            onChange={(e) => {
              const t = templates.find((x) => x.id === (e.target as HTMLSelectElement).value);
              if (t) {
                setSubject(t.subject ?? subject);
                setBody(t.body);
              }
            }}
          >
            <option value="">Start from a template…</option>
            {templates.map((t) => <option value={t.id} key={t.id}>{t.emoji} {t.name}</option>)}
          </select>
        </div>
        <input class="gp-input" placeholder="Subject" value={subject} onInput={(e) => setSubject((e.target as HTMLInputElement).value)} />
        <textarea ref={bodyRef} class="gp-input gp-body" rows={9} placeholder="Message. Use {{firstName|there}} for a greeting with a fallback." value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} />
        <div class="gp-row gp-wrap gp-small">
          <span class="gp-muted">Insert:</span>
          {['firstName|there', 'myName', ...(parsed?.headers ?? [])].map((h) => (
            <button type="button" class="gp-chip" key={h} onClick={() => insertToken(h)}>{`{{${h}}}`}</button>
          ))}
        </div>
      </section>

      {row && rendered && (
        <section class="gp-section">
          <h2 class="gp-h2">3. Preview</h2>
          <div class="gp-row">
            <button type="button" class="gp-btn" disabled={preview <= 0} onClick={() => setPreview(preview - 1)}>‹</button>
            <span class="gp-small">{Math.min(preview, rows.length - 1) + 1} of {rows.length}</span>
            <button type="button" class="gp-btn" disabled={preview >= rows.length - 1} onClick={() => setPreview(preview + 1)}>›</button>
          </div>
          <div class="gp-preview">
            <div class="gp-small"><span class="gp-muted">To:</span> {row.email}</div>
            <div class="gp-small"><span class="gp-muted">Subject:</span> {render(subject, rendered.vars).text}</div>
            <div class="gp-preview-body" dangerouslySetInnerHTML={{ __html: renderHtml(body, rendered.vars).html }} />
          </div>
          {missingRows > 0 && (
            <div class="gp-warn">
              {missingRows} recipient{missingRows === 1 ? ' is' : 's are'} missing a value used in the message and will be skipped.
              <label class="gp-check">
                <input type="checkbox" checked={sendAnyway} onChange={(e) => setSendAnyway((e.target as HTMLInputElement).checked)} />
                Send to them anyway with the blanks left empty
              </label>
            </div>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <section class="gp-section">
          <h2 class="gp-h2">4. Send</h2>
          <label class="gp-field">
            <span class="gp-label">Add each sent conversation to the pipeline</span>
            <select class="gp-input" value={stageId} onChange={(e) => setStageId((e.target as HTMLSelectElement).value)}>
              <option value="">Don't add</option>
              {stages.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}
            </select>
          </label>
          <p class="gp-small">
            Sends {toSend} email{toSend === 1 ? '' : 's'} from <strong>{ctx.account}</strong>, one every {data.settings.sendIntervalSec}s, up to{' '}
            {data.settings.dailySendCap} a day ({sentToday} already sent today).
            {todayBatch > 0 && ` Today's batch of ${todayBatch} takes about ${minutes} min.`}
            {toSend > capLeft && ' The rest pause at the daily limit and resume when you press Resume tomorrow.'}{' '}
            <button type="button" class="gp-link" onClick={() => openSettings('sending')}>Change limits</button>
          </p>
          {capLeft === 0 && <p class="gp-error">Today's limit is used up. Raise it in settings or come back tomorrow.</p>}
          <label class="gp-check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent((e.target as HTMLInputElement).checked)} />
            These people know me or expect to hear from me.
          </label>
          <div class="gp-row">
            <button type="button" class="gp-btn" disabled={testing || !subject || !body} onClick={sendTest}>
              {testing ? 'Sending test…' : 'Send test to me'}
            </button>
            <button type="button" class="gp-btn gp-btn-primary" disabled={!ready} onClick={begin}>
              Start sending {toSend}
            </button>
          </div>
        </section>
      )}
    </>
  );
}

export function MergeWizard({ ctx }: { ctx: Ctx }) {
  const data = useData();
  const run = useRun();
  const running = run ? data.campaigns.find((c) => c.id === run.campaignId) : undefined;
  return (
    <div class="gp-root gp-page gp-narrow">
      <h1 class="gp-h1">Mail merge</h1>
      <p class="gp-muted">
        Personal emails to a list, sent one by one from your own Gmail. They appear in your Sent folder and replies come back
        as normal conversations.
      </p>
      {running ? <RunPanel c={running} data={data} /> : <NewMerge ctx={ctx} data={data} />}
      <PastCampaigns ctx={ctx} data={data} />
    </div>
  );
}
