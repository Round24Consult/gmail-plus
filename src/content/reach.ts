import { connectorMessage, type Recipient } from '../lib/connectors/message';
import type { Connector } from '../lib/connectors/types';
import { getData, store } from '../shared/live';
import { myName, openConnectorLink, type Ctx } from './context';

/** The user's default connector message for this person, with variables filled in. */
export function defaultMessage(ctx: Ctx, who: Recipient, row?: Record<string, string>): string {
  return connectorMessage(getData().settings.connectors.message, who, { myName: myName(ctx), row });
}

/**
 * Opens the connector for this person with the text ready, then records when. Every connector action in the
 * UI goes through here, so a future API delivery only needs a branch in the background worker.
 */
export async function reachOut(ctx: Ctx, connector: Connector, who: { email: string; name?: string }, address: string, text: string): Promise<boolean> {
  const reply = await openConnectorLink({ type: 'gp:open-connector', connectorId: connector.id, address, text });
  if (!reply.ok) {
    ctx.sdk.ButterBar.showError({ text: reply.error, time: 6000 });
    return false;
  }
  await store.markReached(ctx.account, who, connector.id);
  return true;
}
