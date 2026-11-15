# Privacy policy

_Last updated: 15 November 2026_

Gmail Plus is a browser extension published by Round24 Consult. It adds templates, a pipeline, follow-up reminders,
contact export and mail merge to Gmail.

## What it accesses

The extension runs only on `https://mail.google.com`. While you use Gmail it reads what is on the page to do its job:

- recipients, subject and sender names, to fill template variables
- participants and subjects of conversations you add to the pipeline, or select for export
- message counts in a conversation with a follow-up, to notice a reply

## What it stores

These are kept in your browser's extension storage (`chrome.storage.local`) on your computer:

- your settings
- your templates
- pipeline entries: conversation id, subject, contact name and email, stage, notes, follow-up time
- mail merge lists and send logs

## What it sends

Nothing. The extension has no server and makes no network requests of its own. It does not use the Gmail API. InboxSDK's
optional error and usage reporting to `api.inboxsdk.com` is switched off. Mail merge and test emails are sent by Gmail
through your own compose window, the same as any email you send yourself.

## Sharing

No data is sold, shared or used for advertising. No one but you can see it.

## Your control

- Delete any pipeline entry or mail merge from the extension.
- Delete everything at once in Settings, under "Your data", or by removing the extension.
- Download a backup file whenever you like.

## Contact

Questions: info@round24consult.com

_If you publish your own build of this open-source extension, replace this contact and review the policy for any
changes you make._
