# 📬 Subscriptions Hub — Mozilla Thunderbird Extension

> A modern (Manifest V3) extension to centralize, analyze and manage all your subscriptions, newsletters and mailing lists across every email account configured in Thunderbird.

---

## 🌟 Key Features

- **Unified multi-account** : Automated detection and aggregation across all your email addresses (work, personal, aliases).
- **Newsletter & RFC list detection** :
  - Parses the standardized RFC 2369 / RFC 8058 headers (`List-Unsubscribe`, `List-Unsubscribe-Post`, `List-ID`, etc.).
  - Fallback analysis of unsubscribe links in the HTML body of messages.
- **One-Click Unsubscribe (RFC 8058)** :
  - Sends a direct HTTP POST request without leaving Thunderbird.
  - Supports email-based unsubscribes (`mailto:`) and automatically opens preference management pages.
- **Non-blocking async scan** : Batch analysis with caching of already-processed messages to keep Thunderbird responsive.
- **Bulk cleanup** : Move all historical messages of a subscription to the trash in one go.
- **Total Privacy (100% Local)** : No data or metadata ever leaves your machine. Secure local storage via `browser.storage.local`.
- **Data export** : CSV and JSON export to audit your subscriptions.
- **Thunderbird Supernova integration** : Accessible via the spaces toolbar and native tabs.
- **Native Thunderbird look** : Built on Thunderbird's own design tokens, so the add-on follows the
  light / dark theme of the client it runs in.
- **Settings in the Add-ons Manager** : Detection, appearance, scan pacing and local-data reset live in
  the add-on's own settings panel, not in a separate dialog.

---

## 📁 Project Architecture

```text
├── public/
│   ├── manifest.json         # Manifest V3 for Thunderbird 128+
│   └── icons/                # SVG vector icons (32, 48, 64, 128px)
├── src/
│   ├── types/
│   │   └── index.ts          # TypeScript data models
│   ├── services/
│   │   ├── accountService.ts     # Thunderbird accounts & folders discovery
│   │   ├── parserService.ts      # RFC header parsing and heuristics
│   │   ├── scannerService.ts     # Throttled batch scan engine
│   │   ├── storageService.ts     # Local persistence (storage.local / CSV / JSON)
│   │   └── unsubscribeService.ts # Unsubscribe and cleanup execution
│   ├── background/
│   │   └── index.ts          # Background script (Spaces, Action, onNewMailReceived)
│   ├── dev/                  # Demo fixtures + seeding (dev only, stripped from builds)
│   └── ui/
│       ├── dashboard/
│       │   ├── dashboard.css # Dashboard styles (Thunderbird design language)
│       │   └── dashboard.ts  # Interactive dashboard controller
│       ├── options/          # Settings page shown in the Add-ons Manager
│       └── shared/           # Thunderbird design tokens + theme helper
├── background.html           # WebExtension background entry point
├── dashboard.html            # Fullscreen tab entry point
├── options.html              # Settings entry point (options_ui)
├── index.html                # Dev-server landing page (not part of the build)
├── vite.config.ts            # Vite bundler configuration
├── tsconfig.json             # TypeScript configuration
└── package.json
```

---

## 🚀 Installation & Development

### 1. Prerequisites
- Node.js (v24+, current LTS)
- `pnpm`

### 2. Quick UI preview (Browser demo)
To test and preview the interface right away with simulated data and a simulated scan:
```bash
pnpm dev
```
Open the address shown (e.g. `http://localhost:5173/`) and pick a page. The dashboard seeds demo data
on first load, so there is something to look at right away; `?seed=force` rebuilds it and `?seed=clear`
empties it. None of this demo data is part of the built extension.

### 3. Build for Thunderbird
To compile the complete extension ready for Thunderbird:
```bash
pnpm build
```
The generated files will be placed in the `dist/` directory.

---

## ⚙️ CI / CD & Publishing (addons.thunderbird.net)

- **CI** (`.github/workflows/ci.yml`) runs on every push / PR: installs deps, type-checks, builds and
  lints the extension, and uploads a signed test package as an artifact.
- **Release** (`.github/workflows/release.yml`) triggers when you publish a **GitHub Release**: it builds,
  signs and submits the new version to **addons.thunderbird.net** (listed channel), then attaches the
  signed package to the release.

To cut a release, bump the version in `public/manifest.json` (the **single source of truth**), tag it
`v<version>`, and create a GitHub Release. Full instructions in **`RELEASE.md`**.

---

## 📦 Temporary loading in Mozilla Thunderbird

1. Open **Mozilla Thunderbird** (version 128 ESR or later).
2. Open the **Tools** > **Add-ons and Themes** menu (or press `Ctrl+Shift+A` / `Cmd+Shift+A`).
3. Click the gear icon (⚙️) at the top right and choose **Debug Add-ons**.
4. Click **Load Temporary Add-on...**.
5. Navigate to your project and select the file:
   - `dist/manifest.json` (after running `pnpm build`).
6. The **Subscriptions Hub** icon then appears in your **spaces toolbar** (or in the toolbar). Click it to open the fullscreen tab!

---

## 🔮 Planned Future Roadmap
- **Phase 2** : Detection of recurring paid subscriptions (SaaS, invoices, telecoms) with monthly/annual budget estimates.
- **Phase 3** : Alerts for newsletters never opened (prolonged inactivity).
