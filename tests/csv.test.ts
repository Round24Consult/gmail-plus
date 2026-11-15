import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { isValidEmail, parseRecipientCsv, safeCell, toCsv } from '../src/lib/csv';

describe('parseRecipientCsv', () => {
  it('finds the email column by header name and keeps other columns', () => {
    const r = parseRecipientCsv('Name,Email Address,Company\nAda Okafor,ada@x.com,Acme\n');
    expect(r.emailColumn).toBe('Email Address');
    expect(r.headers).toEqual(['Name', 'Email Address', 'Company']);
    expect(r.rows).toEqual([{ Name: 'Ada Okafor', 'Email Address': 'ada@x.com', Company: 'Acme', email: 'ada@x.com' }]);
  });

  it('strips a UTF-8 BOM and handles CRLF, quotes and embedded commas', () => {
    const r = parseRecipientCsv('﻿email,company\r\n"ada@x.com","Acme, Inc."\r\n"bo@y.io","He said ""hi"""\r\n');
    expect(r.headers).toEqual(['email', 'company']);
    expect(r.rows.map((x) => x.company)).toEqual(['Acme, Inc.', 'He said "hi"']);
  });

  it('detects an unlabelled email column from its values', () => {
    const r = parseRecipientCsv('who,address\nAda,ada@x.com\nBo,bo@y.io\n');
    expect(r.emailColumn).toBe('address');
    expect(r.rows).toHaveLength(2);
  });

  it('reports invalid and missing emails with file line numbers', () => {
    const r = parseRecipientCsv('email,name\nada@x.com,Ada\nnot-an-email,Bad\n,Empty\nbo@y.io,Bo\n');
    expect(r.rows.map((x) => x.email)).toEqual(['ada@x.com', 'bo@y.io']);
    expect(r.invalid).toEqual([
      { line: 3, value: 'not-an-email', reason: 'invalid email' },
      { line: 4, value: '', reason: 'missing email' },
    ]);
  });

  it('removes duplicate emails case-insensitively and counts them', () => {
    const r = parseRecipientCsv('email\nAda@X.com\nada@x.com\n ada@x.com \nbo@y.io\n');
    expect(r.rows.map((x) => x.email)).toEqual(['Ada@X.com', 'bo@y.io']);
    expect(r.duplicates).toBe(2);
  });

  it('skips blank lines and tolerates short rows', () => {
    const r = parseRecipientCsv('email,name,company\n\nada@x.com\n   \nbo@y.io,Bo\n');
    expect(r.rows).toEqual([
      { email: 'ada@x.com', name: '', company: '' },
      { email: 'bo@y.io', name: 'Bo', company: '' },
    ]);
  });

  it('returns no email column for a file without one', () => {
    const r = parseRecipientCsv('name,city\nAda,Lagos\n');
    expect(r.emailColumn).toBeNull();
    expect(r.rows).toEqual([]);
    expect(r.invalid).toHaveLength(1);
  });

  it('returns nothing for an empty file', () => {
    expect(parseRecipientCsv('')).toMatchObject({ rows: [], invalid: [], duplicates: 0 });
  });
});

describe('isValidEmail', () => {
  it.each(['a@b.co', 'first.last+tag@sub.domain.org', ' ada@x.com '])('accepts %s', (v) => expect(isValidEmail(v)).toBe(true));
  it.each(['a@b', 'a@b.c', 'a b@c.com', 'a@b..com', '<a@b.com>', 'a,b@c.com', '@b.com'])('rejects %s', (v) => expect(isValidEmail(v)).toBe(false));
});

describe('toCsv', () => {
  it('round-trips through a CSV parser with quoting intact', () => {
    const csv = toCsv(['name', 'note'], [{ name: 'Ada, O.', note: 'said "hi"\nthen left' }, { name: 'Bo' }]);
    const back = Papa.parse<Record<string, string>>(csv, { header: true }).data;
    expect(back).toEqual([{ name: 'Ada, O.', note: 'said "hi"\nthen left' }, { name: 'Bo', note: '' }]);
  });

  it('neutralises formula-looking cells', () => {
    expect(safeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(safeCell('+234 801')).toBe(`'+234 801`);
    expect(safeCell('@home')).toBe(`'@home`);
    expect(safeCell('Ada')).toBe('Ada');
    expect(toCsv(['n'], [{ n: '-1+2' }])).toBe("n\r\n'-1+2");
  });
});
