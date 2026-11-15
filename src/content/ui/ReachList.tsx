import { useMemo, useState } from 'preact/hooks';
import { connectorMessage } from '../../lib/connectors/message';
import { addressKindOf } from '../../lib/connectors/registry';
import { addressColumn } from '../../lib/connectors/rows';
import type { Connector, NormalizeResult } from '../../lib/connectors/types';
import { templatesFor } from '../../lib/playbooks';
import { contactKey } from '../../lib/storage';
import { buildContext, render } from '../../lib/template';
import type { Campaign } from '../../lib/types';
import { ConnectorIcon } from '../../shared/ConnectorIcon';
import { store, useData } from '../../shared/live';
import { timeAgo } from '../../shared/time';
import { myName, type Ctx } from '../context';
import { activeRun, runningElsewhere } from '../mergeRunner';
import { reachOut } from '../reach';

/** Connectors a merge can follow up on: those with an address column in its list. */
export function reachColumns(campaign: Campaign, connectors: readonly Connector[]): Array<{ connector: Connector; column: string }> {
  const headers = Object.keys(campaign.rows[0] ?? {});
  return connectors.flatMap((connector) => {
    const column = addressColumn(connector, headers);
    return column ? [{ connector, column }] : [];
  });
}

interface Item {
  index: number;
  row: Record<string, string>;
  email: string;
  name: string;
  /** The number saved on the contact, else the list's. null when neither has one. */
  address: NormalizeResult | null;
  /** True when the contact's saved number replaces a different (or missing, or invalid) one in the list. */
  updated: boolean;
}

/**
 * After a merge: one row per sent email with "Open" for its connector, plus "Open next" to work through the
 * list. Opened rows are remembered on the contact, so the list survives reloads and other tabs.
 */
