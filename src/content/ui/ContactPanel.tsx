import type { ThreadView } from '@inboxsdk/core';
import { useState } from 'preact/hooks';
import { addressKindOf, addressKindsFor, enabledConnectors } from '../../lib/connectors/registry';
import { contactKey } from '../../lib/storage';
import { ConnectorIcon } from '../../shared/ConnectorIcon';
import { store, useData } from '../../shared/live';
import { timeAgo } from '../../shared/time';
import { openSettings, type Ctx } from '../context';
import { detectContact } from '../threadContact';
import { AddressField, ConnectorComposer } from './connectors';

/** Side panel in a conversation: the other person's saved addresses and a button per connector. */
export function ContactPanel({ ctx, threadView }: { ctx: Ctx; threadView: ThreadView }) {
  const data = useData();
  const [who] = useState(() => detectContact(threadView, ctx.account));
  const [composing, setComposing] = useState<string | null>(null);
  const settings = data.settings.connectors;
  const connectors = enabledConnectors(settings);

  if (!who) {
    return (
      <div class="gp-root gp-panel-body">
        <p class="gp-muted">There is no one else in this conversation yet.</p>
      </div>
    );
  }

  const card = data.contacts[contactKey(ctx.account, who.email)];
  const active = connectors.find((c) => c.id === composing);
  const activeAddress = active ? card?.handles[active.address] : undefined;

  return (
    <div class="gp-root gp-panel-body">
      <div class="gp-field">
        <div class="gp-label">Contact</div>
        <div><strong>{who.name || who.email}</strong></div>
        {who.name && <div class="gp-muted gp-small">{who.email}</div>}
      </div>

      {connectors.length === 0 ? (
        <p class="gp-muted gp-small">
          Every connector is switched off.{' '}
          <button type="button" class="gp-link" onClick={() => openSettings('connectors')}>Settings</button>
        </p>
      ) : (
        <>
          {addressKindsFor(connectors).map((kind) => (
            <AddressField
              key={kind.id}
              kind={kind}
              value={card?.handles[kind.id]}
              defaultCountry={settings.defaultCountry}
              onSave={(value) => store.setHandle(ctx.account, who, kind.id, value)}
            />
          ))}
          <div class="gp-field">
            <div class="gp-label">Message them on</div>
            <div class="gp-row">
              {connectors.map((c) => {
                const address = card?.handles[c.address];
                return (
                  <button
                    type="button"
                    key={c.id}
                    class={`gp-btn ${composing === c.id ? 'gp-btn-on' : ''}`}
                    disabled={!address}
                    aria-expanded={composing === c.id}
                    title={address ? `Write a ${c.name} message` : `Save their ${addressKindOf(c).label.toLowerCase()} first`}
                    onClick={() => setComposing(composing === c.id ? null : c.id)}
                  >
                    <ConnectorIcon connector={c} />
                    {c.name}
                  </button>
                );
              })}
            </div>
            {connectors.map((c) => {
              const at = card?.lastReached[c.id];
              return at ? <div class="gp-muted gp-small" key={c.id}>{c.name} opened {timeAgo(at)}</div> : null;
            })}
          </div>
          {active && activeAddress && (
            <ConnectorComposer
              key={active.id}
              ctx={ctx}
              connector={active}
              who={who}
              address={activeAddress}
              subject={threadView.getSubject()}
              onDone={() => setComposing(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
