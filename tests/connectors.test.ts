import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADDRESS_KINDS } from '../src/lib/connectors/addresses';
import { whatsapp } from '../src/lib/connectors/catalog/whatsapp';
import { cleanSubject, connectorMessage } from '../src/lib/connectors/message';
import { countryOptions, formatPhone, normalizePhone } from '../src/lib/connectors/phone';
import {
  addressKindOf,
  addressKindsFor,
  ALL_CONNECTORS,
  buildLink,
  clampText,
  CONNECTORS,
  connectorsFor,
  enabledConnectors,
  getConnector,
  targetFor,
} from '../src/lib/connectors/registry';
import { addressColumn, handlesFromRow } from '../src/lib/connectors/rows';
import { MAX_CONNECTOR_MESSAGE, type LinkConnector } from '../src/lib/connectors/types';

const UK = '+447911123456';

describe('normalizePhone', () => {
  it.each([
    ['+44 7911 123456', ''],
    ['+44 (0)7911-123456', ''],
    ['0044 7911 123456', ''],
    ['tel:+447911123456', ''],
    ["'+447911123456", ''], // spreadsheet text marker, also what our own CSV export writes
    ['07911 123456', 'GB'],
    ['7911 123456', 'GB'],
    ['447911123456', ''], // the "+" dropped by a spreadsheet
    ['447911123456', 'GB'],
    ['447911123456', 'US'],
  ])('reads %j (default country %j) as the UK number', (raw, country) => {
    expect(normalizePhone(raw, country)).toEqual({ ok: true, value: UK });
  });

  it('uses the default country for local numbers in other countries', () => {
    expect(normalizePhone('0803 123 4567', 'NG')).toEqual({ ok: true, value: '+2348031234567' });
    expect(normalizePhone('(202) 555-0123', 'US')).toEqual({ ok: true, value: '+12025550123' });
    expect(normalizePhone('9123456789', 'IN')).toEqual({ ok: true, value: '+919123456789' });
  });

  it('reads digits that start with the default country code as international where a local reading is also valid', () => {
    expect(normalizePhone('4917612345678', 'DE')).toEqual({ ok: true, value: '+4917612345678' });
    expect(normalizePhone('4917612345678', '')).toEqual({ ok: true, value: '+4917612345678' });
    expect(normalizePhone('017612345678', 'DE')).toEqual({ ok: true, value: '+4917612345678' });
    expect(normalizePhone('38343201234', 'XK')).toEqual({ ok: true, value: '+38343201234' });
  });

  it('asks for a country code when a local number has no default country', () => {
    const result = normalizePhone('07911 123456');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/country code/);
  });

  it.each(['', '   ', 'call me', '12', '+44 7700 900123', '+999 1234 5678'])('rejects %j', (raw) => {
    expect(normalizePhone(raw, 'GB').ok).toBe(false);
  });

  it('ignores an unknown default country instead of failing', () => {
    expect(normalizePhone('+44 7911 123456', 'ZZ')).toEqual({ ok: true, value: UK });
  });
});

describe('phone helpers', () => {
  it('formats stored numbers for people', () => {
    expect(formatPhone(UK)).toBe('+44 7911 123456');
    expect(formatPhone('not a number')).toBe('not a number');
  });

  it('lists countries with names and calling codes', () => {
    const list = countryOptions('en');
    expect(list.length).toBeGreaterThan(200);
    expect(list.find((c) => c.code === 'NG')).toEqual({ code: 'NG', name: 'Nigeria', callingCode: '234' });
  });
});

describe('WhatsApp connector', () => {
  const [web, link] = whatsapp.targets;

  it('builds click-to-chat links with the digits of the number and the encoded message', () => {
    expect(web!.build(UK, 'Hi Ada & co,\nthanks 👋')).toBe(
      'https://web.whatsapp.com/send?phone=447911123456&text=Hi%20Ada%20%26%20co%2C%0Athanks%20%F0%9F%91%8B',
    );
    expect(link!.build(UK, 'Hi')).toBe('https://wa.me/447911123456?text=Hi');
  });

  it('leaves the text out when there is none', () => {
    expect(web!.build(UK, '')).toBe('https://web.whatsapp.com/send?phone=447911123456');
    expect(link!.build(UK, '')).toBe('https://wa.me/447911123456');
  });

  it('opens WhatsApp Web unless the user chose another target', () => {
    expect(targetFor(whatsapp, { targets: {} }).id).toBe('web');
    expect(targetFor(whatsapp, { targets: { whatsapp: 'link' } }).id).toBe('link');
    expect(targetFor(whatsapp, { targets: { whatsapp: 'gone' } }).id).toBe('web');
  });
});

