# Contributing

## Setup

```bash
git clone git@github.com:Round24Consult/gmail-plus.git
cd gmail-plus
nvm use        # Node 24, see .nvmrc (20+ works)
npm install
npm run dev    # builds dist/ and rebuilds on change
```

Load `dist/` in Chrome: `chrome://extensions` → Developer mode → **Load unpacked**. After each change, click the
extension's reload icon and refresh Gmail. Restart `npm run dev` after editing anything in `static/`.

Use a test Gmail account for development, especially for mail merge.

## Workflow

1. Branch from `main`: `feature/<short-name>` or `fix/<short-name>`.
2. Keep pure logic in `src/lib/` and cover it with tests in `tests/`.
3. Before pushing, run `npm run typecheck && npm test && npm run build`.
4. Open a pull request. CI runs the type check, tests and a production build, and attaches the zip as an artifact.
5. For UI changes, include a screenshot and say which items of the manual checklist you ran.

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

**General**
- [ ] Light and dark Gmail themes both look right.
- [ ] Settings: playbook toggles, limits, template add, edit and delete, backup and restore, delete all.
- [ ] The popup counts are correct.
