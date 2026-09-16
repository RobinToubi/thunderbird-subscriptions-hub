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
- **Modern Vanilla CSS design** : Respects dark / light mode and ergonomic standards.

---

## 📁 Project Architecture

```text
├── public/
│   ├── manifest.json         # Manifest V3 for Thunderbird 115/128+
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
│   └── ui/
│       └── dashboard/
│           ├── dashboard.css # Typed Vanilla CSS styles with dark mode
│           └── dashboard.ts  # Interactive dashboard controller
├── background.html           # WebExtension background entry point
├── dashboard.html            # Fullscreen tab entry point
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
Open your browser to the address shown (e.g. `http://localhost:5173/dashboard.html`).

### 3. Build for Thunderbird
To compile the complete extension ready for Thunderbird:
```bash
pnpm build
```
The generated files will be placed in the `dist/` directory.

---

## 📦 Temporary loading in Mozilla Thunderbird

1. Open **Mozilla Thunderbird** (version 115+ or 128+ ESR).
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
