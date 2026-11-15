import type { LinkConnector } from '../types';

/** A speech bubble, drawn in white on the connector colour. */
const CHAT_ICON = 'M12 3C7 3 3 6.6 3 11c0 2.1.9 4 2.4 5.4L4.5 21l4.6-1.9c.9.3 1.9.4 2.9.4 5 0 9-3.6 9-8s-4-8-9-8z';

/** WhatsApp wants the international number as digits only: 447911123456. */
const digits = (e164: string) => e164.replace(/\D/g, '');

function withText(url: string, text: string): string {
  if (!text) return url;
  return `${url}${url.includes('?') ? '&' : '?'}text=${encodeURIComponent(text)}`;
}

/**
 * WhatsApp click to chat (https://faq.whatsapp.com/5913398998672934): opens a chat with the number and the
 * message already typed in. The user presses Send, so this needs no WhatsApp Business account and stays
 * within WhatsApp's terms.
 */
export const whatsapp: LinkConnector = {
  id: 'whatsapp',
  name: 'WhatsApp',
  color: '#25D366',
  iconPath: CHAT_ICON,
  description: 'Opens a WhatsApp chat with your message typed in. You check it and press Send.',
  address: 'phone',
  columns: ['whatsapp', 'whatsappnumber', 'whatsappphone', 'wa', 'wanumber'],
  maxTextLength: 4000,
  delivery: 'link',
  hosts: ['web.whatsapp.com', 'wa.me'],
  targets: [
    {
      id: 'web',
      label: 'WhatsApp Web',
      hint: 'Opens in a browser tab, reused for each message. Link your phone to WhatsApp Web once.',
      build: (phone, text) => withText(`https://web.whatsapp.com/send?phone=${digits(phone)}`, text),
    },
    {
      id: 'link',
      label: 'Choose each time',
      hint: 'Opens wa.me, where you pick the WhatsApp desktop app or WhatsApp Web.',
      build: (phone, text) => withText(`https://wa.me/${digits(phone)}`, text),
    },
  ],
};
