# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Subscriptions Hub** — a Manifest V3 **Thunderbird** (not Chrome/Firefox) WebExtension that scans every
configured mail account, detects newsletters/mailing lists from RFC 2369 / RFC 8058 headers, and offers
one-click unsubscribe plus bulk message cleanup. Everything is local; no network calls except the
unsubscribe request itself.

TypeScript + Vite, vanilla DOM (no framework), pnpm.

## Commands

```bash
pnpm dev      # Vite dev server — landing page at / links to the three extension pages (MOCK data)
pnpm test     # Vitest, run once
pnpm build    # tsc (noEmit type-check) + vite build → dist/
pnpm release <patch|minor|major|X.Y.Z> [--push]   # bump + commit + tag
```

Unit tests run on Vitest (`src/services/__tests__/`, pure logic only — no Thunderbird API mocking).
`pnpm test -- <pattern>` filters by file, `pnpm exec vitest run -t "<name>"` by test name.

There is **no linter**. `pnpm test` + `pnpm build` (i.e. `tsc && vite build`) are the local gates; both
run in CI, which additionally lints `dist/` through `kewisch/action-web-ext` (`cmd: lint`,
`channel: listed`). Locally, `--channel` is no longer a web-ext CLI flag, so the closest equivalent
is:

```bash
pnpm exec web-ext lint --source-dir dist
```

It reports ~29 warnings and 0 errors: the AMO validator only knows the Firefox schema, so every
MailExtension API and Thunderbird-only permission is flagged. Those are expected — do not "fix" them
by removing permissions.

To load in Thunderbird: `pnpm build`, then Add-ons → gear → Debug Add-ons → Load Temporary Add-on →
pick `dist/manifest.json`.

## Architecture

Three entry points, all plain HTML files at the repo root that Vite treats as rollup inputs:

- `background.html` → `src/background/index.ts` — registers the Spaces-toolbar entry, the toolbar
  action, the `runtime.onMessage` router, and the `messages.onNewMailReceived` incremental analyzer.
- `dashboard.html` → `src/ui/dashboard/dashboard.ts` — the full-tab UI. `dashboard.html` is
  hand-written static markup; `DashboardController` wires everything by `getElementById`, so adding a
  control means editing both files.
- `options.html` → `src/ui/options/options.ts` — the settings page, declared as `options_ui` with
  `open_in_tab: false`, so Thunderbird renders it inside the Add-ons Manager. There is no Save
  button: the panel can be closed at any moment, so every control writes on `change`. The dashboard's
  gear button only calls `runtime.openOptionsPage()`.

