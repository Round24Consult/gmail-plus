import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { APP_NAME, CONFIG } from '../config';
import { countryOptions } from '../lib/connectors/phone';
import { CONNECTORS, targetFor } from '../lib/connectors/registry';
import { MAX_CONNECTOR_MESSAGE } from '../lib/connectors/types';
import { makePlaybookId, playbookName, SEED_TEMPLATES } from '../lib/playbooks';
import { SEND_CAP_CEILING, SEND_INTERVAL_MAX_SEC, SEND_INTERVAL_MIN_SEC } from '../lib/storage';
import { CUSTOM_OWNER, type OwnerId, type Playbook, type PlaybookId, type Settings, type Stage, type StoreData, type Template } from '../lib/types';
import { ConnectorIcon } from '../shared/ConnectorIcon';
import { downloadText, todayStamp } from '../shared/download';
import { initLive, store, useData } from '../shared/live';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function Playbooks({ data }: { data: StoreData }) {
  const toggle = (id: PlaybookId, on: boolean) => {
    const next = on ? [...data.settings.playbooks, id] : data.settings.playbooks.filter((p) => p !== id);
    void store.saveSettings({ playbooks: data.playbooks.map((p) => p.id).filter((p) => next.includes(p)) });
  };
  return (
    <section id="playbooks" class="gp-section">
      <h2 class="gp-h2">Playbooks</h2>
      <p class="gp-muted">Pick what you use Gmail for. Each playbook brings its own pipeline stages and reply templates.</p>
      <div class="gp-cards">
        {data.playbooks.map((p) => (
          <label class={`gp-option ${data.settings.playbooks.includes(p.id) ? 'gp-option-on' : ''}`} key={p.id}>
            <input type="checkbox" checked={data.settings.playbooks.includes(p.id)} onChange={(e) => toggle(p.id, (e.target as HTMLInputElement).checked)} />
            <strong>{p.name}</strong>
            {p.blurb && <span class="gp-muted gp-small">{p.blurb}</span>}
          </label>
        ))}
      </div>
      {!data.settings.onboarded && (
        <button
          type="button"
          class="gp-btn gp-btn-primary"
          disabled={data.settings.playbooks.length === 0}
          onClick={async () => {
            await store.saveSettings({ onboarded: true });
            void chrome.tabs.create({ url: 'https://mail.google.com/' });
          }}
        >
          Done, open Gmail
        </button>
      )}
    </section>
  );
}

function TextField({ value, onSave, label, placeholder }: { value: string; onSave: (v: string) => void; label: string; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      class="gp-input"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onInput={(e) => setText((e.target as HTMLInputElement).value)}
      onBlur={() => text.trim() && text !== value && onSave(text.trim())}
    />
  );
}

