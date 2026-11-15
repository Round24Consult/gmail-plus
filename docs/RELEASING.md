# Releasing

## Every release

1. Update `CHANGELOG.md` and bump `version` in `package.json`, following semantic versioning.
2. Run the checks:

   ```bash
   npm run typecheck && npm test
   ```

3. Build and zip:

   ```bash
   npm run package
   ```

   This writes `release/gmail-plus-<version>.zip`: a minified build without source maps, with " (dev)" removed from the
   extension name.
4. Load the unpacked production build (`dist/` after `npm run build:prod`) and run the manual Gmail checklist in
   [CONTRIBUTING.md](../CONTRIBUTING.md#manual-gmail-checklist).
5. Commit, tag (`git tag v<version>`) and push the tag.
6. Upload the zip in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole).

## Before the first Chrome Web Store submission

- [ ] **Brand name.** Google's trademark rules don't allow a store name that starts with "Gmail". Use "<Brand> for
      Gmail". Update `name`, `short_name` and `action.default_title` in `static/manifest.json`, and `APP_NAME` in
      `src/config.ts`.
- [ ] **InboxSDK app id.** Already registered: `sdk_GPlusSettings_a5074a55a5` in `src/config.ts`. If the brand changes,
      a new id with a matching label can be registered at <https://register.inboxsdk.com/>.
- [ ] **Developer account.** Register for the Chrome Web Store with a company Google account (one-time fee), and verify
      the publisher email.
- [ ] **Privacy policy URL.** Host [PRIVACY.md](../PRIVACY.md) publicly, for example on round24consult.com or GitHub
      Pages, and link it in the listing.
- [ ] **Store listing assets:**
  - [ ] icon 128×128 (`static/icons/128.png`)
  - [ ] at least one screenshot at 1280×800 or 640×400
  - [ ] small promo tile 440×280 (optional)
- [ ] **Single purpose statement**, for example: "Adds productivity tools to Gmail: reply templates, a pipeline,
      follow-up reminders, contact export and mail merge."
- [ ] **Permission justifications:**
  - `https://mail.google.com/`: runs inside Gmail to add its tools.
  - `scripting`: InboxSDK injects its Gmail integration script.
  - `storage` / `unlimitedStorage`: stores settings, templates, pipeline and mail merge lists locally; lists can be
    large.
  - `alarms`: checks for due follow-up reminders.
  - `notifications`: shows follow-up reminders.
- [ ] **Data usage disclosure.** The extension handles email addresses and email content locally and transmits nothing.
      Tick the "not sold / not used for unrelated purposes / not used for creditworthiness" certifications.
- [ ] **Remote code: none.** All code is bundled.

## After publishing

- Watch the InboxSDK changelog and update `@inboxsdk/core` regularly. Gmail changes are fixed there, and old SDK
  versions can stop working.
- Keep the manual checklist current as features change.