Shared UI code lives in `src/ui/shared/`: `tokens.css` (Thunderbird's design tokens, see below) and
`theme.ts` (applies the stored theme, and re-applies it when the other page changes it).

`public/` is copied verbatim into `dist/` by Vite, so `public/manifest.json` becomes `dist/manifest.json`.

### Styling

Extension pages are not served Thunderbird's chrome stylesheets, so `src/ui/shared/tokens.css`
restates Thunderbird's own tokens under their upstream names — the palette from
`mail/themes/shared/mail/colors.css`, the surfaces from `layout.css`, the control metrics from
`variables.css`. Every token resolves through `light-dark()`, so the "Interface theme" setting is
nothing more than `color-scheme` pinned on `:root` (`data-theme="light" | "dark"`, absent for auto);
there is no second dark-mode block to keep in sync. Keep new colours expressed as these tokens rather
than raw hex, or the add-on stops tracking the Thunderbird theme.

Service layer (`src/services/`, all static-method classes, no DI):

- `accountService` — walks `accounts.list(true)` → `rootFolder` → async `getSubFolders()`, flattens to
  `MailFolderInfo[]`, and decides scan eligibility.
- `parserService` — pure functions: author parsing, `List-Unsubscribe` / `List-Unsubscribe-Post`
  parsing, marketing-ESP header heuristics, HTML-body link fallback, method ranking, ID hashing.
  This is the only place with no browser-API dependency, so newsletter-detection changes belong here.
- `scannerService` — the throttled batch engine; owns `isScanning`/`shouldCancel` module state.
- `storageService` — all persistence, plus CSV/JSON export.
- `subscriptionService` — `upsertFromMessage()`, the single place a message is folded into a
  subscription (counters, reception window, recent subjects, derived frequency). Both `scannerService`
  and the background `onNewMailReceived` listener go through it, so the two paths cannot drift apart.
  Being browser-API-free, it is where the aggregation regression tests live.
- `unsubscribeService` — executes the chosen method and marks status.
- `loggerService` — in-memory ring buffer (200 entries) that also broadcasts each entry as a
  `DEBUG_LOG` runtime message; the dashboard's debug panel renders these.

### Dual-environment design (important)

Every file is written to run **both** inside Thunderbird and in a plain browser under `pnpm dev`.
The pattern is a `typeof browser !== 'undefined' && browser?.x?.y` guard with a mock/`localStorage`
fallback:

- `AccountService.listAccounts()` → `getMockAccounts()`
- `ScannerService.startScan()` → `runMockScan()` (real progress bar, fixture results)
- `StorageService` → `localStorage` instead of `browser.storage.local`

Keep this invariant when adding code — an unguarded `browser.*` access breaks `pnpm dev`.

The demo data itself lives in `src/dev/` and is **not** shipped: `fixtures.ts` (two accounts and the
subscriptions worth having on screen — every frequency, every unsubscribe method, an unsubscribed row,
a sender with no display name, an overlong subject, and a subject full of quotes and angle brackets as
the escaping regression fixture) and `seed.ts`. Each use site is a dynamic `import()` inside an
`if (import.meta.env.DEV)` branch, which Vite turns into `if (false)` when building, so Rollup drops
the branch and the chunk. Import them any other way and the fixtures land in the published add-on.

The dashboard seeds on first load under `pnpm dev`, so the page is never empty; `?seed=force` rebuilds
the data and `?seed=clear` empties it to get the empty state back. A Node script could not do this —
outside Thunderbird the data lives in the page's `localStorage`.

`index.html` at the repo root is the dev-server landing page. It is not a rollup input, so it never
reaches `dist/`.

`browser` is declared as `const browser: any` in `src/types/index.ts`; there are no Thunderbird API
typings, so API calls are unchecked. Be careful: Thunderbird MV3 removed `MailFolder.type` in favour of
`specialUse`, and `AccountService.isScanEligibleFolder` deliberately checks both plus a
French/English folder-name keyword blacklist (Corbeille/Trash, Indésirables/Spam, Envoyés/Sent…).
`ScannerService.scanFolder` similarly tries four different `messages.list`/`query` call shapes in
sequence because the accepted argument varies by Thunderbird version — don't "simplify" these away.

### Message flow

Dashboard → background via `runtime.sendMessage` for `START_SCAN` / `STOP_SCAN` / `OPEN_DASHBOARD`;
background pushes `SCAN_PROGRESS` and `DEBUG_LOG` back. Outside Thunderbird the dashboard calls
`ScannerService` in-process instead. Note the asymmetry: **unsubscribe and message deletion are called
directly from the dashboard**, even though the background router also handles `UNSUBSCRIBE` /
`DELETE_MESSAGES`.

### Persistence

`browser.storage.local` under the `subhub_` key prefix: `subhub_subscriptions` (a
`Record<subscriptionId, Subscription>`), `subhub_analyzed_message_ids` (capped at the last 50 000 ids —
this is the incremental-scan cache), `subhub_settings`. Subscription ids come from
`ParserService.generateSubscriptionId(accountId, senderEmail, listId)` — a stable non-crypto hash, so
changing it orphans every stored subscription.

## Releasing

The version lives in **two** files that must stay in lockstep: `package.json` and
`public/manifest.json`. `scripts/release.mjs` (`pnpm release`) is the supported path — it refuses a
dirty tree or a non-`main` branch, bumps both, commits `chore(release): vX.Y.Z`, tags `vX.Y.Z`, and
with `--push` pushes both.

Pushing the tag triggers `.github/workflows/release.yml`, which re-verifies tag == package == manifest,
builds, lints, signs and submits to addons.thunderbird.net (listed channel, secrets `ATN_SIGN_KEY` /
`ATN_SIGN_SECRET`), then **creates** the GitHub Release with the signed package attached.

> `RELEASE.md` is partly stale: it predates `scripts/release.mjs`, describes the manifest alone as the
> single source of truth, and says the workflow fires when you publish a GitHub Release. The workflow
> actually fires on the tag push and creates the release itself.

The gecko add-on id `subscriptions-hub@robin-toubi.github.io` in `public/manifest.json` is permanent —
never change it.
