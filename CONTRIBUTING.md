# Contributing

## Setup

Thanks for helping. Bug reports from real Gmail use, new playbooks and fixes for the [known issues](README.md#known-issues)
are especially welcome. Please follow the [code of conduct](CODE_OF_CONDUCT.md).

```bash
# Fork on GitHub, then:
git clone https://github.com/<you>/gmail-plus.git
cd gmail-plus
nvm use              # Node 24, see .nvmrc (20+ works)
npm install
cp .env.example .env # add your own free InboxSDK app id (optional for development)
npm run dev          # builds dist/ and rebuilds on change
```

Register your own InboxSDK app id at <https://register.inboxsdk.com/> rather than reusing someone else's. Without one,
everything works but Gmail shows a developer banner.

Load `dist/` in Chrome: `chrome://extensions` → Developer mode → **Load unpacked**. After each change, click the
extension's reload icon and refresh Gmail. Restart `npm run dev` after editing `static/`, `config/`, `playbooks/` or
`.env`.

Use a test Gmail account for development, especially for mail merge.

## Workflow

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Branch from `main`: `feature/<short-name>` or `fix/<short-name>`.
3. Keep pure logic in `src/lib/` and cover it with tests in `tests/`.
4. Keep things configurable: names, limits and presets go in `config/` or `playbooks/`, not in code.
5. Before pushing, run `npm run typecheck && npm test && npm run build`.
6. Open a pull request using the template. CI runs the type check, tests and a production build, and attaches the zip.
7. For UI changes, include a screenshot and say which items of the manual checklist you ran.

### Adding a playbook

Add one JSON file to `playbooks/`. No code changes are needed. See [docs/PLAYBOOKS.md](docs/PLAYBOOKS.md).

### Adding a setting

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md#adding-a-setting).

## Code style

- TypeScript strict mode, including `noUncheckedIndexedAccess`.
- Preact function components and hooks. Render into InboxSDK-provided elements and unmount on `destroy`.
- CSS lives in `static/gp.css`. Every selector is scoped to `.gp-root` or a `gp-` class so nothing leaks into Gmail. Use
  the colour tokens (`--gp-*`) so light and dark themes both work.
- User-facing text: short, plain sentences in sentence case. Say what happened and what to do next.
- No network calls. If a feature needs a server, discuss it first; it changes the privacy policy and store disclosures.

## Tests

```bash
npm test             # all suites once
npx vitest           # watch mode
```

| Suite | Covers |
|---|---|
| `tests/config.test.ts` | Config merging (defaults, `.env`, env vars), validation errors, playbook file discovery and validation |
| `tests/playbookEditing.test.ts` | v1→v2 migration, bundled playbooks on update, creating and deleting playbooks and stages, backups |
| `tests/template.test.ts` | Variables, fallbacks, key normalisation, HTML escaping, first-name detection |
| `tests/csv.test.ts` | Header detection, BOM, quotes, blank and short rows, invalid and duplicate emails, export round-trip, formula injection |
| `tests/storage.test.ts` | Migrations, settings clamping, per-account threads, daily counter across midnight, backup and restore, playbook helpers |
| `tests/sendQueue.test.ts` | Pacing, daily cap and next-day resume, failures, skips, pause and resume, stop, resume from saved progress |
| `tests/mergeRunner.test.ts` | In-flight recovery, missing-variable detection, other-tab detection |

## Manual Gmail checklist

Gmail can't run in unit tests, so check these by hand in a test account before a release:

**Compose**
- [ ] Reply buttons appear above Send in a new email, a reply and a pop-out compose.
- [ ] Clicking a button inserts the text at the cursor with the first name filled in.
- [ ] A template with a subject fills the subject of a new email but not of a reply.
- [ ] The templates menu opens, searches (with more than six templates) and inserts.

**Pipeline**
- [ ] The side panel appears in a conversation. Adding to a stage shows the contact.
- [ ] A badge appears on that conversation in the inbox and updates when the stage changes.
- [ ] Notes save on blur.
- [ ] **Remove from pipeline** removes the badge.
- [ ] The board shows the card. Drag and drop and the card's stage menu both move it.
- [ ] Clicking a card's subject opens the conversation.
- [ ] **Export CSV** downloads a correct file.

**Follow-ups**
- [ ] A custom follow-up two minutes ahead raises a notification. Clicking it opens the conversation.
- [ ] After a reply from the contact, opening the conversation clears the follow-up.
- [ ] A due follow-up shows ⏰ on its badge and in the board banner.

**Contact export**
- [ ] Selecting conversations shows the export button. The CSV excludes your own address and merges duplicates.

**Mail merge** (send only to addresses you own)
- [ ] Loading a CSV reports duplicates and invalid lines.
- [ ] Preview renders every row. The missing-value warning and **Send anyway** behave as described.
- [ ] **Send test to me** arrives with "[Test]" and your signature.
- [ ] A two-row merge sends both emails, the gap matches the setting, and both appear in Sent.
- [ ] With **Add to pipeline** set, both sent conversations appear on the board.
- [ ] **Pause** then **Resume** continues from the right row. **Stop** is final.
- [ ] Reloading Gmail mid-merge shows **Interrupted**, and Resume works without re-sending.
- [ ] With the daily limit set to 1, the merge stops at the limit with "Daily limit reached".

**Settings**
- [ ] Playbook toggles show and hide stages and templates in Gmail.
- [ ] Creating a playbook adds a board tab. Renaming, recolouring, reordering and adding stages update the board and badges.
- [ ] Deleting a stage with conversations asks where to move them. Deleting a playbook with conversations is refused.
- [ ] Limits, template add, edit and delete, backup and restore, delete all.

**Configuration**
- [ ] A build with `APP_NAME=Test` shows "Test" in Chrome, Settings and Gmail messages.
- [ ] A build without `INBOXSDK_APP_ID` warns at build time and shows the InboxSDK banner. With it, there is no banner.

**General**
- [ ] Light and dark Gmail themes both look right.
- [ ] The popup counts are correct.