function StageRow({ stage, siblings, count, isFirst, isLast, onChange, onMove, onError }: {
  stage: Stage;
  siblings: Stage[];
  count: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<Stage>) => void;
  onMove: (dir: -1 | 1) => void;
  onError: (msg: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  const others = siblings.filter((s) => s.id !== stage.id);
  const remove = async () => {
    try {
      await store.deleteStage(stage.id, count ? moveTo : undefined);
      setDeleting(false);
    } catch (err) {
      onError(errorText(err));
    }
  };
  return (
    <div class="gp-stage-row">
      <input type="color" class="gp-color" aria-label="Colour" value={stage.color} onChange={(e) => onChange({ color: (e.target as HTMLInputElement).value })} />
      <TextField label="Stage name" value={stage.name} onSave={(name) => onChange({ name })} />
      <label class="gp-check gp-small" title="Closed stages (won, lost, done) don't count as open work">
        <input type="checkbox" checked={!!stage.closed} onChange={(e) => onChange({ closed: (e.target as HTMLInputElement).checked || undefined })} />
        Closed
      </label>
      <span class="gp-muted gp-small gp-stage-count">{count} tracked</span>
      <button type="button" class="gp-btn gp-btn-ghost" aria-label="Move up" disabled={isFirst} onClick={() => onMove(-1)}>↑</button>
      <button type="button" class="gp-btn gp-btn-ghost" aria-label="Move down" disabled={isLast} onClick={() => onMove(1)}>↓</button>
      {!deleting ? (
        <button type="button" class="gp-btn gp-btn-ghost gp-danger" disabled={!others.length} onClick={() => (count ? setDeleting(true) : void remove())}>
          Delete
        </button>
      ) : (
        <span class="gp-row">
          <select class="gp-input" value={moveTo} onChange={(e) => setMoveTo((e.target as HTMLSelectElement).value)}>
            <option value="">Move {count} to…</option>
            {others.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}
          </select>
          <button type="button" class="gp-btn gp-btn-danger" disabled={!moveTo} onClick={remove}>Move and delete</button>
          <button type="button" class="gp-btn gp-btn-ghost" onClick={() => setDeleting(false)}>Cancel</button>
        </span>
      )}
    </div>
  );
}

function PlaybookEditor({ data, playbook }: { data: StoreData; playbook: Playbook }) {
  const [error, setError] = useState('');
  const stages = data.stages.filter((s) => s.playbookId === playbook.id).sort((a, b) => a.order - b.order);
  const counts = new Map<string, number>();
  for (const t of Object.values(data.threads)) counts.set(t.stageId, (counts.get(t.stageId) ?? 0) + 1);
  const tracked = stages.reduce((n, s) => n + (counts.get(s.id) ?? 0), 0);

  const saveOwnStages = (next: Stage[]) => {
    const ordered = next.map((s, order) => ({ ...s, order }));
    void store.saveStages([...data.stages.filter((s) => s.playbookId !== playbook.id), ...ordered]);
  };
  const patchStage = (id: string, patch: Partial<Stage>) =>
    saveOwnStages(stages.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s, ...patch };
      if (!next.closed) delete next.closed;
      return next;
    }));
  const move = (index: number, dir: -1 | 1) => {
    const next = [...stages];
    const [item] = next.splice(index, 1);
    if (item) next.splice(index + dir, 0, item);
    saveOwnStages(next);
  };
  const addStage = () =>
    saveOwnStages([...stages, { id: `${playbook.id}:${crypto.randomUUID().slice(0, 8)}`, name: 'New stage', color: '#5f6368', order: stages.length, playbookId: playbook.id }]);
  const patchPlaybook = (patch: Partial<Playbook>) => void store.savePlaybooks(data.playbooks.map((p) => (p.id === playbook.id ? { ...p, ...patch } : p)));

  return (
    <details class="gp-card gp-pb">
      <summary class="gp-pb-head">
        <strong>{playbook.name}</strong>
        <span class="gp-muted gp-small">
          {stages.length} stages · {tracked} tracked{playbook.builtIn ? ' · built in' : ''}
          {!data.settings.playbooks.includes(playbook.id) && ' · off'}
        </span>
      </summary>
      <div class="gp-row gp-wrap">
        <TextField label="Playbook name" value={playbook.name} onSave={(name) => patchPlaybook({ name })} />
        <TextField label="Description" placeholder="Short description" value={playbook.blurb} onSave={(blurb) => patchPlaybook({ blurb })} />
      </div>
      <div class="gp-label">Stages, in pipeline order</div>
      {stages.map((s, i) => (
        <StageRow
          key={s.id}
          stage={s}
          siblings={stages}
          count={counts.get(s.id) ?? 0}
          isFirst={i === 0}
          isLast={i === stages.length - 1}
          onChange={(patch) => patchStage(s.id, patch)}
          onMove={(dir) => move(i, dir)}
          onError={setError}
        />
      ))}
      <div class="gp-row gp-spread">
        <button type="button" class="gp-btn" onClick={addStage}>Add stage</button>
        <button
          type="button"
          class="gp-btn gp-btn-ghost gp-danger"
          onClick={async () => {
            try {
              await store.deletePlaybook(playbook.id);
            } catch (err) {
              setError(errorText(err));
            }
          }}
        >
          Delete playbook
        </button>
      </div>
      {error && <p class="gp-error gp-small">{error}</p>}
    </details>
  );
}

