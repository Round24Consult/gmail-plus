import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { isValidEmail } from '../../lib/csv';
import { mergePeople, parseAddressList, searchPeople, type Observed, type Person } from '../../lib/people';
import { playbookName, stagesFor } from '../../lib/playbooks';
import { buildContext } from '../../lib/template';
import type { StoreData } from '../../lib/types';
import { store } from '../../shared/live';
import { openSettings, type Ctx } from '../context';

export interface Picked {
  email: string;
  name: string;
}

/** Everyone this Gmail account knows about: the remembered address book, contact cards, the pipeline and earlier merges. */
export function knownPeople(data: StoreData, account: string, remembered: readonly Person[]): Person[] {
  const cards: Person[] = Object.values(data.contacts)
    .filter((c) => c.account === account)
    .map((c) => ({ email: c.email, name: c.name, seen: c.updatedAt, count: 1 }));
  const pipeline: Person[] = Object.values(data.threads).flatMap((t) =>
    t.account === account && t.contact ? [{ email: t.contact.email.toLowerCase(), name: t.contact.name, seen: t.updatedAt, count: 1 }] : [],
  );
  const merges: Person[] = data.campaigns
    .filter((c) => c.account === account)
    .flatMap((c) => c.rows.map((r) => ({ email: (r.email ?? '').toLowerCase(), name: buildContext(r).name ?? '', seen: c.createdAt, count: 1 })))
    .filter((p) => isValidEmail(p.email));
  return mergePeople(remembered, cards, pipeline, merges).filter((p) => p.email !== account);
}