describe('buildLink', () => {
  const evil: LinkConnector = {
    ...whatsapp,
    id: 'evil',
    targets: [{ id: 'web', label: 'x', hint: '', build: () => 'https://evil.example/steal' }],
  };
  const plain: LinkConnector = {
    ...whatsapp,
    id: 'plain',
    targets: [{ id: 'web', label: 'x', hint: '', build: () => 'http://wa.me/1' }],
  };

  it('returns the built link for the connector own hosts', () => {
    expect(buildLink(whatsapp, whatsapp.targets[1]!, UK, '  Hi  ')).toBe('https://wa.me/447911123456?text=Hi');
  });

  it('refuses links to other hosts or without HTTPS', () => {
    expect(() => buildLink(evil, evil.targets[0]!, UK, 'x')).toThrow(/not one of its own/);
    expect(() => buildLink(plain, plain.targets[0]!, UK, 'x')).toThrow(/not one of its own/);
  });

  it('cuts long messages to the connector limit without splitting emoji', () => {
    const short = { ...whatsapp, maxTextLength: 3 };
    expect(clampText(short, '👋👋👋👋')).toBe('👋👋👋');
    expect(clampText(short, 'abc')).toBe('abc');
  });
});

describe('registry', () => {
  it('registers every file in catalog/ under its own id, and nothing else', () => {
    const files = readdirSync(join(__dirname, '../src/lib/connectors/catalog')).filter((f) => f.endsWith('.ts')).map((f) => f.replace(/\.ts$/, ''));
    expect([...ALL_CONNECTORS.map((c) => c.id)].sort()).toEqual(files.sort());
  });

  it.each(ALL_CONNECTORS.map((c) => [c.id, c] as const))('%s is complete and safe', (_id, c) => {
    expect(ADDRESS_KINDS[c.address]).toBeDefined();
    expect(c.maxTextLength).toBeGreaterThan(0);
    expect(c.maxTextLength).toBeLessThanOrEqual(MAX_CONNECTOR_MESSAGE);
    expect(c.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(c.targets.length).toBeGreaterThan(0);
    expect(new Set(c.targets.map((t) => t.id)).size).toBe(c.targets.length);
    for (const t of c.targets) {
      const url = new URL(buildLink(c, t, UK, 'Hello'));
      expect(url.protocol).toBe('https:');
      expect(c.hosts).toContain(url.hostname);
    }
  });

  it('ships the configured connectors and lets users switch them off', () => {
    expect(CONNECTORS.map((c) => c.id)).toEqual(['whatsapp']);
    expect(getConnector('whatsapp')).toBe(whatsapp);
    expect(getConnector('nope')).toBeUndefined();
    expect(connectorsFor(['nope', 'whatsapp'])).toEqual([whatsapp]);
    expect(enabledConnectors({ disabled: [] })).toEqual([whatsapp]);
    expect(enabledConnectors({ disabled: ['whatsapp'] })).toEqual([]);
  });

  it('shares one address kind between connectors that need the same thing', () => {
    const sms = { ...whatsapp, id: 'sms' };
    expect(addressKindsFor([whatsapp, sms]).map((k) => k.id)).toEqual(['phone']);
    expect(() => addressKindOf({ ...whatsapp, address: 'pager' })).toThrow(/pager/);
  });
});

describe('mail merge rows', () => {
  it('finds the address column, preferring app-specific names', () => {
    expect(addressColumn(whatsapp, ['email', 'Mobile Number'])).toBe('Mobile Number');
    expect(addressColumn(whatsapp, ['email', 'Phone', 'WhatsApp'])).toBe('WhatsApp');
    expect(addressColumn(whatsapp, ['email', 'company'])).toBeNull();
  });

  it('collects valid addresses from a row, once per address kind', () => {
    const row = { email: 'ada@x.com', name: 'Ada Okafor', phone: '0803 123 4567' };
    expect(handlesFromRow(row, [whatsapp, { ...whatsapp, id: 'sms' }], 'NG')).toEqual([
      { email: 'ada@x.com', name: 'Ada Okafor', kind: 'phone', value: '+2348031234567' },
    ]);
    expect(handlesFromRow({ ...row, phone: 'n/a' }, [whatsapp], 'NG')).toEqual([]);
    expect(handlesFromRow({ ...row, phone: '' }, [whatsapp], 'NG')).toEqual([]);
    expect(handlesFromRow({ name: 'No email', phone: UK }, [whatsapp], '')).toEqual([]);
  });
});

describe('connector messages', () => {
  it('fills the default message with the person, the subject and my name', () => {
    const text = connectorMessage(
      'Hi {{firstName|there}}, following up on my email about {{subject|our conversation}}.\n\n{{myName}}',
      { name: 'Ada Okafor', email: 'ada@x.com', subject: 'Re: Fwd: Website quote' },
      { myName: 'Sam' },
    );
    expect(text).toBe('Hi Ada, following up on my email about Website quote.\n\nSam');
  });

  it('uses fallbacks, and mail merge columns as variables', () => {
    expect(connectorMessage('Hi {{firstName|there}} about {{subject|our chat}}', { email: 'info@shop.com' })).toBe('Hi there about our chat');
    expect(connectorMessage('{{company}}: {{firstName}}', { email: 'x@y.com' }, { row: { email: 'ada@x.com', 'First Name': 'Ada', Company: 'Acme' } })).toBe('Acme: Ada');
  });

  it('strips reply and forward prefixes from subjects', () => {
    expect(cleanSubject('RE: Fwd:  re:Quote')).toBe('Quote');
    expect(cleanSubject('Regarding the quote')).toBe('Regarding the quote');
  });
});
