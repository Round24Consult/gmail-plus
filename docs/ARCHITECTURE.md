# Architecture

Gmail Plus is a Manifest V3 Chrome extension built on [InboxSDK](https://github.com/InboxSDK/InboxSDK). It has no
backend: all state lives in `chrome.storage.local`.

## Bundles

`build.mjs` uses esbuild to produce these files in `dist/`:

| Output | Source | Runs in | Role |
|---|---|---|---|
| `content.js` | `src/content/index.tsx` | Gmail tab (isolated world) | Loads InboxSDK, registers every feature, renders Preact UI into InboxSDK views |
| `pageWorld.js` | `@inboxsdk/core/pageWorld.js` (copied unchanged) | Gmail tab (page world) | InboxSDK's in-page half; reads Gmail's own data |
| `background.js` | `src/background/index.ts` | Service worker | Runs `@inboxsdk/core/background.js`, which injects `pageWorld.js` with `chrome.scripting`; owns alarms, notifications, opening settings |
| `options.js` | `src/options/index.tsx` | Extension page | Settings, template editor, backup and restore |
| `popup.js` | `src/popup/index.tsx` | Extension page | Toolbar popup |

`pageWorld.js` must keep that exact name at the root of `dist/`, because InboxSDK's background script injects it by
name. All bundles are IIFE (content scripts can't be ES modules). `static/` is copied as-is; the build writes the version
from `package.json` into the manifest, and dev builds add `*.map` to `web_accessible_resources` so DevTools can load
source maps.

```text
┌──────────────── Gmail tab ────────────────┐      ┌──────── service worker ────────┐
│ pageWorld.js  ◄── injected by ────────────┼──────┤ background.js                  │
│      ▲  (InboxSDK page half)              │      │  • InboxSDK loader             │
│      │                                    │      │  • alarms → notifications      │
│ content.js (InboxSDK + Preact UI)         │─msg─►│  • open settings tab           │
│      │                                    │      └───────────────┬────────────────┘
└──────┼────────────────────────────────────┘                      │
       │            chrome.storage.local  (single source of truth) │
       └──────────────────────────┬────────────────────────────────┘
                                  │
                   options.js / popup.js (extension pages)
```

## Data model

Defined in `src/lib/types.ts`, read and written through `Store` in `src/lib/storage.ts`.

| Storage key | Shape | Notes |
|---|---|---|
| `schemaVersion` | number | Currently 1. `migrate()` refuses data from a newer version |
| `settings` | `Settings` | Active playbooks, onboarded flag, daily cap, send interval, your name. Always passed through `sanitizeSettings()` (clamps cap 1–400, interval 10–600 s) |
| `templates` | `Template[]` | Starter templates are seeded on first run. `playbookId` is a playbook or `custom` |
| `stages` | `Stage[]` | Seeded from `playbooks.ts`; fixed in v0.1 |
| `thread:<account>:<threadId>` | `TrackedThread` | One key per tracked conversation, so two tabs editing different threads never overwrite each other |
| `campaign:<id>` | `Campaign` | One key per mail merge: rows, cursor, log, status, heartbeat, in-flight row |
| `sendCounter` | `{ date, count }` | Merge and test sends for the local calendar day |

Threads are keyed by Gmail account (lower-cased) plus InboxSDK's thread id, and every screen filters by the signed-in
account. `migrate()` drops malformed entries instead of failing, so a hand-edited or partial store still loads.

### Live updates

`src/shared/live.ts` keeps one in-memory copy of the store per page. It reloads on `chrome.storage.onChanged`, debounced
by 30 ms, and notifies subscribers. Preact components use the `useData()` hook, and inbox badges subscribe through a
Kefir stream. A change in any tab, the settings page or the background therefore shows everywhere within a moment.

## Features and their InboxSDK hooks

| Feature | File | InboxSDK API |
|---|---|---|
| Reply buttons | `features/templates.tsx` | `Compose.registerComposeViewHandler`, `ComposeView.addStatusBar`, `insertHTMLIntoBodyAtCursor`, `setSubject` |
| Templates menu | `features/templates.tsx` | `ComposeView.addButton({ hasDropdown })` |
| Side panel | `features/pipeline.tsx` | `Conversations.registerThreadViewHandler`, `ThreadView.addSidebarContentPanel`, `getMessageViewsAll`, `MessageView.getSender` |
| Stage badges | `features/pipeline.tsx` | `Lists.registerThreadRowViewHandler`, `ThreadRowView.addLabel(stream)` |
| Board | `ui/Board.tsx` | `Router.handleCustomRoute`, `NavMenu.addNavItem`, `Router.goto(NativeRouteIDs.THREAD)` |
| Contact export | `features/export.ts` | `Toolbars.registerThreadButton({ positions: ['LIST'] })`, `ThreadRowView.getContacts` |
| Mail merge | `ui/MergeWizard.tsx`, `mergeRunner.ts` | `Compose.openNewComposeView`, `setToRecipients`, `setBodyHTML`, `send`, compose events `sending`, `sent`, `sendCanceled`, `destroy` |
| Theme | `theme.ts` | `Router.handleAllRoutes` (re-check on navigation) |

InboxSDK is loaded with `globalErrorLogging: false` and `eventTracking: false`, so it reports nothing to
`api.inboxsdk.com`.

## Follow-ups

1. The side panel saves `followUpAt` and `followUpMessageCount`, the number of messages in the thread at that moment. It
   also messages the background to create a one-off alarm at that time (at least 30 s ahead).
2. The background also runs a sweep alarm every 15 minutes and on browser start-up. For each thread that is due, not
   done and not yet notified, it shows a notification and records `notifiedAt`.
3. Clicking the notification opens `https://mail.google.com/mail/?authuser=<account>#all/<threadId>`.
4. When a tracked thread is opened, the content script compares the message count with `followUpMessageCount`. If there
   are more messages and the newest is from someone else, the follow-up is marked done.

## Mail merge pipeline

```text
CSV ─► parseRecipientCsv() ─► rows (valid, de-duplicated, ≤ 2,000)
                                  │
            subject/body + buildContext(row) ─► render() / renderHtml()
                                  │
Campaign saved ─► runCampaign() ─► SendQueue ─► sendViaCompose() per row
                                  │                 │
                      progress → campaign:<id>      └─► optional TrackedThread at chosen stage
```

### SendQueue (`src/lib/sendQueue.ts`)

A pure class, injected with `send`, `now`, `sleep`, `sentToday`, `recordSent`, `skipReason` and `onProgress`, so it can
be unit-tested with a fake clock.

- Sends rows in order with a fixed `intervalMs` between attempts (failed attempts also wait).
- Before each send it checks today's count. At `dailyCap` it ends with status `capped`, and resuming on a later day
  continues from the same row.
- Rows with a skip reason are logged as `skipped` without waiting or counting.
- `pause()` and `stop()` take effect after the send in flight finishes. `stop` is final.
- Resuming honours the gap since the last attempt recorded in the log.

### Sending through compose (`sendViaCompose`)

1. Opens a new compose view, sets To, Subject, and the body followed by Gmail's existing signature, then calls `send()`.
2. Resolves on the `sent` event, which carries the new thread id. Rejects on `sendCanceled`, on `destroy` without
   `sending` within 10 s, or if nothing is confirmed within 90 s.

### Safeguards against double sending

| Risk | Safeguard |
|---|---|
| Double click on Start | A ref guard in the wizard and a synchronous `starting` flag in `runCampaign` |
| Two tabs resuming the same merge | The running tab writes `heartbeatAt` every 20 s and on every row. Other tabs treat a heartbeat under 60 s as "Running in another tab" and hide Resume |
| Page closed while an email was sending | `inFlight` is saved before each send and cleared after. On resume, `recoverInFlight()` marks that row failed ("check your Sent folder") and moves past it instead of retrying |
| Leaving the page mid-merge | A `beforeunload` prompt while a merge is running |
| Exceeding Gmail limits | Daily cap (hard ceiling 400) and minimum 10 s interval, both clamped in `sanitizeSettings()` |

## Templates

`src/lib/template.ts`:

- Variables match `{{ key }}` or `{{ key | fallback }}`. Keys are normalised (lower-case, letters and digits only), so
  `{{First Name}}` equals `{{first_name}}`.
- `buildContext(row, { myName })` maps every CSV column to its normalised key and derives `name`, `firstname` (via
  `names.ts`), `email` and `myname`.
- Rendering returns the text plus the list of variables that had neither a value nor a fallback.
- HTML output escapes everything and turns line breaks into `<br>`, so neither template text nor recipient data can
  inject markup.

## Security notes

- No remote code: everything is bundled, as Manifest V3 requires.
- Host permission is limited to `https://mail.google.com/`. Web-accessible resources are limited to icons (and source
  maps in dev builds).
- The background only acts on messages from the extension's own content script (`gp:` message types) and only opens the
  extension's settings page or creates alarms.
- CSV export neutralises formula-like cells (OWASP CSV injection).
- The preview pane uses `dangerouslySetInnerHTML` only with output from `renderHtml()`, which is fully escaped.

## Adding a feature

1. Put pure logic in `src/lib/` with tests in `tests/`.
2. Add a `register<Feature>(ctx)` in `src/content/features/` and call it from `src/content/index.tsx`.
3. Render UI with Preact into the element InboxSDK gives you, and unmount it on the view's `destroy` event.
4. Scope CSS under `.gp-root` with `gp-` class names in `static/gp.css`, using the theme tokens so dark mode works.
5. If you add stored data, extend `types.ts`, `migrate()` and the backup round-trip test. Bump `SCHEMA_VERSION` if old
   data needs converting.
