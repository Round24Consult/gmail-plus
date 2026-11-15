# Connectors

A connector lets users reach a contact on another app without leaving Gmail. WhatsApp is the first one. This page
explains how connectors are built, how to add another app, and how sending through a provider's API would fit later.

- [What ships today](#what-ships-today)
- [Concepts](#concepts)
- [Where the code lives](#where-the-code-lives)
- [How a message gets opened](#how-a-message-gets-opened)
- [Adding a link connector](#adding-a-link-connector)
- [Adding an address kind](#adding-an-address-kind)
- [API connectors (planned)](#api-connectors-planned)
- [Rules for every connector](#rules-for-every-connector)

## What ships today

| Connector | Delivery | Needs | Opens |
|---|---|---|---|
| WhatsApp | Link ([click to chat](https://faq.whatsapp.com/5913398998672934)) | A phone number | WhatsApp Web (`web.whatsapp.com/send`) or the app picker (`wa.me`), with the message typed in |

Where users meet it in Gmail:

- the **Contact** side panel in a conversation: save a number, write a message, open WhatsApp
- the **after-send card**: "Email sent. Message them too?" when the recipient has a saved number
- **Mail merge → Previous merges → WhatsApp**: a follow-up list for lists with a phone column
- a WhatsApp icon on **pipeline board** cards

Settings → Connectors has the on/off switch, where WhatsApp opens, the default country for phone numbers and the default
message. Builds choose which connectors ship with `CONNECTORS` ([CONFIGURATION.md](CONFIGURATION.md#connectors)).

## Concepts

Three ideas are kept apart so each new app costs as little as possible.

| Idea | What it is | Example |
|---|---|---|
| **Address kind** | How a person is reached. Several connectors can share one, so a number saved once works for every phone-based app | `phone`: validated and stored as `+447911123456` |
| **Connector** | An app. It names the address kind it needs, its colour, icon and description, and how messages leave | `whatsapp` needs a `phone` |
| **Delivery** | How a message leaves | `link`: open the app with the text ready, and the user presses Send. `api` (planned): send through the provider's API |

A link connector has one or more **targets**, ways of opening it. WhatsApp has `web` (WhatsApp Web, the default) and
`link` (wa.me, which offers the desktop app). Users choose one in Settings.

People's addresses live on **contact cards**, one per Gmail account and email address (storage key
`contact:<account>:<email>`). A card holds `handles` by address kind (`{ phone: '+447911123456' }`) and `lastReached` by
connector (`{ whatsapp: 1731670000000 }`). Cards are shared by every conversation with that person, filled from the
Contact panel or from mail merge lists, exported in the CSV exports, and included in backups.

## Where the code lives

```text
src/lib/connectors/
├── types.ts          # AddressKind, Connector (LinkConnector), LinkTarget, MAX_CONNECTOR_MESSAGE
├── addresses.ts      # ADDRESS_KINDS: every address kind
├── phone.ts          # the phone kind: parsing with libphonenumber-js, formatting, the country list
├── registry.ts       # ALL_CONNECTORS, CONNECTORS (this build), enabledConnectors, targetFor, buildLink
├── rows.ts           # mail merge: find the address column, read addresses from a row
├── message.ts        # fill a message for one person ({{subject}} without "Re:")
└── catalog/
    └── whatsapp.ts   # one file per connector, named after its id

src/content/reach.ts              # reachOut(): the one place the UI opens a connector
src/content/features/connectors.tsx  # registers the Contact panel and the after-send card
src/content/ui/ContactPanel.tsx   # the side panel
src/content/ui/connectors.tsx     # AddressField, ConnectorComposer, QuickReach (shared pieces)
src/content/ui/ReachList.tsx      # follow-up list after a mail merge
src/content/ui/AfterSendOffer.tsx # the after-send card
src/background/index.ts           # openConnector(): validates, builds the link, opens or reuses the tab
src/options/index.tsx             # Settings → Connectors
```

UI code never builds links or knows about a specific app. It asks the registry which connectors are on, shows their
name, icon and address field, and calls `reachOut()`.

## How a message gets opened

```text
Contact panel / after-send card / merge list / board card
        │  reachOut(connector, person, address, text)
        ▼
content script ── chrome.runtime.sendMessage({ type: 'gp:open-connector', connectorId, address, text })
        ▼
background worker: openConnector()
  1. the message must come from this extension
  2. the connector must ship in this build and be switched on in Settings
  3. the address is normalised again by its address kind
  4. buildLink(): target.build(address, text), then the URL must be HTTPS and on the connector's own `hosts`
  5. open the URL in the tab this connector used last (session storage), or in a new tab
        ▼
reply { ok } ── content records lastReached on the contact card, or shows Gmail's error bar
```

Because the background builds the link itself from validated parts, no page or message can make the extension open an
arbitrary URL. Link connectors need no extra Chrome permission: opening and updating tabs doesn't require one.

## Adding a link connector

Use a link connector when the app has an official URL that opens a chat with a recipient and, ideally, a message. The
steps below use a made-up app, ExampleChat, that accepts `https://chat.example/send?to=<number>&text=<message>`.

1. **Create `src/lib/connectors/catalog/examplechat.ts`.** The file name must be the connector id.

   ```ts
   import type { LinkConnector } from '../types';

   export const examplechat: LinkConnector = {
     id: 'examplechat',
     name: 'ExampleChat',
     color: '#7b1fa2',
     iconPath: 'M12 3C7 3 3 6.6 3 11c0 2.1.9 4 2.4 5.4L4.5 21l4.6-1.9c.9.3 1.9.4 2.9.4 5 0 9-3.6 9-8s-4-8-9-8z',
     description: 'Opens an ExampleChat conversation with your message typed in. You press Send.',
     address: 'phone',                     // reuse saved phone numbers
     columns: ['examplechat'],             // extra mail merge column names, checked before "phone", "mobile"…
     maxTextLength: 2000,
     delivery: 'link',
     hosts: ['chat.example'],              // the only hosts its links may use
     targets: [
       {
         id: 'web',
         label: 'ExampleChat Web',
         hint: 'Opens in a browser tab.',
         build: (phone, text) => `https://chat.example/send?to=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}`,
       },
     ],
   };
   ```

2. **Register it** in `ALL_CONNECTORS` in `src/lib/connectors/registry.ts`.
3. **Ship it** by adding its id to `connectors.available` in `config/defaults.json` (or with `CONNECTORS=whatsapp,examplechat`).
4. **Test.** `npm test` runs every registered connector through the registry checks: its address kind exists, its colour
   and limits are valid, its target ids are unique, and every target builds an HTTPS link on its own hosts. Add a test
   for the exact URLs it builds in `tests/connectors.test.ts`.
5. **Check it in Gmail:** save a number in the Contact panel, open the connector, try each target, and run a mail merge
   follow-up with a list that has the connector's column.
6. **Document it** in the table at the top of this page, in the README and in the user guide.

Nothing else changes: the Contact panel, the after-send card, the merge follow-up list, board cards, Settings and the
CSV exports pick it up from the registry.

Limits of link connectors today:

- Links must be `https://`. Schemes such as `sms:` or `tg:` would need a content-side opener and a different safety
  check.
- The UI says the app "opens with this message typed in". An app that can't prefill text would need a flag on the
  connector so the UI can say so.

## Adding an address kind

Add one when a connector needs something other than a phone number, such as a username.

1. Write it next to `phone.ts`, implementing `AddressKind`: `id` (stored on contact cards, never change it), `label`,
   `placeholder`, `inputType`, mail merge `columns`, `normalize()` (returns the canonical value or a clear error) and
   `format()`.
2. Add it to `ADDRESS_KINDS` in `addresses.ts`.
3. Point connectors at it with `address: '<id>'`.
4. Add tests for `normalize()`.

The Contact panel shows one field per address kind needed by the connectors that are on, and the CSV exports add one
column per address kind.

## API connectors (planned)

Some users will want messages sent without a click, for example through the WhatsApp Cloud API with their own Meta
business account, or SMS through a provider such as Twilio. The types are prepared for this: `Connector` is a union with
one member today, so adding a second member makes the compiler point at every place that must handle it.

The intended shape:

```ts
export interface ApiConnector extends ConnectorBase {
  delivery: 'api';
  /** Fields the user fills in Settings, such as an access token and a sender id. */
  credentials: ReadonlyArray<{ key: string; label: string; secret: boolean }>;
  /** Origins requested as optional host permissions when the user switches the connector on. */
  origins: readonly string[];
  /** Runs in the background worker. */
  send(input: { address: string; text: string; credentials: Record<string, string> }):
    Promise<{ ok: true; id?: string } | { ok: false; error: string }>;
}
```

What adding the first one involves:

- `optional_host_permissions` in `static/manifest.json`, requested with `chrome.permissions.request()` when the user
  switches the connector on, so users who never use it grant nothing.
- A branch in the background's `openConnector()` that calls `send()` instead of opening a tab, plus rate limiting and a
  log, like mail merge.
- Credentials stored in `chrome.storage.local`, never in the code or the build. Each user brings their own.
- Provider rules built into the UI. The WhatsApp Cloud API only lets businesses start conversations with Meta-approved
  message templates, requires the recipient's opt-in, and charges per delivered message.
- Updates to [PRIVACY.md](../PRIVACY.md), the Settings privacy text and the Chrome Web Store data disclosures, because
  the extension would then send data to a third party.

Open an issue before starting one, so the design can be agreed first.

## Rules for every connector

- **Official routes only.** Use an app's documented links or APIs. Connectors that drive an app's web interface, use
  reverse-engineered clients (such as unofficial WhatsApp libraries) or scrape, put users' accounts at risk and won't be
  accepted.
- **The user stays in control.** Link connectors never send on their own. API connectors must show what will be sent and
  to whom before sending.
- **Respect consent.** Message people who expect to hear from you, and follow each app's rules on opt-in.
- **Keep it local.** Addresses, messages and credentials stay in the user's browser unless the user turns on an API
  connector that needs to reach its provider.
- **No new permissions for link connectors.** If a connector seems to need one, discuss it in an issue first.
