# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [semantic versioning](https://semver.org/).

## [Unreleased]

### Known issues

- Pipeline and Mail merge items in Gmail's left menu show without icons.
- These still need the manual Gmail checklist in a real account:
  - compose reply buttons
  - the side panel and badges
  - notifications
  - contact export
  - live mail merge sends

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
