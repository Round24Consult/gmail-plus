# Playbooks

A playbook is a preset for one kind of work: a set of pipeline stages plus starter reply templates. There are two
kinds:

- **Bundled playbooks** live in `playbooks/<id>.json` and ship with the extension. Adding one needs no code change.
- **User playbooks** are created in the extension's Settings under **Playbooks and stages** and live only in that
  browser.

Users can rename any playbook and add, rename, recolour, reorder and delete its stages, whichever kind it is.

## Bundled playbook format

```json
{
  "id": "real-estate",
  "name": "Real estate",
  "blurb": "Listings, viewings and offers.",
  "order": 40,
  "stages": [
    { "key": "enquiry", "name": "Enquiry", "color": "#1a73e8" },
    { "key": "viewing", "name": "Viewing booked", "color": "#e37400" },
    { "key": "offer", "name": "Offer made", "color": "#9334e6" },
    { "key": "sold", "name": "Sold", "color": "#188038", "closed": true },
    { "key": "lost", "name": "Lost", "color": "#c5221f", "closed": true }
  ],
  "templates": [
    {
      "key": "viewing",
      "emoji": "🏠",
      "name": "Book a viewing",
      "subject": "Viewing for {{property|the property}}",
      "body": "Hi {{firstName|there}},\n\nThanks for your interest. Would Saturday morning work for a viewing?\n\nBest,\n{{myName}}"
    }
  ]
}
```

| Field | Required | Rules |
|---|---|---|
| `id` | yes | 2 to 31 lowercase letters, digits or dashes. The file must be named `<id>.json`. Never change it after release: stored stage ids are based on it |
| `name` | yes | Shown in Settings, board tabs and menus |
| `blurb` | no | One line shown on the playbook card |
| `order` | no | Sort order among bundled playbooks (lower first, default 100) |
| `stages` | yes, at least one | In pipeline order. `key` is unique within the playbook (lowercase, digits, dashes); `color` is a 6-digit hex; `closed: true` marks end states such as won, lost or resolved |
| `templates` | yes (may be `[]`) | `key` is unique within the playbook; `name` and `body` are required; `emoji` defaults to ✉️; `subject` is optional and used for new emails and mail merge |

Template bodies are plain text with variables. See [Template variables](../README.md#template-variables).

The build validates every file and stops with a clear message if something is wrong. `npm test` runs the same checks.

## How ids work

- Stage ids are `<playbook id>:<stage key>`, for example `real-estate:viewing`.
- Template ids are `<playbook id>:<template key>`.
- Tracked conversations store the stage id, so renaming a stage's `name` is safe, but changing a `key` or `id` in a
  released playbook orphans existing data.

## What existing users get when you add or change a file

- **New playbook file:** installed users get it on their next update, with its stages and templates, switched off by
  default so their setup doesn't change. It is added once: if a user deletes it, it doesn't come back.
- **Changes to an existing file** (new stage, new template, renamed stage) apply to new installs only. Existing users
  keep their own copy, because they may have edited it. To change existing installs, add a step to `migrate()` in
  `src/lib/storage.ts` and bump `SCHEMA_VERSION`.

## Shipping only some playbooks

Set `PLAYBOOKS=recruiter,support` when building to bundle only those files. Set `DEFAULT_PLAYBOOKS` to choose which are
switched on at first run. See [CONFIGURATION.md](CONFIGURATION.md).

## Contributing a playbook

Playbooks for common kinds of work are welcome: real estate, events, legal intake, customer success and so on.

1. Add `playbooks/<id>.json` using the format above.
2. Keep templates short, friendly and generic. Use `{{firstName|there}}` and `{{myName}}`, and no company names.
3. Pick stage colours that read well with white text. The badge text colour is chosen automatically for contrast.
4. Run `npm test` and `npm run build`, load the extension and check the board and reply buttons.
5. Open a pull request with a screenshot of the board.
