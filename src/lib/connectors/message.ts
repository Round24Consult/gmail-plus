import { buildContext, render } from '../template';

/** "Re: Fwd: Project" → "Project", for {{subject}} in follow-up messages. */
export function cleanSubject(subject: string): string {
  return subject.replace(/^(?:\s*(?:re|fwd?|aw|wg|sv|tr)\s*:)+\s*/i, '').trim();
}

export interface Recipient {
  name?: string;
  email?: string;
  /** Subject of the email being followed up, for {{subject}}. */
  subject?: string;
}

/**
 * Fills a connector message (or a template body) for one person. Mail merge rows add their columns as
 * variables. Variables with no value and no fallback are left blank, because the user still sees and can
 * edit the text in the other app before sending.
 */
export function connectorMessage(template: string, who: Recipient, extras: { myName?: string; row?: Record<string, string> } = {}): string {
  const base: Record<string, string> = { ...(extras.row ?? {}) };
  if (who.name && !base.name) base.name = who.name;
  if (who.email && !base.email) base.email = who.email;
  const vars = buildContext(base, { myName: extras.myName });
  const subject = who.subject ? cleanSubject(who.subject) : '';
  if (subject && !vars.subject) vars.subject = subject;
  return render(template, vars).text.trim();
}
