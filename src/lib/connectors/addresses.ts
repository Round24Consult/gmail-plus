import { phone } from './phone';
import type { AddressKind } from './types';

/**
 * Every way of reaching a person that connectors can use. Several connectors share one: WhatsApp, SMS and
 * Signal would all use `phone`. Add a kind here (for example a username) when a new connector needs it.
 */
export const ADDRESS_KINDS: Readonly<Record<string, AddressKind>> = {
  [phone.id]: phone,
};
