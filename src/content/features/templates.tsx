import type { ComposeView } from '@inboxsdk/core';
import { render } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { PLAYBOOKS, templatesFor } from '../../lib/playbooks';
import { buildContext, render as renderText, renderHtml } from '../../lib/template';
import type { Template } from '../../lib/types';
import { useData } from '../../shared/live';
import { iconUrl, myName, openSettings, type Ctx } from '../context';

export function insertTemplate(ctx: Ctx, cv: ComposeView, template: Template): void {
  const to = cv.getToRecipients()[0];
  const vars = buildContext({ name: to?.name ?? '', email: to?.emailAddress ?? '' }, { myName: myName(ctx) });
  const { html, missing } = renderHtml(template.body, vars);
  const missingAll = new Set(missing);
  if (template.subject && !cv.isReply() && !cv.getSubject().trim()) {
    const subject = renderText(template.subject, vars);
    subject.missing.forEach((m) => missingAll.add(m));
    cv.setSubject(subject.text);
  }
  cv.insertHTMLIntoBodyAtCursor(html);
  if (missingAll.size) {
    ctx.sdk.ButterBar.showMessage({ text: `Template inserted. Fill in: ${[...missingAll].join(', ')}`, time: 6000 });
  }
}

function ChipsBar({ ctx, cv }: { ctx: Ctx; cv: ComposeView }) {
  const data = useData();
  const templates = templatesFor(data.templates, data.settings.playbooks);
  return (
    <div class="gp-root gp-chips" role="toolbar" aria-label="Quick templates">
      {templates.length === 0 ? (
        <span class="gp-muted">No templates yet.</span>
      ) : (
        templates.map((t) => (
          <button type="button" class="gp-chip" title={t.body.slice(0, 200)} onClick={() => insertTemplate(ctx, cv, t)} key={t.id}>
            <span aria-hidden="true">{t.emoji}</span> {t.name}
          </button>
        ))
      )}
      <button type="button" class="gp-chip gp-chip-ghost" title="Edit templates" onClick={() => openSettings('templates')}>
        ✎
      </button>
    </div>
  );
}

function TemplateMenu({ ctx, cv, onDone }: { ctx: Ctx; cv: ComposeView; onDone: () => void }) {
  const data = useData();
  const [query, setQuery] = useState('');
  const templates = templatesFor(data.templates, data.settings.playbooks);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? templates.filter((t) => `${t.name} ${t.body}`.toLowerCase().includes(q)) : templates;
  }, [templates, query]);
  const groups = [...PLAYBOOKS.map((p) => ({ id: p.id as Template['playbookId'], name: p.name })), { id: 'custom' as const, name: 'My templates' }]
    .map((g) => ({ ...g, items: filtered.filter((t) => t.playbookId === g.id) }))
    .filter((g) => g.items.length);

  return (
    <div class="gp-root gp-menu">
      {templates.length > 6 && (
        <input
          class="gp-input"
          placeholder="Search templates"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          ref={(el) => el?.focus()}
        />
      )}
      {groups.length === 0 && <p class="gp-muted gp-pad">No matching templates.</p>}
      {groups.map((g) => (
        <div key={g.id}>
          <div class="gp-menu-group">{g.name}</div>
          {g.items.map((t) => (
            <button
              type="button"
              class="gp-menu-item"
              key={t.id}
              onClick={() => {
                insertTemplate(ctx, cv, t);
                onDone();
              }}
            >
              <span class="gp-menu-emoji" aria-hidden="true">{t.emoji}</span>
              <span>
                <strong>{t.name}</strong>
                <span class="gp-muted gp-menu-preview">{t.body.replace(/\s+/g, ' ').slice(0, 70)}</span>
              </span>
            </button>
          ))}
        </div>
      ))}
      <button
        type="button"
        class="gp-menu-footer"
        onClick={() => {
          openSettings('templates');
          onDone();
        }}
      >
        Edit templates…
      </button>
    </div>
  );
}

export function registerTemplates(ctx: Ctx): void {
  ctx.sdk.Compose.registerComposeViewHandler((cv) => {
    cv.addButton({
      title: 'Templates (Gmail Plus)',
      iconUrl: iconUrl('template'),
      hasDropdown: true,
      type: 'MODIFIER',
      orderHint: 10,
      onClick(event) {
        const dropdown = event.dropdown;
        if (!dropdown) return;
        render(<TemplateMenu ctx={ctx} cv={cv} onDone={() => dropdown.close()} />, dropdown.el);
        dropdown.once('destroy', () => render(null, dropdown.el));
      },
    });

    const bar = cv.addStatusBar({ height: 40, orderHint: 0, addAboveNativeStatusBar: true });
    render(<ChipsBar ctx={ctx} cv={cv} />, bar.el);
    cv.once('destroy', () => render(null, bar.el));
  });
}
