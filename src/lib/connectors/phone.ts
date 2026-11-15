import { getCountries, getCountryCallingCode, isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import type { AddressKind, NormalizeResult } from './types';

export function isCountryCode(code: string): code is CountryCode {
  return /^[A-Z]{2}$/.test(code) && isSupportedCountry(code);
}

/**
 * Turns what people type or paste into an international (E.164) number such as +447911123456.
 *
 * - "+44 7911 123456", "0044 7911 123456" and "tel:+447911123456" are read as written.
 * - Without a country code, `defaultCountry` decides: "07911 123456" with GB gives +447911123456.
 * - Spreadsheets often drop the "+", so "447911123456" is accepted when it is a valid international number.
 */
export function normalizePhone(raw: string, defaultCountry = ''): NormalizeResult {
  const compact = raw
    .trim()
    .replace(/^'+/, '') // spreadsheet text marker
    .replace(/^tel:/i, '')
    .replace(/[\s().\-/]/g, ''); // \s also covers non-breaking spaces
  if (!compact) return { ok: false, error: 'Enter a phone number.' };
  const value = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  if (!/^\+?\d{4,17}$/.test(value)) return { ok: false, error: 'Use digits only, for example +44 7911 123456.' };

  const country = isCountryCode(defaultCountry) ? defaultCountry : undefined;
  // Digits without "+" or a leading 0 may be an international number whose "+" was lost.
  const maybeInternational = !value.startsWith('+') && !value.startsWith('0');
  const international = maybeInternational ? parsePhoneNumberFromString(`+${value}`) : undefined;
  // When they start with the default country's own code, read them as international first: in some countries
  // (Germany, Kosovo) "4917612345678" is also a valid local number, and the local reading would be wrong.
  if (international?.isValid() && (!country || value.startsWith(getCountryCallingCode(country)))) {
    return { ok: true, value: international.number };
  }

  const parsed = parsePhoneNumberFromString(value, country);
  if (parsed?.isValid()) return { ok: true, value: parsed.number };
  if (international?.isValid()) return { ok: true, value: international.number };
  if (!value.startsWith('+') && !country) {
    return { ok: false, error: 'Add the country code, for example +44 7911 123456, or choose a default country in Settings.' };
  }
  return { ok: false, error: 'That does not look like a valid phone number.' };
}

export function formatPhone(value: string): string {
  return parsePhoneNumberFromString(value)?.formatInternational() ?? value;
}

export interface CountryOption {
  code: string;
  name: string;
  callingCode: string;
}

/** Every country the phone library knows, named in the given locale and sorted by name. */
export function countryOptions(locale = 'en'): CountryOption[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale, 'en'], { type: 'region' });
  } catch {
    names = null;
  }
  return getCountries()
    .map((code) => ({ code, name: names?.of(code) ?? code, callingCode: getCountryCallingCode(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export const phone: AddressKind = {
  id: 'phone',
  label: 'Phone number',
  placeholder: '+44 7911 123456',
  inputType: 'tel',
  columns: [
    'phone', 'phonenumber', 'phoneno', 'mobile', 'mobilenumber', 'mobilephone', 'mobileno',
    'cell', 'cellphone', 'cellnumber', 'tel', 'telephone', 'telephonenumber',
  ],
  normalize: (raw, { defaultCountry }) => normalizePhone(raw, defaultCountry),
  format: formatPhone,
};
