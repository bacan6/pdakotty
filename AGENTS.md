# AGENTS.md — Solusi PDA (pdakotty)

Onboarding doc for AI agents customizing this repo. Read this first.

## What this app is

**Solusi PDA** (`com.solusi.pdakotty`) is a mobile warehouse/store assistant for **Solusi POS**, used at Kotty Kosmetik retail operations. Staff scan barcodes to:

| Screen | File | Purpose |
|--------|------|---------|
| Login | `www/index.html` | Auth, redirect if token exists |
| Dashboard | `www/dashboard.html` | Menu hub after login |
| PO Receiving | `www/po-receiving.html` | Receive purchase orders |
| Stock Opname | `www/stock-opname.html` | Update stock counts |
| Cek Harga | `www/cek-harga.html` | Look up product price/stock |
| Label Harga | `www/label-harga.html` | Price label lookup |

UI language: **Indonesian**. Backend: **PHP** at `https://store.kottykosmetik.com`.

## Tech stack

- **Apache Cordova** (Android only) — `config.xml`, `package.json`
- **Static multi-page app** in `www/` — no bundler, no SPA framework
- **jQuery** + **Bootstrap 5** + **Azures** mobile template (`www/scripts/custom.js`, `www/styles/`)
- **PWA** — `www/manifest.json`, `www/_service-worker.js`
- **Barcode** — `www/scripts/barcode-scanner.js` (`openBarcodeScanner()`); Cordova plugin exists but pages use browser scanner

## Directory map

```
pdakotty/
├── config.xml              # Cordova app id, icons, splash
├── package.json            # cordova-android, barcode plugin
├── AGENTS.md               # this file
├── www/                    # ALL app source (Cordova web root)
│   ├── index.html          # login
│   ├── dashboard.html
│   ├── *-*.html            # feature pages (same layout pattern)
│   ├── scripts/
│   │   ├── custom.js       # template init, showNotification()
│   │   ├── barcode-scanner.js
│   │   ├── jquery.min.js, bootstrap.min.js
│   │   └── ...
│   ├── styles/             # compiled CSS (bootstrap, style, modern-ui)
│   ├── scss/               # source SCSS (Azures theme) — edit then compile if theming
│   ├── fonts/              # Font Awesome — do not modify
│   ├── plugins/            # lazy-loaded template plugins (charts, etc.)
│   └── app/icons/          # PWA / app icons
├── platforms/              # generated — gitignored
└── plugins/                  # generated — gitignored
```

## Auth & session

Login stores in `localStorage`:

| Key | Set by login | Used for |
|-----|--------------|----------|
| `tokenpda` | yes | API auth; gate pages |
| `user` | yes | username |
| `first`, `last` | yes | display name on dashboard |
| `toko` | yes | store id — sent on almost every API call |
| `id` | yes | user id — save operations |

**Gate pattern** (duplicated in each protected page):

```javascript
function cekLogin() {
  var token = localStorage.getItem('tokenpda');
  if (token == null || token == undefined) {
    window.location.href = 'index.html';
  }
}
```

**Logout** clears all keys above and redirects to `index.html`.

There is no centralized auth module — logic is inline per HTML file.

## API conventions

- Base URL: `https://store.kottykosmetik.com`
- Method: **POST** with **`FormData`**
- jQuery: `processData: false`, `contentType: false`
- Response: JSON; errors often `{ status: 'error', pesan: '...' }`
- Product lookup: minimum **4 chars** before calling API

### Endpoints

| Controller | Path | Params (FormData) | Used in |
|------------|------|-------------------|---------|
| `Q_Pda_login` | `/auth` | `username`, `password` | index.html |
| `Q_Po_receiving` | `/get_po` | `toko` | po-receiving.html |
| `Q_Po_receiving` | `/cari_order` | `sku`, `nopo`, `toko`, `token` | po-receiving.html |
| `Q_Po_receiving` | `/simpan_po` | `sku`, `po`, `stok`, `token`, `iduser` | po-receiving.html |
| `Q_Stock_opname` | `/cari_produk` | `id`, `toko` | cek-harga, stock-opname |
| `Q_Stock_opname` | `/simpan_so` | `toko`, `idproduk`, `stok`, `harga`, `stokbefore`, `token`, `iduser` | stock-opname.html |
| `Q_Stock_opname` | `/label_harga` | `id`, `toko`, `iduser` | label-harga.html |

Service worker uses **network-first** for `store.kottykosmetik.com`; offline returns JSON error.

## Page template pattern

Each feature page follows the same structure:

1. Standard `<head>` — bootstrap.css, style.css, modern-ui.css, Font Awesome
2. `body.theme-light`, `#preloader`, `#page`
3. Optional `header-fixed` + `footer-bar-5` (PO / Harga / SO / Label / Logout)
4. Inline `<script>` with page logic (cekLogin, ajax, barcode)
5. Scripts load order: `jquery.min.js` → page script → `barcode-scanner.js` → `bootstrap.min.js` → `custom.js`

**Shared globals from custom.js:**

- `showNotification(message, type)` — types: `success`, `error`, `info`, `warning`

**Barcode scan:**

```javascript
openBarcodeScanner(function (result) {
  $('#fieldId').val(result);
  lookupFn(result);
}, 'Scan Title');
```

**PDA hardware scanner (Enter suffix):** barcode fields use Enter-only lookup via `bindEnterAction()` from `www/scripts/scanner-enter.js`. Do not add keyup auto-lookup on scan fields — wait for Enter to avoid partial-barcode API calls. Qty fields (`#stok`) bind Enter to the save function.

## Build & run

```bash
npm install
npx cordova platform add android   # first time
npx cordova build android
npx cordova run android
```

For browser/PWA testing, serve `www/` over HTTP (not `file://`) so service worker and camera work.

After adding a new HTML page, update `www/_service-worker.js` `STATIC_ASSETS` array.

## Customization guide

### Safe to edit

- `www/*.html` — UI and page logic
- `www/scripts/barcode-scanner.js` — scanner behavior
- `www/styles/modern-ui.css` — app-specific styles
- `config.xml`, `www/manifest.json` — app metadata
- `www/_service-worker.js` — cache list

### Edit with care

- `www/scripts/custom.js` — large Azures template (1800+ lines); only touch `showNotification` or add small shared helpers at top
- `www/scss/` — requires SCSS compile to update `www/styles/`

### Avoid unless necessary

- `www/fonts/` — Font Awesome vendor tree
- `www/plugins/` — template demo plugins
- `platforms/`, `plugins/` — Cordova generated

## Known duplication / refactor opportunities

These are copy-pasted across pages — match existing style when adding features:

- `cekLogin()`, `logoutMe()`, `sqlerror()`, `menu(url)`
- FormData + `$.ajax` boilerplate
- Footer nav links

Prefer **minimal diffs**; extract shared JS only if explicitly requested.

## Adding a new feature page

1. Copy `www/cek-harga.html` as template (simplest scan + lookup flow)
2. Add link on `dashboard.html` and footer nav on all pages if needed
3. Add route to `_service-worker.js` STATIC_ASSETS
4. Follow FormData POST pattern; include `toko` from localStorage
5. Call `cekLogin()` on load; use `showNotification` for feedback
6. If barcode needed: include `barcode-scanner.js`, wire `openBarcodeScanner`

## Version & branding

- App version: `1.0.0` (package.json, config.xml, index footer)
- Theme color: `#1a73e8`
- Display name: **Solusi PDA** / **PDA Solusi POS**