function NewPlaybook({ data }: { data: StoreData }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [blurb, setBlurb] = useState('');
  const [error, setError] = useState('');
  if (!open) return <button type="button" class="gp-btn gp-btn-primary" onClick={() => setOpen(true)}>New playbook</button>;
  return (
    <form
      class="gp-card gp-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        try {
          await store.createPlaybook({ id: makePlaybookId(name, data.playbooks.map((p) => p.id)), name: name.trim(), blurb: blurb.trim() }, [
            { name: 'New', color: '#1a73e8' },
            { name: 'In progress', color: '#e37400' },
            { name: 'Done', color: '#188038', closed: true },
          ]);
          setOpen(false);
          setName('');
          setBlurb('');
        } catch (err) {
          setError(errorText(err));
        }
      }}
    >
      <input class="gp-input" placeholder="Name, e.g. Real estate" value={name} required onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      <input class="gp-input" placeholder="Short description (optional)" value={blurb} onInput={(e) => setBlurb((e.target as HTMLInputElement).value)} />
      <p class="gp-muted gp-small">It starts with three stages (New, In progress, Done) that you can rename, reorder and extend.</p>
      <div class="gp-row">
        <button type="submit" class="gp-btn gp-btn-primary">Create</button>
        <button type="button" class="gp-btn gp-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <p class="gp-error gp-small">{error}</p>}
    </form>
  );
}

function PlaybookManager({ data }: { data: StoreData }) {
  return (
    <section id="stages" class="gp-section">
      <div class="gp-row gp-spread">
        <h2 class="gp-h2">Playbooks and stages</h2>
        <NewPlaybook data={data} />
      </div>
      <p class="gp-muted">
        Rename playbooks, add or reorder stages, or create a playbook for your own kind of work. Deleting a playbook keeps its
        templates under My templates.
      </p>
      {data.playbooks.map((p) => <PlaybookEditor key={p.id} data={data} playbook={p} />)}
    </section>
  );
}

function NumberField({ label, value, min, max, onSave, hint }: {
  label: string;
  value: number;
  min: number;
  max: number;
  hint: string;
  onSave: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label class="gp-field">
      <span class="gp-label">{label}</span>
      <input
        class="gp-input gp-num"
        type="number"
        min={min}
        max={max}
        value={text}
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
        onBlur={() => onSave(Number(text))}
      />
      <span class="gp-muted gp-small">{hint}</span>
    </label>
  );
}

function General({ settings }: { settings: Settings }) {
  const [name, setName] = useState(settings.myName);
  useEffect(() => setName(settings.myName), [settings.myName]);
  return (
    <>
      <section id="you" class="gp-section">
        <h2 class="gp-h2">You</h2>
        <label class="gp-field">
          <span class="gp-label">Your name for {'{{myName}}'}</span>
          <input class="gp-input" value={name} placeholder="Defaults to your Google account name" onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={() => void store.saveSettings({ myName: name })} />
        </label>
      </section>
      <section id="sending" class="gp-section">
        <h2 class="gp-h2">Mail merge limits</h2>
        <NumberField
          label="Most emails per day"
          value={settings.dailySendCap}
          min={1}
          max={SEND_CAP_CEILING}
          hint={`1 to ${SEND_CAP_CEILING}. Gmail allows about 500 a day on personal accounts and 2,000 on Workspace, and your own sends count too.`}
          onSave={(n) => void store.saveSettings({ dailySendCap: n })}
        />
        <NumberField
          label="Seconds between emails"
          value={settings.sendIntervalSec}
          min={SEND_INTERVAL_MIN_SEC}
          max={SEND_INTERVAL_MAX_SEC}
          hint={`${SEND_INTERVAL_MIN_SEC} to ${SEND_INTERVAL_MAX_SEC}.`}
          onSave={(n) => void store.saveSettings({ sendIntervalSec: n })}
        />
      </section>
    </>
  );
}

