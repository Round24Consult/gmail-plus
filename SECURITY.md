# Security policy

## Reporting a vulnerability

Please don't open a public issue for security problems. Report them privately instead:

- through GitHub's **Report a vulnerability** button on the repository's **Security** tab, or
- by email to the maintainers at info@round24consult.com

Include the version, steps to reproduce, and what an attacker could do. We aim to reply within five working days and
will credit you in the fix unless you prefer otherwise.

## Scope

The extension handles email addresses and email content inside Gmail and stores data in `chrome.storage.local`. These
are in scope:

- data leaving the browser
- cross-site scripting through templates, CSV files or email content
- CSV injection in exports
- unwanted or duplicate email sends
- anything that lets a web page talk to the extension

## Supported versions

Only the latest release gets security fixes.
