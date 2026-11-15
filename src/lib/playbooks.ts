import type { PlaybookId, Stage, Template } from './types';

export interface Playbook {
  id: PlaybookId;
  name: string;
  blurb: string;
}

export const PLAYBOOKS: readonly Playbook[] = [
  { id: 'freelancer', name: 'Freelancer / agency', blurb: 'Leads, proposals and client follow-ups.' },
  { id: 'recruiter', name: 'Recruiter', blurb: 'Candidate outreach, screening and interviews.' },
  { id: 'support', name: 'Shop / support', blurb: 'Customer questions, orders and quick replies.' },
];

export const PLAYBOOK_IDS: readonly PlaybookId[] = PLAYBOOKS.map((p) => p.id);

export function isPlaybookId(value: unknown): value is PlaybookId {
  return typeof value === 'string' && (PLAYBOOK_IDS as readonly string[]).includes(value);
}

function stages(playbookId: PlaybookId, list: Array<[id: string, name: string, color: string, closed?: boolean]>): Stage[] {
  return list.map(([id, name, color, closed], order) => ({
    id: `${playbookId}:${id}`,
    name,
    color,
    order,
    playbookId,
    ...(closed ? { closed: true } : {}),
  }));
}

export const SEED_STAGES: readonly Stage[] = [
  ...stages('freelancer', [
    ['lead', 'Lead', '#5f6368'],
    ['proposal', 'Proposal sent', '#1a73e8'],
    ['negotiating', 'Negotiating', '#e37400'],
    ['won', 'Won', '#188038', true],
    ['lost', 'Lost', '#c5221f', true],
  ]),
  ...stages('recruiter', [
    ['sourced', 'Sourced', '#5f6368'],
    ['contacted', 'Contacted', '#1a73e8'],
    ['screening', 'Screening', '#9334e6'],
    ['interview', 'Interview', '#e37400'],
    ['offer', 'Offer', '#007b83'],
    ['hired', 'Hired', '#188038', true],
    ['closed', 'Closed', '#c5221f', true],
  ]),
  ...stages('support', [
    ['new', 'New', '#1a73e8'],
    ['waiting', 'Waiting on customer', '#e37400'],
    ['resolved', 'Resolved', '#188038', true],
  ]),
];

export const SEED_TEMPLATES: readonly Template[] = [
  {
    id: 'freelancer:intro',
    playbookId: 'freelancer',
    emoji: '👋',
    name: 'Intro',
    subject: 'Your project',
    body: "Hi {{firstName|there}},\n\nThanks for reaching out. I'd love to hear more about the project. Could you share the scope, timeline and budget you have in mind?\n\nBest,\n{{myName}}",
  },
  {
    id: 'freelancer:proposal-follow-up',
    playbookId: 'freelancer',
    emoji: '📄',
    name: 'Proposal follow-up',
    subject: 'Following up on my proposal',
    body: "Hi {{firstName|there}},\n\nJust checking in on the proposal I sent. I'm happy to walk through it on a quick call or adjust anything that doesn't fit.\n\nBest,\n{{myName}}",
  },
  {
    id: 'freelancer:confirm',
    playbookId: 'freelancer',
    emoji: '✅',
    name: 'Confirm',
    body: "Hi {{firstName|there}},\n\nConfirmed, thank you. I'll get started and send you an update by the end of the week.\n\n{{myName}}",
  },
  {
    id: 'freelancer:invoice',
    playbookId: 'freelancer',
    emoji: '🧾',
    name: 'Invoice',
    subject: 'Invoice',
    body: 'Hi {{firstName|there}},\n\nPlease find the invoice for this milestone attached. Let me know if you need anything else to process it.\n\nThanks,\n{{myName}}',
  },
  {
    id: 'recruiter:outreach',
    playbookId: 'recruiter',
    emoji: '👋',
    name: 'Outreach',
    subject: 'A role you might like',
    body: "Hi {{firstName|there}},\n\nI came across your profile and think you could be a strong fit for a role I'm hiring for. Would you be open to a short call this week?\n\nBest,\n{{myName}}",
  },
  {
    id: 'recruiter:schedule',
    playbookId: 'recruiter',
    emoji: '📅',
    name: 'Schedule interview',
    subject: 'Interview times',
    body: 'Hi {{firstName|there}},\n\nThanks for your time so far. Could you share a few slots that work for an interview next week?\n\nBest,\n{{myName}}',
  },
  {
    id: 'recruiter:follow-up',
    playbookId: 'recruiter',
    emoji: '🔁',
    name: 'Follow up',
    body: "Hi {{firstName|there}},\n\nJust following up on my last note. If the timing isn't right, no problem at all, just let me know.\n\nBest,\n{{myName}}",
  },
  {
    id: 'recruiter:decline',
    playbookId: 'recruiter',
    emoji: '🙏',
    name: 'Not moving forward',
    body: "Hi {{firstName|there}},\n\nThank you for the time you put into the process. We've decided to move forward with other candidates for this role, but I'd be glad to keep in touch about future openings.\n\nBest wishes,\n{{myName}}",
  },
  {
    id: 'support:greeting',
    playbookId: 'support',
    emoji: '👋',
    name: 'Greeting',
    body: "Hi {{firstName|there}},\n\nThanks for getting in touch. We've received your message and will get back to you shortly.\n\n{{myName}}",
  },
  {
    id: 'support:order-status',
    playbookId: 'support',
    emoji: '📦',
    name: 'Order status',
    body: "Hi {{firstName|there}},\n\nYour order is on its way and should arrive within the next few days. I'll let you know if anything changes.\n\n{{myName}}",
  },
  {
    id: 'support:need-info',
    playbookId: 'support',
    emoji: '❓',
    name: 'Need more info',
    body: 'Hi {{firstName|there}},\n\nSo we can help, could you send your order number and a short description or photo of the issue?\n\nThanks,\n{{myName}}',
  },
  {
    id: 'support:resolved',
    playbookId: 'support',
    emoji: '✅',
    name: 'Resolved',
    body: "Hi {{firstName|there}},\n\nGlad we could sort this out. If anything else comes up, just reply to this email.\n\n{{myName}}",
  },
];

export function stagesFor(all: readonly Stage[], playbooks: readonly PlaybookId[]): Stage[] {
  return all
    .filter((s) => playbooks.includes(s.playbookId))
    .sort((a, b) => playbooks.indexOf(a.playbookId) - playbooks.indexOf(b.playbookId) || a.order - b.order);
}

export function templatesFor(all: readonly Template[], playbooks: readonly PlaybookId[]): Template[] {
  return all.filter((t) => t.playbookId === 'custom' || playbooks.includes(t.playbookId));
}

/** Black or white text, whichever reads better on the given hex background. */
export function textColorFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m || !m[1]) return '#ffffff';
  const n = parseInt(m[1], 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  const contrastWhite = 1.05 / (lum + 0.05);
  const contrastBlack = (lum + 0.05) / 0.05;
  // White wherever it meets WCAG AA (4.5:1), which keeps Gmail-style blue and green badges white.
  return contrastWhite >= 4.5 || contrastWhite >= contrastBlack ? '#ffffff' : '#202124';
}