function Connectors({ settings }: { settings: Settings }) {
  const s = settings.connectors;
  const [message, setMessage] = useState(s.message);
  useEffect(() => setMessage(s.message), [s.message]);
  const countries = useMemo(() => countryOptions(navigator.language), []);
  if (!CONNECTORS.length) return null;
  const save = (patch: Parameters<typeof store.saveConnectorSettings>[0]) => void store.saveConnectorSettings(patch);
  return (
    <section id="connectors" class="gp-section">
      <h2 class="gp-h2">Connectors</h2>
      <p class="gp-muted">
        Message your contacts on other apps from Gmail. {APP_NAME} opens the app with your message typed in, and you check it and
        press Send there. Nothing is sent for you, and no account or server is involved.
      </p>
      <div class="gp-cards">
        {CONNECTORS.map((c) => {
          const on = !s.disabled.includes(c.id);
          const target = targetFor(c, s);
          return (
            <div class={`gp-option ${on ? 'gp-option-on' : ''}`} key={c.id}>
              <label class="gp-check gp-flush">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => save({ disabled: (e.target as HTMLInputElement).checked ? s.disabled.filter((id) => id !== c.id) : [...s.disabled, c.id] })}
                />
                <ConnectorIcon connector={c} />
                <strong>{c.name}</strong>
              </label>
              <span class="gp-muted gp-small">{c.description}</span>
              {c.targets.length > 1 && (
                <label class="gp-field gp-flush">
                  <span class="gp-label">Open in</span>
                  <select class="gp-input" value={target.id} disabled={!on} onChange={(e) => save({ targets: { ...s.targets, [c.id]: (e.target as HTMLSelectElement).value } })}>
                    {c.targets.map((t) => <option value={t.id} key={t.id}>{t.label}</option>)}
                  </select>
                  <span class="gp-muted gp-small">{target.hint}</span>
                </label>
              )}
            </div>
          );
        })}
      </div>
      <label class="gp-field">
        <span class="gp-label">Default country for phone numbers</span>
        <select class="gp-input" value={s.defaultCountry} onChange={(e) => save({ defaultCountry: (e.target as HTMLSelectElement).value })}>
          <option value="">None: numbers need their country code (+44…)</option>
          {countries.map((c) => <option value={c.code} key={c.code}>{c.name} (+{c.callingCode})</option>)}
        </select>
        <span class="gp-muted gp-small">Used for numbers written without a country code, such as 07911 123456.</span>
      </label>
      <label class="gp-field">
        <span class="gp-label">Default message</span>
        <textarea
          class="gp-input"
          rows={4}
          maxLength={MAX_CONNECTOR_MESSAGE}
          value={message}
          onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
          onBlur={() => message !== s.message && save({ message })}
        />
        <span class="gp-muted gp-small">
          Variables: {'{{firstName|there}}'}, {'{{name}}'}, {'{{subject}}'} (the email you're following up), {'{{myName}}'}, and mail
          merge columns.{' '}
          {message !== CONFIG.connectors.defaultMessage && (
            <button type="button" class="gp-link gp-small" onClick={() => save({ message: CONFIG.connectors.defaultMessage })}>Reset</button>
          )}
        </span>
      </label>
      <label class="gp-check">
        <input type="checkbox" checked={s.offerAfterSend} onChange={(e) => save({ offerAfterSend: (e.target as HTMLInputElement).checked })} />
        After I email someone whose number is saved, offer to message them too
      </label>
    </section>
  );
}

