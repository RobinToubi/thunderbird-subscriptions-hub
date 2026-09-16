# Publishing Subscriptions Hub to addons.thunderbird.net (ATN)

This add-on is published for **Thunderbird** on [addons.thunderbird.net](https://addons.thunderbird.net) (ATN).
The process below is automated with GitHub Actions; you only have to create the initial listing once,
then cut a GitHub Release to publish new versions.

---

## 1. One-time setup (only the first time)

### a) Create your developer account on ATN
1. Go to <https://addons.thunderbird.net> and log in with your Mozilla account.
2. Accept the developer agreement if prompted.

### b) Create the add-on listing (once)
The **initial** public (listed) listing is created on the ATN website developer hub, because the first
submission needs metadata that the API (v4) does not fully support (name, categories, summary, license,
description, screenshots).

1. Open the **Developer Hub** → **Submit a New Add-on**.
2. Choose to host the add-on on ATN (**Listed**).
3. Provide:
   - **Name**: `Subscriptions Hub`
   - **Summary/Description**: "Centralize, analyze and manage all your subscriptions and newsletters across every Thunderbird email account."
   - **Categories**: e.g. *Message Reading* / *Privacy and Security*
   - **License**: `MPL-2.0` (or the license of your choice)
   - **Version**: `1.0.0`
4. Optionally add screenshots.

> ⚠️ The add-on **ID** is `subscriptions-hub@robin-toubi.github.io` (see `public/manifest.json` →
> `browser_specific_settings.gecko.id`). This ID is **permanent** once the add-on is published and cannot
> be changed later, so it must match the one ATN assigns to your listing.

### c) Generate API credentials
1. In the Developer Hub, open **Manage API Keys** (or <https://addons.thunderbird.net/developers/API/>).
2. Generate a key + secret.
3. Add them as **GitHub repository secrets** (Settings → Secrets and variables → Actions):
   - `ATN_SIGN_KEY` → the API key (JWT issuer)
   - `ATN_SIGN_SECRET` → the API secret (JWT secret)

### d) (Optional) Add the `web-ext` tool locally
To reproduce the CI commands locally:
```bash
pnpm add -D web-ext
pnpm exec web-ext lint --source-dir dist --channel listed
```

---

## 2. Versioning rules

- **The manifest is the single source of truth** for the add-on version:
  `public/manifest.json` → `"version"`.
- The version must be **bumped** in `public/manifest.json` for every release.
- The **GitHub Release tag** must be `v<version>` and must **match** the manifest version exactly.
  The CI fails if they differ.

> Only versions that are strictly higher than the last published one are accepted by ATN.

---

## 3. Publish a new version

1. Bump the version in `public/manifest.json`:
   ```bash
   # example: next version 1.1.0
   jq '.version = "1.1.0"' public/manifest.json > tmp.json && mv tmp.json public/manifest.json
   ```
2. Commit and push:
   ```bash
   git add public/manifest.json
   git commit -m "chore: bump version to 1.1.0"
   git push
   ```
3. Tag and push the tag:
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```
4. Create a **GitHub Release** from the tag `v1.1.0` (UI: Releases → New release → choose the tag;
   put release notes in the description). The release is picked up once published.

That's it — the **Release** workflow builds the add-on, checks the version matches, lints it, signs it,
submits the new version to **addons.thunderbird.net** (listed channel), and attaches the signed
`.xpi`/`.zip` to the GitHub Release.

---

## 4. CI workflow (on every push / PR)

The **CI** workflow (`ci.yml`) runs automatically on pushes to `main` and on pull requests. It:

- installs dependencies,
- type-checks and builds (`tsc && vite build`) into `dist/`,
- runs `web-ext lint` (listed channel) on the build output,
- produces an unlisted signed package as a CI artifact for manual testing.

---

## 5. Troubleshooting / notes

- **Review delay**: listed submissions go through review; approval time varies (hours to days). The
  action waits up to `timeout` (900 s) for upload + validation, but does **not** block on the human review.
- **Duplicate versions**: ATN rejects a version that already exists. Always bump before releasing.
- **Secrets**: the `Release` workflow skips/aborts if `ATN_SIGN_KEY` / `ATN_SIGN_SECRET` are missing
  (the sign step fails fast). Check Settings → Secrets if the workflow fails.
- The built extension lives in `dist/` (gitignored); it is produced by `pnpm build` and contains the
  full packaged payload.
