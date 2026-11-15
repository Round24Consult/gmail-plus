import { useEffect, useState } from 'preact/hooks';
import { connectorMessage } from '../../lib/connectors/message';
import { addressKindOf, enabledConnectors } from '../../lib/connectors/registry';
import type { AddressKind, Connector } from '../../lib/connectors/types';
import { templatesFor } from '../../lib/playbooks';
import { contactKey } from '../../lib/storage';
import type { StoreData } from '../../lib/types';
import { ConnectorIcon } from '../../shared/ConnectorIcon';
import { useData } from '../../shared/live';
import { myName, type Ctx } from '../context';
import { defaultMessage, reachOut } from '../reach';

interface Person {
  email: string;
  name?: string;
}

/** Shows a saved address (a phone number…) with Edit, or a field to add one. */
export function AddressField({ kind, value, defaultCountry, onSave }: {
  kind: AddressKind;
  value: string | undefined;
  defaultCountry: string;
  onSave: (value: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(!value);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!value) setEditing(true);
  }, [value]);

  if (value && !editing) {
    return (
      <div class="gp-field">
        <div class="gp-label">{kind.label}</div>
        <div class="gp-row">
          <span>{kind.format(value)}</span>
          <button type="button" class="gp-link" onClick={() => {
            setText(kind.format(value));
            setEditing(true);
          }}>
            Edit
          </button>
        </div>
      </div>
    );
  }

  const save = async () => {
    const result = kind.normalize(text, { defaultCountry });
    if (!result.ok) return setError(result.error);
    setError('');
    await onSave(result.value);
    setText('');
    setEditing(false);
  };

  return (
    <form class="gp-field" onSubmit={(e) => {
      e.preventDefault();
      void save();
    }}>
      <label class="gp-label" for={`gp-address-${kind.id}`}>{kind.label}</label>
      <div class="gp-row gp-nowrap">
        <input
          id={`gp-address-${kind.id}`}
          class="gp-input"
          // Preact's types want one literal; all three are plain text inputs.
          type={kind.inputType as 'text'}
          placeholder={kind.placeholder}
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
        />
        <button type="submit" class="gp-btn" disabled={!text.trim()}>Save</button>
      </div>
      {error && <p class="gp-error gp-small">{error}</p>}
      {value && (
        <div class="gp-row">
          <button type="button" class="gp-link" onClick={() => {
            setError('');
            setEditing(false);
          }}>
            Cancel
          </button>
          <button type="button" class="gp-link gp-danger" onClick={() => void onSave(null)}>Remove</button>
        </div>
      )}
    </form>
  );
}

/** Message box for one connector: start from the default message or a template, edit, then open the app. */
export function ConnectorComposer({ ctx, connector, who, address, subject, onDone }: {
  ctx: Ctx;
  connector: Connector;
  who: Person;
  address: string;
  subject: string;
  onDone: () => void;
}) {
  const data = useData();
  const me = myName(ctx);
  const templates = templatesFor(data.templates, data.settings.playbooks);
  const [text, setText] = useState(() => defaultMessage(ctx, { ...who, subject }));
  const [busy, setBusy] = useState(false);
  const length = Array.from(text).length;
  const tooLong = length > connector.maxTextLength;

  const open = async () => {
    setBusy(true);
    const ok = await reachOut(ctx, connector, who, address, text);
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <div class="gp-card gp-composer">
      <div class="gp-label">{connector.name} message to {addressKindOf(connector).format(address)}</div>
      <select
        class="gp-input"
        value=""
        aria-label="Start from a template"
        onChange={(e) => {
          const t = templates.find((x) => x.id === (e.target as HTMLSelectElement).value);
          if (t) setText(connectorMessage(t.body, { ...who, subject }, { myName: me }));
        }}
      >
        <option value="">Start from a template…</option>
        {templates.map((t) => <option value={t.id} key={t.id}>{t.emoji} {t.name}</option>)}
      </select>
      <textarea class="gp-input" rows={6} aria-label="Message" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <div class={`gp-small ${tooLong ? 'gp-error' : 'gp-muted'}`}>{length} / {connector.maxTextLength}</div>
      <p class="gp-muted gp-small">{connector.name} opens with this message typed in. Check it, then press Send there.</p>
      <div class="gp-row">
        <button type="button" class="gp-btn gp-btn-primary" disabled={tooLong || busy} onClick={() => void open()}>
          Open {connector.name}
        </button>
        <button type="button" class="gp-btn gp-btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

/** Connectors this person can be reached on, given what is saved for them. */
export function reachableBy(data: StoreData, account: string, email: string): Array<{ connector: Connector; address: string }> {
  const card = data.contacts[contactKey(account, email)];
  if (!card) return [];
  return enabledConnectors(data.settings.connectors).flatMap((connector) => {
    const address = card.handles[connector.address];
    return address ? [{ connector, address }] : [];
  });
}

/** One button per connector that opens straight away with the default message. Renders nothing without a saved address. */
export function QuickReach({ ctx, data, who, subject, compact = false, onReached }: {
  ctx: Ctx;
  data: StoreData;
  who: Person;
  subject: string;
  compact?: boolean;
  onReached?: () => void;
}) {
  const options = reachableBy(data, ctx.account, who.email);
  if (!options.length) return null;
  const label = who.name || who.email;
  return (
    <span class="gp-row gp-quick-reach">
      {options.map(({ connector, address }) => (
        <button
          type="button"
          key={connector.id}
          class={compact ? 'gp-icon-btn' : 'gp-btn'}
          title={`Message ${label} on ${connector.name}`}
          aria-label={compact ? `Message ${label} on ${connector.name}` : undefined}
          onClick={async (e) => {
            e.stopPropagation();
            if (await reachOut(ctx, connector, who, address, defaultMessage(ctx, { ...who, subject }))) onReached?.();
          }}
        >
          <ConnectorIcon connector={connector} />
          {!compact && connector.name}
        </button>
      ))}
    </span>
  );
}