/** Search-as-you-type recipient picker with chips, paste support and "everyone in a stage". */
export function RecipientPicker({ ctx, data, onUse }: { ctx: Ctx; data: StoreData; onUse: (people: Picked[]) => void }) {
  const [remembered, setRemembered] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = () => void store.getPeople(ctx.account).then(setRemembered, () => undefined);
  useEffect(reload, [ctx.account]);

  const known = useMemo(() => knownPeople(data, ctx.account, remembered), [data.contacts, data.threads, data.campaigns, remembered, ctx.account]);
  const pickedSet = useMemo(() => new Set(picked.map((p) => p.email.toLowerCase())), [picked]);
  const suggestions = useMemo(() => searchPeople(known, query, { limit: 8, exclude: pickedSet }), [known, query, pickedSet]);
  useEffect(() => setActive(0), [query]);

  const stages = stagesFor(data.stages, data.settings.playbooks);
  const multiplePlaybooks = new Set(stages.map((s) => s.playbookId)).size > 1;
  const stageMembers = (stageId: string): Observed[] =>
    Object.values(data.threads).flatMap((t) => (t.account === ctx.account && t.stageId === stageId && t.contact ? [{ email: t.contact.email, name: t.contact.name }] : []));

  /** Adds people not already picked. Returns how many were new. (One call per event, so `picked` is current.) */
  const add = (people: Observed[]): number => {
    const seen = new Set(picked.map((p) => p.email.toLowerCase()));
    const next = [...picked];
    for (const p of people) {
      const email = p.email.trim();
      const key = email.toLowerCase();
      if (seen.has(key) || key === ctx.account || !isValidEmail(email)) continue;
      seen.add(key);
      next.push({ email, name: p.name || known.find((k) => k.email === key)?.name || '' });
    }
    setPicked(next);
    return next.length - picked.length;
  };

  /** Adds every address in the typed text. Returns false when there was none. */
  const commitTyped = (): boolean => {
    const { people, invalid } = parseAddressList(query);
    if (!people.length) return false;
    add(people);
    setQuery('');
    setNote(invalid ? `${invalid} address${invalid === 1 ? ' was' : 'es were'} not valid and left out.` : '');
    return true;
  };

  const choose = (p: Person) => {
    add([p]);
    setQuery('');
    setNote('');
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // A full address typed in wins over a suggestion; otherwise take the highlighted suggestion.
      if (!(query.includes('@') && commitTyped()) && suggestions[active]) choose(suggestions[active]!);
    } else if ((e.key === ',' || e.key === ';' || e.key === 'Tab') && query.trim()) {
      if (commitTyped()) e.preventDefault();
    } else if (e.key === 'Backspace' && !query && picked.length) {
      setPicked((current) => current.slice(0, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text') ?? '';
    if (!/[,;\n\s]/.test(text.trim())) return; // a single address: let it land in the box
    const { people, invalid } = parseAddressList(text);
    if (!people.length) return;
    e.preventDefault();
    const added = add(people);
    setNote(`Added ${added} from the pasted text${invalid ? `; ${invalid} not valid` : ''}.`);
  };

  const listId = 'gp-picker-list';
  return (
    <div class="gp-picker">
      <div class="gp-picker-field">
        <div class="gp-picker-box" onClick={() => inputRef.current?.focus()}>
          {picked.map((p) => (
            <span class="gp-pill" key={p.email} title={p.email}>
              {p.name || p.email}
              <button
                type="button"
                class="gp-pill-x"
                aria-label={`Remove ${p.email}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setPicked((current) => current.filter((x) => x.email !== p.email));
                }}
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            class="gp-picker-input"
            role="combobox"
            aria-label="Search recipients"
            aria-autocomplete="list"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId}
            aria-activedescendant={open && suggestions[active] ? `gp-pick-${active}` : undefined}
            placeholder={picked.length ? 'Add more…' : 'Search by name or email, or paste addresses'}
            value={query}
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={() => {
              setOpen(true);
              reload();
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
        </div>
        {open && suggestions.length > 0 && (
          <ul id={listId} class="gp-picker-list" role="listbox">
            {suggestions.map((p, i) => (
              <li
                id={`gp-pick-${i}`}
                key={p.email}
                role="option"
                aria-selected={i === active}
                class={i === active ? 'gp-picker-on' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span class="gp-picker-name">{p.name || p.email}</span>
                {p.name && <span class="gp-muted gp-small"> {p.email}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {open && query.trim() && suggestions.length === 0 && (
        <p class="gp-muted gp-small">No match. Type the full address and press Enter to add it.</p>
      )}
      <div class="gp-row gp-wrap">
        {stages.length > 0 && (
          <select
            class="gp-input gp-picker-stage"
            value=""
            aria-label="Add everyone in a pipeline stage"
            onChange={(e) => {
              const id = (e.target as HTMLSelectElement).value;
              const members = stageMembers(id);
              const added = add(members);
              setNote(`Added ${added} from the pipeline${members.length > added ? ` (${members.length - added} already in the list)` : ''}.`);
            }}
          >
            <option value="">Add everyone in a pipeline stage…</option>
            {stages.map((s) => {
              const n = stageMembers(s.id).length;
              return (
                <option value={s.id} key={s.id} disabled={n === 0}>
                  {multiplePlaybooks ? `${playbookName(data.playbooks, s.playbookId)}: ` : ''}{s.name} ({n})
                </option>
              );
            })}
          </select>
        )}
        {note && <span class="gp-small gp-muted">{note}</span>}
      </div>
      <div class="gp-row">
        <button type="button" class="gp-btn gp-btn-primary" disabled={!picked.length} onClick={() => onUse(picked)}>
          Use {picked.length || ''} recipient{picked.length === 1 ? '' : 's'}
        </button>
        {picked.length > 0 && <button type="button" class="gp-btn gp-btn-ghost" onClick={() => setPicked([])}>Clear</button>}
      </div>
      <p class="gp-muted gp-small">
        Suggestions come from people in your conversations, sent emails, pipeline and earlier merges, remembered in this
        browser only ({known.length} so far).
        {!data.settings.rememberPeople && (
          <>
            {' '}Remembering new people is off.{' '}
            <button type="button" class="gp-link gp-small" onClick={() => openSettings('data')}>Settings</button>
          </>
        )}
      </p>
    </div>
  );
}
