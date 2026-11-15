# Configuration

Nothing about branding, limits or playbooks is hardcoded. A build combines four sources, later ones winning:

1. **`config/defaults.json`**: committed defaults
2. **`.env`** in the project root: your local values (git-ignored; start from `.env.example`)
3. **Environment variables**: for CI, or one-off builds such as `APP_NAME="Inbox Pro" npm run build`
4. **`playbooks/*.json`**: every playbook file is bundled (see [PLAYBOOKS.md](PLAYBOOKS.md))

`scripts/load-config.mjs` merges and validates them. `build.mjs` injects the result into the code as `CONFIG`
(`src/config.ts`) and writes the branding into `manifest.json` and the HTML titles. An invalid value stops the build and
lists every problem; a missing InboxSDK app id prints a warning.

Tests always use `config/defaults.json` only, so a local `.env` never changes test results.

## Settings

### Identity and branding

| Variable | Config key | Default | What it does |
|---|---|---|---|
| `INBOXSDK_APP_ID` | `inboxSdkAppId` | *(empty)* | Your free app id from <https://register.inboxsdk.com/>, shaped like `sdk_<label>_<10 hex>`. Empty still works, but Gmail shows a red "Invalid AppId" banner |
| `APP_NAME` | `appName` | `Gmail Plus` | Extension name in Chrome, the settings page, messages and backups. Dev builds add " (dev)". Up to 75 characters |
| `APP_SHORT_NAME` | `appShortName` | `Gmail Plus` | Short name in the manifest |
| `APP_SLUG` | `appSlug` | `gmail-plus` | Lowercase id for Gmail route names (`#<slug>-pipeline`), file names (backups, release zip) and the backup format tag |
| `APP_DESCRIPTION` | `appDescription` | *(see file)* | Manifest description, up to 132 characters |
| `SUPPORT_EMAIL` | `supportEmail` | *(empty)* | Shown under About in Settings when set |
| `HOMEPAGE_URL` | `homepageUrl` | this repository | Manifest `homepage_url` and the "Source and docs" link |
| `PRIVACY_POLICY_URL` | `privacyPolicyUrl` | *(empty)* | Linked from the Privacy section when set |

The Chrome Web Store doesn't accept a name that starts with "Gmail". Set `APP_NAME` to something like "Acme for Gmail"
before publishing.

### Mail merge

| Variable | Config key | Default | What it does |
|---|---|---|---|
| `MERGE_DEFAULT_DAILY_CAP` | `mailMerge.defaultDailyCap` | `100` | Daily limit for new installs |
| `MERGE_MAX_DAILY_CAP` | `mailMerge.maxDailyCap` | `400` | Highest limit a user can set (at most 2000, Gmail's Workspace limit; personal accounts allow about 500) |
| `MERGE_DEFAULT_INTERVAL_SEC` | `mailMerge.defaultIntervalSec` | `30` | Seconds between emails for new installs |
| `MERGE_MIN_INTERVAL_SEC` | `mailMerge.minIntervalSec` | `10` | Shortest gap a user can set |
| `MERGE_MAX_INTERVAL_SEC` | `mailMerge.maxIntervalSec` | `600` | Longest gap a user can set |
| `MERGE_MAX_RECIPIENTS` | `mailMerge.maxRecipients` | `2000` | Largest list accepted in one merge |

The values must satisfy `1 ≤ defaultDailyCap ≤ maxDailyCap ≤ 2000` and
`1 ≤ minIntervalSec ≤ defaultIntervalSec ≤ maxIntervalSec ≤ 3600`.

### Follow-ups

| Variable | Config key | Default | What it does |
|---|---|---|---|
| `FOLLOW_UP_SWEEP_MINUTES` | `followUps.sweepMinutes` | `15` | How often the background checks for due reminders (1 to 1440). Each reminder also gets its own exact alarm |
| `FOLLOW_UP_REMINDER_HOUR` | `followUps.reminderHour` | `9` | Hour (0 to 23) used by the Tomorrow, 3 days and 1 week buttons |

### Playbooks

| Variable | Config key | Default | What it does |
|---|---|---|---|
| `PLAYBOOKS` | *(build only)* | all files | Comma-separated ids of the `playbooks/*.json` files to bundle, e.g. `PLAYBOOKS=recruiter,support` |
| `DEFAULT_PLAYBOOKS` | `defaultPlaybooks` | `[]` (all) | Which bundled playbooks are switched on at first run |

Users can still switch playbooks on and off, edit stages and create their own in Settings. These settings only decide
what ships and what is on by default.

## Examples

A local build with your registered app id (`.env`):

```dotenv
INBOXSDK_APP_ID=sdk_MyLabel_0123456789
SUPPORT_EMAIL=help@example.com
```

A white-label build for a recruiting agency:

```bash
APP_NAME="Hire Desk for Gmail" APP_SHORT_NAME="Hire Desk" APP_SLUG=hire-desk \
PLAYBOOKS=recruiter MERGE_MAX_DAILY_CAP=2000 npm run package
```

## CI

`.github/workflows/ci.yml` reads `INBOXSDK_APP_ID` and `SUPPORT_EMAIL` from repository **variables**: Settings → Secrets
and variables → Actions → Variables. Forks without them still build and pass; their zip just shows the InboxSDK banner.
An app id isn't secret (it ships inside every published extension), but each publisher should register their own.

## Adding a setting

1. Add the key and default to `config/defaults.json`.
2. Add it to `AppConfig` in `src/configTypes.ts`.
3. If it should be settable from the environment, map it in `ENV_VARS` in `scripts/load-config.mjs`, and add validation
   to `validateConfig()`.
4. Read it in code through `CONFIG` from `src/config.ts`.
5. Document it here and in `.env.example`, and add a case to `tests/config.test.ts`.
