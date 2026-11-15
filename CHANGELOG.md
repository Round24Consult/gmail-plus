# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [semantic versioning](https://semver.org/).

## [Unreleased]

### Known issues

- Pipeline and Mail merge items in Gmail's left menu show without icons.
- These still need the manual Gmail checklist in a real account:
  - compose reply buttons
  - the side panels and badges
  - notifications
  - contact export
  - live mail merge sends
  - the WhatsApp connector

## [0.3.0] - 2026-11-15

Connectors, starting with WhatsApp.

### Added

- **WhatsApp connector.** Opens a WhatsApp chat (WhatsApp Web, or the app through wa.me) with the number and your
  message typed in; you press Send. It uses WhatsApp's click-to-chat links: no Business account, API key or extra
  permission.
- **Contact panel** in conversations: save a person's phone number once, then write a message from the default text or
  any template and open WhatsApp.
- **After-send card:** after you email someone whose number is saved, it offers to message them on WhatsApp too. Mail
  merge emails are skipped. It can be switched off.
- **WhatsApp follow-ups after a mail merge:** lists with a phone column get a follow-up list with **Open next**, a preview,
  and opened rows remembered. Valid numbers from the list are saved on each contact.
- WhatsApp button on pipeline board cards with a saved number.
- Phone number column in the pipeline and contact CSV exports.
- **Settings → Connectors:** on/off, where WhatsApp opens, default country for phone numbers, default message, and the
  after-send card.
- **Connector framework.** Address kinds, connectors and delivery are separate; a new app is one file in
  `src/lib/connectors/catalog/`. Builds choose connectors with `CONNECTORS`, and set `DEFAULT_COUNTRY` and
  `CONNECTOR_MESSAGE`. See `docs/CONNECTORS.md`.
- `{{subject}}` variable in connector messages.
- **Recipient search in mail merge.** Step 1 now has three tabs: **Search contacts** (search as you type, paste several
  addresses, or add everyone in a pipeline stage), **Upload CSV** and **Paste a list**.
  - Suggestions come from a local address book of people seen in Gmail and emailed, plus contact cards, the pipeline and
    earlier merges. It never leaves the browser.
  - Settings → Your data can switch it off or forget everyone.
  - Configured with `people.remember` and `people.maxRemembered`.
- Pasted lists without a header row are read as plain addresses.
- 66 new tests (166 in total).

### Changed

- Storage schema 3: contact cards and connector settings. Existing data is migrated automatically.
- The background worker checks that messages come from the extension itself.
- Manifest description mentions WhatsApp follow-ups.

### Fixed

- Opening a link such as `mail.google.com/mail/u/0/#gmail-plus-pipeline` in a fresh Gmail tab landed on the inbox,
  because Gmail redirects unknown addresses before the extension is ready. The extension now goes back to the page the
  link pointed at.
- The troubleshooting guide pointed at `src/config.ts` for the InboxSDK app id; it is set in `.env`.

## [0.2.0] - 2026-11-15

Open-source release: everything configurable.

### Added

- **Build-time configuration.** `config/defaults.json` plus `.env` and environment variables cover the app name, slug,
  description, InboxSDK app id, support, homepage and privacy links, mail merge limits, follow-up timing, and which
  playbooks ship and are on by default. The build validates every value and reports all problems at once. See
  `docs/CONFIGURATION.md`.
- **Playbooks as data.** Each bundled playbook is a JSON file in `playbooks/`; adding one needs no code change. Newly
  shipped playbooks reach existing users on update, switched off.
- **Playbook and stage editor in Settings.**
  - Create playbooks; rename playbooks and stages; recolour and reorder stages; mark stages closed.
  - Add and delete stages. Conversations on a deleted stage move to a stage you choose.
  - Delete playbooks. Their templates are kept under My templates.
- About section in Settings with version, source, support and privacy links from configuration.
- MIT licence, code of conduct, security policy, and issue and pull request templates.
- Docs: configuration reference and playbook format guide.
- 30 new tests (100 in total).

### Changed

- Storage schema 2. Existing data is migrated automatically on first load.
- The InboxSDK app id is no longer in the source; set `INBOXSDK_APP_ID` in `.env` or a CI variable.
- Release zip and backup file names use the configured slug.
- CI uses the current major versions of the GitHub actions (Node 24) and reads optional repository variables.

### Fixed

- Row borders in the Previous merges table.

## [0.1.0] - 2026-11-15

First preview.

### Added

- Reply buttons above Send and a searchable templates menu in compose, with variables and fallbacks.
- Three playbooks (Freelancer / agency, Recruiter, Shop / support) with stages and starter templates.
- Pipeline side panel, follow-up reminders with notifications and auto-clear on reply, stage badges, pipeline board.
- Contact export to CSV.
- Mail merge:
  - CSV upload, preview, test send
  - paced sending with a daily limit, pause, resume and stop
  - logs, and optional pipeline tracking
  - safeguards against double sending
- Settings page, toolbar popup, light and dark themes, backup and restore.
- Unit tests and GitHub Actions CI.