export function ReachList({ ctx, campaign, connector, column, onClose }: {
  ctx: Ctx;
  campaign: Campaign;
  connector: Connector;
  column: string;
  onClose: () => void;
}) {
  const data = useData();
  const settings = data.settings.connectors;
  const kind = addressKindOf(connector);
  const me = myName(ctx);
  const templates = templatesFor(data.templates, data.settings.playbooks);
  const [message, setMessage] = useState(campaign.reachMessage ?? settings.message);
  const [busy, setBusy] = useState(false);

  const items = useMemo<Item[]>(() => {
    const sent = [...new Set(campaign.log.filter((r) => r.status === 'sent').map((r) => r.index))].sort((a, b) => a - b);
    return sent.flatMap((index) => {
      const row = campaign.rows[index];
      if (!row) return [];
      const email = row.email ?? '';
      const savedValue = data.contacts[contactKey(ctx.account, email)]?.handles[kind.id];
      const raw = row[column] ?? '';
      const vars = buildContext(row);
      const fromList = raw.trim() ? kind.normalize(raw, { defaultCountry: settings.defaultCountry }) : null;
      const address: NormalizeResult | null = savedValue ? { ok: true, value: savedValue } : fromList;
      const updated = !!savedValue && !(fromList?.ok && fromList.value === savedValue);
      return [{ index, row, email, name: vars.name ?? '', address, updated }];
    });
  }, [campaign.log, campaign.rows, column, kind, settings.defaultCountry, data.contacts, ctx.account]);

  const latest = data.campaigns.find((c) => c.id === campaign.id) ?? campaign;
  /** While a tab is sending this merge it saves the whole merge regularly, which would undo a message edit. */
  const sending = activeRun()?.campaignId === campaign.id || runningElsewhere(latest);

  const reachedAt = (it: Item) => data.contacts[contactKey(ctx.account, it.email)]?.lastReached[connector.id];
  const isDone = (it: Item) => (reachedAt(it) ?? 0) >= campaign.createdAt;
  const ready = items.filter((it) => it.address?.ok);
  const done = ready.filter(isDone).length;
  const next = ready.find((it) => !isDone(it));
  const noNumber = items.filter((it) => !it.address).length;
  const invalid = items.filter((it) => it.address && !it.address.ok).length;

  const textFor = (it: Item) => {
    const subject = render(campaign.subject, buildContext(it.row, { myName: me })).text;
    return connectorMessage(message, { name: it.name, email: it.email, subject }, { myName: me, row: it.row });
  };

  const open = async (it: Item) => {
    if (!it.address?.ok || busy) return;
    setBusy(true);
    try {
      await reachOut(ctx, connector, { email: it.email, name: it.name }, it.address.value, textFor(it));
    } finally {
      setBusy(false);
    }
  };

  /** Keeps the message with the merge. */
  const saveMessage = (text: string) => {
    if (!sending && text !== (latest.reachMessage ?? settings.message)) void store.saveCampaign({ ...latest, reachMessage: text });
  };

  return (
    <section class="gp-section gp-card gp-reach-list" aria-label={`${connector.name} follow-ups`}>
      <div class="gp-row gp-spread">
        <h2 class="gp-h2 gp-row">
          <ConnectorIcon connector={connector} size={22} />
          {connector.name} follow-ups: {campaign.name}
        </h2>
        <button type="button" class="gp-btn gp-btn-ghost" onClick={onClose}>Close</button>
      </div>
      <p class="gp-muted gp-small">
        Numbers come from the contact's saved number, else the "{column}" column. Each click opens {connector.name} with the
        message typed in, and you press Send there.
      </p>
      <div class="gp-row">
        <select
          class="gp-input"
          value=""
          aria-label="Start from a template"
          disabled={sending}
          onChange={(e) => {
            const t = templates.find((x) => x.id === (e.target as HTMLSelectElement).value);
            if (t) {
              setMessage(t.body);
              saveMessage(t.body);
            }
          }}
        >
          <option value="">Start from a template…</option>
          {templates.map((t) => <option value={t.id} key={t.id}>{t.emoji} {t.name}</option>)}
        </select>
      </div>
      <textarea
        class="gp-input"
        rows={4}
        aria-label="Message"
        value={message}
        readOnly={sending}
        onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
        onBlur={() => saveMessage(message)}
      />
      <p class="gp-muted gp-small">
        {sending
          ? 'You can change the message once this merge stops sending.'
          : <>Variables work: {'{{firstName|there}}'}, {'{{subject}}'}, {'{{myName}}'} and your list's columns.</>}
      </p>
      {next?.address?.ok && (
        <div class="gp-preview">
          <div class="gp-small"><span class="gp-muted">Next:</span> {next.name || next.email} · {kind.format(next.address.value)}</div>
          <div class="gp-preview-body gp-prewrap">{textFor(next)}</div>
        </div>
      )}
      <div class="gp-row gp-wrap">
        <button type="button" class="gp-btn gp-btn-primary" disabled={!next || busy} onClick={() => next && void open(next)}>
          {next ? `Open next (${ready.length - done} left)` : 'All done'}
        </button>
        <span class="gp-small gp-muted">
          {done} of {ready.length} opened
          {noNumber > 0 && ` · ${noNumber} without a number`}
          {invalid > 0 && ` · ${invalid} not valid`}
        </span>
      </div>
      {items.length === 0 ? (
        <p class="gp-muted">No emails sent yet.</p>
      ) : (
        <table class="gp-table">
          <thead>
            <tr><th>Recipient</th><th>{kind.label}</th><th /></tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const at = reachedAt(it);
              return (
                <tr key={it.index}>
                  <td>
                    <div>{it.name || it.email}</div>
                    {it.name && <div class="gp-muted gp-small">{it.email}</div>}
                  </td>
                  <td class="gp-small">
                    {!it.address ? <span class="gp-muted">None</span> : it.address.ok ? kind.format(it.address.value) : <span class="gp-error">{it.address.error}</span>}
                    {it.updated && <div class="gp-muted">Number from the contact, not the list</div>}
                  </td>
                  <td>
                    <div class="gp-row gp-end">
                      {at !== undefined && isDone(it) && <span class="gp-muted gp-small">Opened {timeAgo(at)}</span>}
                      {it.address?.ok && (
                        <button type="button" class="gp-btn gp-btn-ghost" disabled={busy} onClick={() => void open(it)}>
                          {isDone(it) ? 'Again' : 'Open'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
