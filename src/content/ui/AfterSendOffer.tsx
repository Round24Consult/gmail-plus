import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Contact } from '../../lib/types';
import { store, useData } from '../../shared/live';
import type { Ctx } from '../context';
import { QuickReach } from './connectors';

const SHOW_MS = 30_000;
const AFTER_HOVER_MS = 10_000;

let host: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function close(): void {
  clearTimeout(timer);
  if (!host) return;
  render(null, host);
  host.remove();
  host = null;
}

function closeIn(ms: number): void {
  clearTimeout(timer);
  timer = setTimeout(close, ms);
}

function AfterSendOffer({ ctx, people, subject }: { ctx: Ctx; people: Contact[]; subject: string }) {
  const data = useData();
  const [done, setDone] = useState<string[]>([]);
  const left = people.filter((p) => !done.includes(p.email));
  useEffect(() => {
    if (!left.length) close();
  }, [left.length]);

  return (
    <div class="gp-root gp-toast" role="status" onMouseEnter={() => clearTimeout(timer)} onMouseLeave={() => closeIn(AFTER_HOVER_MS)}>
      <div class="gp-row gp-spread">
        <strong>Email sent. Message them too?</strong>
        <button type="button" class="gp-icon-btn" aria-label="Close" onClick={close}>✕</button>
      </div>
      {left.map((p) => (
        <div class="gp-toast-person" key={p.email}>
          <span class="gp-toast-name">{p.name || p.email}</span>
          <QuickReach ctx={ctx} data={data} who={p} subject={subject} onReached={() => setDone((d) => [...d, p.email])} />
        </div>
      ))}
      <button
        type="button"
        class="gp-link gp-small"
        onClick={() => {
          void store.saveConnectorSettings({ offerAfterSend: false });
          close();
        }}
      >
        Don't offer this again
      </button>
    </div>
  );
}

/** A small card at the bottom left offering to message the people just emailed. Replaces any earlier one. */
export function showAfterSendOffer(ctx: Ctx, people: Contact[], subject: string): void {
  close();
  host = document.createElement('div');
  document.body.appendChild(host);
  render(<AfterSendOffer ctx={ctx} people={people} subject={subject} />, host);
  closeIn(SHOW_MS);
}
