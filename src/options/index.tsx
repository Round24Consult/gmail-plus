import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { APP_NAME } from '../config';
import { PLAYBOOKS, SEED_TEMPLATES } from '../lib/playbooks';
import { SEND_CAP_CEILING, SEND_INTERVAL_MAX_SEC, SEND_INTERVAL_MIN_SEC } from '../lib/storage';
import type { OwnerId, PlaybookId, Settings, StoreData, Template } from '../lib/types';
import { downloadText, todayStamp } from '../shared/download';
import { initLive, store, useData } from '../shared/live';

function Playbooks({ data }: { data: StoreData }) {
  const toggle = (id: PlaybookId, on: boolean) => {
    const next = on ? [...data.settings.playbooks, id] : data.settings.playbooks.filter((p) => p !== id);
    void store.saveSettings({ playbooks: PLAYBOOKS.map((p) => p.id).filter((p) => next.includes(p)) });
  };
  return (
    <section id="playbooks" class="gp-section">
      <h2 class="gp-h2">Playbooks</h2>
      <p class="gp-muted">Pick what you use Gmail for. Each playbook brings its own pipeline stages and reply templates.</p>
      <div class="gp-cards">
        {PLAYBOOKS.map((p) => (
          <label class={`gp-option ${data.settings.playbooks.includes(p.id) ? 'gp-option-on' : ''}`} key={p.id}>
            <input type="checkbox" checked={data.settings.playbooks.includes(p.id)} onChange={(e) => toggle(p.id, (e.target as HTMLInputElement).checked)} />
            <strong>{p.name}</strong>
            <span class="gp-muted gp-small">{p.blurb}</span>
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
          hint={`Up to ${SEND_CAP_CEILING}. Gmail allows about 500 a day on personal accounts, and your own sends count too.`}
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

const OWNER_LABEL: Record<OwnerId, string> = {
  freelancer: 'Freelancer / agency',
  recruiter: 'Recruiter',
  support: 'Shop / support',
  custom: 'My templates',
};

function TemplateForm({ initial, onSave, onCancel }: { initial: Template; onSave: (t: Template) => void; onCancel: () => void }) {
  const [t, setT] = useState(initial);
  const set = (patch: Partial<Template>) => setT({ ...t, ...patch });
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
        <select class="gp-input" aria-label="Group" value={t.playbookId} onChange={(e) => set({ playbookId: (e.target as HTMLSelectElement).value as OwnerId })}>
          {(Object.keys(OWNER_LABEL) as OwnerId[]).map((o) => <option value={o} key={o}>{OWNER_LABEL[o]}</option>)}
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
  const missingSeeds = SEED_TEMPLATES.filter((s) => !data.templates.some((t) => t.id === s.id));
  const owners = Object.keys(OWNER_LABEL) as OwnerId[];

  return (
    <section id="templates" class="gp-section">
      <div class="gp-row gp-spread">
        <h2 class="gp-h2">Templates</h2>
        <button
          type="button"
          class="gp-btn gp-btn-primary"
          onClick={() => setEditing({ id: crypto.randomUUID(), name: '', emoji: '⭐', body: 'Hi {{firstName|there}},\n\n\n\n{{myName}}', playbookId: 'custom' })}
        >
          New template
        </button>
      </div>
      <p class="gp-muted">Templates from switched-off playbooks stay here but are hidden in Gmail.</p>
      {editing && !data.templates.some((t) => t.id === editing.id) && <TemplateForm initial={editing} onSave={save} onCancel={() => setEditing(null)} />}
      {owners.map((o) => {
        const list = data.templates.filter((t) => t.playbookId === o);
        if (!list.length) return null;
        const off = o !== 'custom' && !data.settings.playbooks.includes(o);
        return (
          <div key={o}>
            <h3 class="gp-h3">{OWNER_LABEL[o]}{off && <span class="gp-muted"> (off)</span>}</h3>
            {list.map((t) =>
              editing?.id === t.id ? (
                <TemplateForm key={t.id} initial={t} onSave={save} onCancel={() => setEditing(null)} />
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

function DataSection() {
  const [message, setMessage] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <section id="data" class="gp-section">
      <h2 class="gp-h2">Your data</h2>
      <p class="gp-muted">
        Everything {APP_NAME} saves (settings, templates, pipeline, follow-ups and mail merge lists) stays in this browser. A
        backup file moves it to another computer.
      </p>
      <div class="gp-row gp-wrap">
        <button type="button" class="gp-btn" onClick={async () => downloadText(`gmail-plus-backup-${todayStamp()}.json`, await store.exportBackup(), 'application/json')}>
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
                setMessage(err instanceof Error ? err.message : String(err));
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

function Privacy() {
  return (
    <section id="privacy" class="gp-section">
      <h2 class="gp-h2">Privacy</h2>
      <p class="gp-small">
        {APP_NAME} works inside the Gmail page you already have open. It does not connect to any server, does not use the Gmail
        API, and does not send your emails, contacts or lists anywhere. InboxSDK's optional error and usage reporting is switched
        off. Mail merge emails go out through your own Gmail compose window, exactly as if you had sent them yourself.
      </p>
    </section>
  );
}

function App() {
  const data = useData();
  useEffect(() => {
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
        <a href="#you">You</a>
        <a href="#sending">Limits</a>
        <a href="#templates">Templates</a>
        <a href="#data">Data</a>
        <a href="#privacy">Privacy</a>
      </nav>
      <Playbooks data={data} />
      <General settings={data.settings} />
      <Templates data={data} />
      <DataSection />
      <Privacy />
    </main>
  );
}

void initLive().then(() => render(<App />, document.getElementById('app')!));