function TemplateForm({ data, initial, onSave, onCancel }: { data: StoreData; initial: Template; onSave: (t: Template) => void; onCancel: () => void }) {
  const [t, setT] = useState(initial);
  const set = (patch: Partial<Template>) => setT({ ...t, ...patch });
  const owners: OwnerId[] = [...data.playbooks.map((p) => p.id), CUSTOM_OWNER];
  return (
    <form
      class="gp-card gp-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (t.name.trim() && t.body.trim()) onSave({ ...t, name: t.name.trim(), subject: t.subject?.trim() || undefined });
      }}
    >
      <div class="gp-row">
        <input class="gp-input gp-emoji" aria-label="Emoji" value={t.emoji} maxLength={4} onInput={(e) => set({ emoji: (e.target as HTMLInputElement).value })} />
        <input class="gp-input" aria-label="Name" placeholder="Name" value={t.name} onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} required />
        <select class="gp-input" aria-label="Group" value={t.playbookId} onChange={(e) => set({ playbookId: (e.target as HTMLSelectElement).value })}>
          {owners.map((o) => <option value={o} key={o}>{playbookName(data.playbooks, o)}</option>)}
        </select>
      </div>
      <input class="gp-input" placeholder="Subject for new emails and mail merge (optional)" value={t.subject ?? ''} onInput={(e) => set({ subject: (e.target as HTMLInputElement).value })} />
      <textarea class="gp-input" rows={7} value={t.body} required onInput={(e) => set({ body: (e.target as HTMLTextAreaElement).value })} />
      <p class="gp-muted gp-small">
        Variables: {'{{firstName|there}}'} (with a fallback), {'{{name}}'}, {'{{email}}'}, {'{{myName}}'}, and any mail merge column such as {'{{company}}'}.
      </p>
      <div class="gp-row">
        <button type="submit" class="gp-btn gp-btn-primary">Save</button>
        <button type="button" class="gp-btn gp-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function Templates({ data }: { data: StoreData }) {
  const [editing, setEditing] = useState<Template | null>(null);
  const save = (t: Template) => {
    const exists = data.templates.some((x) => x.id === t.id);
    void store.saveTemplates(exists ? data.templates.map((x) => (x.id === t.id ? t : x)) : [...data.templates, t]);
    setEditing(null);
  };
  const remove = (id: string) => void store.saveTemplates(data.templates.filter((x) => x.id !== id));
  const missingSeeds = SEED_TEMPLATES.filter((s) => data.playbooks.some((p) => p.id === s.playbookId) && !data.templates.some((t) => t.id === s.id));
  const owners: OwnerId[] = [...data.playbooks.map((p) => p.id), CUSTOM_OWNER];

  return (
    <section id="templates" class="gp-section">
      <div class="gp-row gp-spread">
        <h2 class="gp-h2">Templates</h2>
        <button
          type="button"
          class="gp-btn gp-btn-primary"
          onClick={() => setEditing({ id: crypto.randomUUID(), name: '', emoji: '⭐', body: 'Hi {{firstName|there}},\n\n\n\n{{myName}}', playbookId: CUSTOM_OWNER })}
        >
          New template
        </button>
      </div>
      <p class="gp-muted">Templates from switched-off playbooks stay here but are hidden in Gmail.</p>
      {editing && !data.templates.some((t) => t.id === editing.id) && <TemplateForm data={data} initial={editing} onSave={save} onCancel={() => setEditing(null)} />}
      {owners.map((o) => {
        const list = data.templates.filter((t) => t.playbookId === o);
        if (!list.length) return null;
        const off = o !== CUSTOM_OWNER && !data.settings.playbooks.includes(o);
        return (
          <div key={o}>
            <h3 class="gp-h3">{playbookName(data.playbooks, o)}{off && <span class="gp-muted"> (off)</span>}</h3>
            {list.map((t) =>
              editing?.id === t.id ? (
                <TemplateForm key={t.id} data={data} initial={t} onSave={save} onCancel={() => setEditing(null)} />
              ) : (
                <div class="gp-tpl" key={t.id}>
                  <span class="gp-menu-emoji" aria-hidden="true">{t.emoji}</span>
                  <div class="gp-tpl-text">
                    <strong>{t.name}</strong>
                    <div class="gp-muted gp-small">{t.body.replace(/\s+/g, ' ').slice(0, 110)}</div>
                  </div>
                  <button type="button" class="gp-btn gp-btn-ghost" onClick={() => setEditing(t)}>Edit</button>
                  <button type="button" class="gp-btn gp-btn-ghost gp-danger" onClick={() => remove(t.id)}>Delete</button>
                </div>
              ),
            )}
          </div>
        );
      })}
      {missingSeeds.length > 0 && (
        <button type="button" class="gp-link" onClick={() => void store.saveTemplates([...data.templates, ...missingSeeds.map((s) => ({ ...s }))])}>
          Restore {missingSeeds.length} deleted starter template{missingSeeds.length === 1 ? '' : 's'}
        </button>
      )}
    </section>
  );
}

function RememberPeople({ settings }: { settings: Settings }) {
  const [count, setCount] = useState<number | null>(null);
  const refresh = () => void store.countPeople().then(setCount, () => setCount(null));
  useEffect(refresh, []);
  return (
    <div class="gp-field">
      <label class="gp-check gp-flush">
        <input type="checkbox" checked={settings.rememberPeople} onChange={(e) => void store.saveSettings({ rememberPeople: (e.target as HTMLInputElement).checked })} />
        Remember names and addresses from my conversations and sent emails, to suggest mail merge recipients
      </label>
      <span class="gp-muted gp-small">
        {count === null ? '' : `${count} ${count === 1 ? 'person' : 'people'} remembered. `}
        {!!count && (
          <button type="button" class="gp-link gp-small" onClick={async () => {
            await store.forgetPeople();
            refresh();
          }}>
            Forget them
          </button>
        )}
      </span>
    </div>
  );
}

