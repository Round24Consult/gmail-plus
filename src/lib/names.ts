const GENERIC_LOCAL_PARTS = new Set([
  'admin', 'billing', 'contact', 'enquiries', 'hello', 'help', 'hi', 'info', 'jobs', 'mail',
  'marketing', 'no-reply', 'noreply', 'office', 'orders', 'sales', 'support', 'team',
]);

function titleCase(word: string): string {
  if (!word) return word;
  const isMixed = word !== word.toLowerCase() && word !== word.toUpperCase();
  if (isMixed) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Best-effort first name for greetings. Returns '' when nothing sensible is found,
 * so templates can fall back with {{firstName|there}}.
 */
export function firstNameFrom(contact: { name?: string | null; email?: string | null }): string {
  const email = (contact.email ?? '').trim();
  let name = (contact.name ?? '').trim().replace(/^["']+|["']+$/g, '').trim();

  if (name && name.toLowerCase() !== email.toLowerCase() && !name.includes('@')) {
    // "Okafor, Ada" -> "Ada"
    if (name.includes(',')) {
      const after = name.split(',')[1]?.trim();
      if (after) name = after;
    }
    const first = name.split(/\s+/)[0] ?? '';
    const cleaned = first.replace(/[^\p{L}\p{M}'-]/gu, '');
    if (cleaned) return titleCase(cleaned);
  }

  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (!local || GENERIC_LOCAL_PARTS.has(local)) return '';
  // Only the first segment can be a first name: "j.smith" gives nothing rather than "Smith".
  const firstSegment = local.split(/[._+\-\d]+/).find(Boolean) ?? '';
  if (!/^\p{L}{2,}$/u.test(firstSegment) || GENERIC_LOCAL_PARTS.has(firstSegment)) return '';
  return titleCase(firstSegment);
}
