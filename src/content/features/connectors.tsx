import { render } from 'preact';
import { CONNECTORS } from '../../lib/connectors/registry';
import type { Contact } from '../../lib/types';
import { getData } from '../../shared/live';
import { iconUrl, type Ctx } from '../context';
import { isAutomatedCompose, isBusy } from '../mergeRunner';
import { reachableBy } from '../ui/connectors';
import { showAfterSendOffer } from '../ui/AfterSendOffer';
import { ContactPanel } from '../ui/ContactPanel';

/** Most people listed in one after-send offer. */
const OFFER_LIMIT = 3;

/** The Contact side panel and the after-send offer. Does nothing when the build ships no connectors. */
export function registerConnectors(ctx: Ctx): void {
  if (!CONNECTORS.length) return;

  ctx.sdk.Conversations.registerThreadViewHandler((threadView) => {
    const el = document.createElement('div');
    threadView.addSidebarContentPanel({ title: 'Contact', iconUrl: iconUrl('contact'), el, orderHint: 1 });
    render(<ContactPanel ctx={ctx} threadView={threadView} />, el);
    threadView.once('destroy', () => render(null, el));
  });

  ctx.sdk.Compose.registerComposeViewHandler((cv) => {
    let recipients: Contact[] = [];
    let subject = '';
    // The compose window is gone by the time "sent" fires, so read it just before sending.
    cv.on('presending', () => {
      try {
        recipients = cv.getToRecipients().map((r) => ({ name: r.name ?? '', email: r.emailAddress }));
        subject = cv.getSubject();
      } catch {
        recipients = [];
      }
    });
    cv.on('sent', () => {
      if (isAutomatedCompose(cv) || isBusy()) return; // mail merge and test sends
      const data = getData();
      if (!data.settings.connectors.offerAfterSend) return;
      const people = recipients.filter((r) => reachableBy(data, ctx.account, r.email).length > 0).slice(0, OFFER_LIMIT);
      if (people.length) showAfterSendOffer(ctx, people, subject);
    });
  });
}