function DataSection({ settings }: { settings: Settings }) {
  const [message, setMessage] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <section id="data" class="gp-section">
      <h2 class="gp-h2">Your data</h2>
      <p class="gp-muted">
        Everything {APP_NAME} saves (settings, playbooks, templates, pipeline, follow-ups, contacts' phone numbers, remembered
        recipients and mail merge lists) stays in this browser. A backup file moves it to another computer.
      </p>
      <RememberPeople settings={settings} />
      <div class="gp-row gp-wrap">
        <button type="button" class="gp-btn" onClick={async () => downloadText(`${CONFIG.appSlug}-backup-${todayStamp()}.json`, await store.exportBackup(), 'application/json')}>
          Download backup
        </button>
        <label class="gp-btn">
          Restore from backup
          <input
            type="file"
            accept="application/json,.json"
            class="gp-hidden"
            onChange={async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              (e.target as HTMLInputElement).value = '';
              if (!file) return;
              try {
                await store.importBackup(await file.text());
                setMessage('Backup restored.');
              } catch (err) {
                setMessage(errorText(err));
              }
            }}
          />
        </label>
        {confirmClear ? (
          <>
            <button
              type="button"
              class="gp-btn gp-btn-danger"
              onClick={async () => {
                await chrome.storage.local.clear();
                await store.ensureInitialized();
                setConfirmClear(false);
                setMessage('All data cleared.');
              }}
            >
              Yes, delete everything
            </button>
            <button type="button" class="gp-btn gp-btn-ghost" onClick={() => setConfirmClear(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" class="gp-btn gp-btn-ghost gp-danger" onClick={() => setConfirmClear(true)}>Delete all data</button>
        )}
      </div>
      {message && <p class="gp-small">{message}</p>}
    </section>
  );
}

function About() {
  let version = '';
  try {
    version = chrome.runtime.getManifest().version;
  } catch {
    // not running as an extension page
  }
  return (
    <section id="privacy" class="gp-section">
      <h2 class="gp-h2">Privacy</h2>
      <p class="gp-small">
        {APP_NAME} works inside the Gmail page you already have open. It does not connect to any server, does not use the Gmail
        API, and does not send your emails, contacts or lists anywhere. InboxSDK's optional error and usage reporting is switched
        off. Mail merge emails go out through your own Gmail compose window, exactly as if you had sent them yourself.
        {CONNECTORS.length > 0 &&
          ` When you open a connector such as ${CONNECTORS[0]!.name}, your browser opens that app's own link with the number and message in it; ${APP_NAME} itself receives nothing.`}
        {CONFIG.privacyPolicyUrl && (
          <>
            {' '}
            <a href={CONFIG.privacyPolicyUrl} target="_blank" rel="noreferrer">Full privacy policy</a>.
          </>
        )}
      </p>
      <h2 class="gp-h2">About</h2>
      <p class="gp-small">
        {APP_NAME}
        {version && ` ${version}`}
        {CONFIG.homepageUrl && (
          <>
            {' · '}
            <a href={CONFIG.homepageUrl} target="_blank" rel="noreferrer">Source and docs</a>
          </>
        )}
        {CONFIG.supportEmail && (
          <>
            {' · '}
            <a href={`mailto:${CONFIG.supportEmail}`}>{CONFIG.supportEmail}</a>
          </>
        )}
      </p>
    </section>
  );
}

function App() {
  const data = useData();
  useEffect(() => {
    document.title = `${APP_NAME} settings`;
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  }, []);
  return (
    <main class="gp-root gp-page gp-narrow">
      <header class="gp-row gp-page-head">
        <img src="icons/48.png" alt="" width={32} height={32} />
        <h1 class="gp-h1">{APP_NAME} settings</h1>
      </header>
      <nav class="gp-row gp-wrap gp-small">
        <a href="#playbooks">Playbooks</a>
        <a href="#stages">Stages</a>
        <a href="#you">You</a>
        <a href="#sending">Limits</a>
        <a href="#templates">Templates</a>
        {CONNECTORS.length > 0 && <a href="#connectors">Connectors</a>}
        <a href="#data">Data</a>
        <a href="#privacy">Privacy</a>
      </nav>
      <Playbooks data={data} />
      <PlaybookManager data={data} />
      <General settings={data.settings} />
      <Templates data={data} />
      <Connectors settings={data.settings} />
      <DataSection settings={data.settings} />
      <About />
    </main>
  );
}

void initLive().then(() => render(<App />, document.getElementById('app')!));
