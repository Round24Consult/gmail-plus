# Privacy policy

_Last updated: 15 November 2026 (WhatsApp connector added)_

Gmail Plus is a browser extension published by Round24 Consult. It adds templates, a pipeline, follow-up reminders,
contact export, mail merge and WhatsApp follow-ups to Gmail.

## What it accesses

The extension runs only on `https://mail.google.com`. While you use Gmail it reads what is on the page to do its job:

- recipients, subject and sender names, to fill template variables
- participants and subjects of conversations you add to the pipeline, or select for export
- message counts in a conversation with a follow-up, to notice a reply
- the recipients and subject of an email as you send it, to offer a WhatsApp message to people whose number you saved
- the names and addresses of people in lists and conversations you view and in emails you send, to suggest mail merge
  recipients (you can switch this off)

## What it stores

These are kept in your browser's extension storage (`chrome.storage.local`) on your computer:

- your settings
- your templates
- pipeline entries: conversation id, subject, contact name and email, stage, notes, follow-up time
- contact cards: a contact's name, email address and the phone number you saved (or that was in a mail merge list), and
  when you last opened WhatsApp for them
- an address book for recipient search: names and email addresses of people seen in Gmail, when they were last seen
  and how often (at most 3,000 per Gmail account by default)
- mail merge lists and send logs

## What it sends

Nothing. The extension has no server and makes no network requests of its own. It does not use the Gmail API. InboxSDK's
optional error and usage reporting to `api.inboxsdk.com` is switched off. Mail merge and test emails are sent by Gmail
through your own compose window, the same as any email you send yourself.

When you click a WhatsApp button, the extension opens WhatsApp's own click-to-chat link (`web.whatsapp.com` or `wa.me`)
in a browser tab. That link contains the contact's phone number and the message you wrote, so WhatsApp receives them,
the same as if you had typed them into WhatsApp. Nothing is sent until you press Send in WhatsApp. WhatsApp's own
privacy policy applies there.

## Sharing

No data is sold, shared or used for advertising. No one but you can see it.

## Your control

- Delete any pipeline entry, saved phone number or mail merge from the extension.
- Switch the WhatsApp connector off in Settings.
- Switch off remembering people for recipient search, or forget everyone remembered, in Settings under "Your data".
- Delete everything at once in Settings, under "Your data", or by removing the extension.
- Download a backup file whenever you like.

## Contact

Questions: info@round24consult.com

_If you publish your own build of this open-source extension, replace this contact and review the policy for any
changes you make._
