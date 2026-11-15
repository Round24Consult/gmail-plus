# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [semantic versioning](https://semver.org/).

## [Unreleased]

### Known issues

- Pipeline and Mail merge items in Gmail's left menu show without icons.
- Compose reply buttons, the side panel, badges, notifications, contact export and live mail merge sends still need the
  manual Gmail checklist in a real account.

## [0.1.0] - 2026-11-15

First preview.

### Added

- Reply buttons above Send and a searchable templates menu in compose, with variables and fallbacks
  (`{{firstName|there}}`).
- Three playbooks (Freelancer / agency, Recruiter, Shop / support), each with pipeline stages and four starter templates.
- Pipeline side panel in conversations: stage, contact, notes.
- Follow-up reminders with desktop notifications. They clear automatically when the contact replies.
- Coloured stage badges in message lists, with ⏰ when a follow-up is due.
- Pipeline board in Gmail's left menu: tabs per playbook, drag and drop, due banner, CSV export.
- Contact export to CSV from selected conversations.
- Mail merge:
  - CSV upload or paste, preview, test send, consent check
  - paced sending with a daily limit, pause, resume and stop
  - logs, and optional tracking of sent conversations on the pipeline
- Safeguards against double sending: start guard, other-tab heartbeat, in-flight recovery.
- Settings page: playbooks, name, limits, template editor, backup, restore and delete.
- Toolbar popup with counts and shortcuts.
- Light and dark theme support.
- Registered InboxSDK app id; InboxSDK error and usage reporting off.
- Unit tests (70) and GitHub Actions CI.
