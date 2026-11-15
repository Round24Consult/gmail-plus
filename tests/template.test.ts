import { describe, expect, it } from 'vitest';
import { firstNameFrom } from '../src/lib/names';
import { buildContext, escapeHtml, listVariables, normalizeKey, render, renderHtml, textToHtml } from '../src/lib/template';

describe('normalizeKey', () => {
  it('folds case, spaces, underscores and dashes', () => {
    expect(normalizeKey('First Name')).toBe('firstname');
    expect(normalizeKey('first_name')).toBe('firstname');
    expect(normalizeKey('firstName')).toBe('firstname');
    expect(normalizeKey('E-mail')).toBe('email');
  });
});

describe('render', () => {
  it('fills known variables regardless of key spelling', () => {
    const r = render('Hi {{ First Name }}, from {{my_name}}', { firstname: 'Ada', myname: 'Tunde' });
    expect(r).toEqual({ text: 'Hi Ada, from Tunde', missing: [] });
  });

  it('uses the fallback after a pipe when the value is missing or blank', () => {
    expect(render('Hi {{firstName|there}}', {}).text).toBe('Hi there');
    expect(render('Hi {{firstName | there}}', { firstname: '  ' }).text).toBe('Hi there');
    expect(render('Hi {{firstName|}}!', {}).text).toBe('Hi !');
  });

  it('reports missing variables once and blanks them', () => {
    const r = render('{{company}} and {{Company}} for {{role}}', {});
    expect(r.text).toBe(' and  for ');
    expect(r.missing.sort()).toEqual(['company', 'role']);
  });

  it('leaves text without variables and malformed braces alone', () => {
    expect(render('Price {100} and {{ }}', {}).text).toBe('Price {100} and {{ }}');
  });

  it('lists variables used in a template', () => {
    expect(listVariables('{{First Name|x}} {{email}} {{first_name}}').sort()).toEqual(['email', 'firstname']);
  });
});

describe('buildContext', () => {
  it('normalises row keys and derives first name from the name', () => {
    const ctx = buildContext({ 'Full Name': 'Ada Okafor', 'Email Address': 'ada@x.com', Company: 'Acme' }, { myName: 'Tunde' });
    expect(ctx).toMatchObject({ name: 'Ada Okafor', firstname: 'Ada', email: 'ada@x.com', company: 'Acme', myname: 'Tunde' });
  });

  it('derives first name from the email when there is no name', () => {
    expect(buildContext({ email: 'chidi.eze@x.com' }).firstname).toBe('Chidi');
  });

  it('keeps an explicit first name column', () => {
    expect(buildContext({ name: 'Ada Okafor', 'first name': 'Adaeze' }).firstname).toBe('Adaeze');
  });

  it('does not let a CSV column override the sender name when both exist', () => {
    expect(buildContext({ myname: 'From CSV' }, { myName: 'Settings' }).myname).toBe('From CSV');
  });
});

describe('html output', () => {
  it('escapes HTML in templates and values', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;');
    const { html } = renderHtml('Hi {{name}}\nBye', { name: '<script>x</script>' });
    expect(html).toBe('Hi &lt;script&gt;x&lt;/script&gt;<br>Bye');
  });

  it('turns all line ending styles into <br>', () => {
    expect(textToHtml('a\r\nb\rc\nd')).toBe('a<br>b<br>c<br>d');
  });
});

describe('firstNameFrom', () => {
  it.each([
    [{ name: 'Ada Okafor' }, 'Ada'],
    [{ name: 'okafor, ada' }, 'Ada'],
    [{ name: '"MARY ANN" Smith' }, 'Mary'],
    [{ name: 'McDonald Jones' }, 'McDonald'],
    [{ name: 'Zoë Lambert' }, 'Zoë'],
    [{ name: 'ada@x.com', email: 'ada@x.com' }, 'Ada'],
    [{ email: 'j.smith@x.com' }, ''],
    [{ email: 'john.smith@x.com' }, 'John'],
    [{ email: 'info@shop.com' }, ''],
    [{ email: 'support@shop.com', name: '' }, ''],
    [{ email: '12345@x.com' }, ''],
    [{}, ''],
  ])('%j -> %s', (input, expected) => {
    expect(firstNameFrom(input)).toBe(expected);
  });
});
