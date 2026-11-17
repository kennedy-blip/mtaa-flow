# MtaaFlow — Local Merchant & Customer Credit Ledger OS

MtaaFlow is an offline-first ledger for Kenyan neighbourhood dukas, market stalls and
duka owners who sell on **deni** (informal credit). It replaces the exercise book with a
three-surface merchant OS: customer credit tracking, live stock alerts, and a daily
cash/profit reconciliation — all stored locally in IndexedDB so the app keeps working
with zero network.

Web app (Vercel) + installable Android APK (Capacitor), from one codebase.

---

## Feature map

| Module | File | What works |
| --- | --- | --- |
| Daily Cash & Profit Recon | `src/components/CashFlowDashboard.tsx` | Period filters (Today / 7d / 30d / All), 4 KPI cards (Total Sales, Cash & M-Pesa Collected, Outstanding Credit, Net Estimated Profit), Staff profit shield, low-stock strip, cash-vs-credit ratio bar, category velocity, searchable/filterable receipt feed with itemized expansion and Owner void-and-reverse, daily expense logger. |
| DeniTracker | `src/components/CreditLedger.tsx` | Customer registry with phone/landmark/due date, spring accordion cards, itemized purchase history, partial & full repayment modal (25/50/75/Clear presets, Cash or M-Pesa with transaction code), repayment progress bars, overdue badges, WhatsApp statement share, clipboard statement copy, Owner edit/delete. |
| Smart Inventory | `src/components/InventoryManager.tsx` | SKU CRUD (Owner), buying/selling price with live margin preview, low-stock and out-of-stock badges, threshold bars, category pills, search, Staff restock (incoming stock) modal, stock movement audit log. |
| Settings & APK Center | `src/components/SettingsCenter.tsx` | APK download hero, 3-theme studio, role privilege matrix, IndexedDB storage telemetry, JSON backup/restore, CSV recon export, demo reset, empty-ledger wipe, shop identity + Owner PIN. |
| POS / credit checkout | `src/components/QuickSaleModal.tsx` | Catalog search plus unlisted items, quantity control, Owner price override, Cash / M-Pesa / Deni payment modes, cash-change calculator, existing or new customer assignment. |
| Roles | `src/components/RoleSwitcher.tsx` | Owner (Admin) ↔ Attendant (Staff) with optional 4-digit PIN unlock (default `2580`). |

### Owner vs Attendant

- **Merchant Owner (Admin):** net profit, cost basis and margins; price overrides; edit/void/delete
  records; JSON backup, CSV export, demo reset and ledger wipe.
- **Shop Attendant (Staff):** log cash / M-Pesa / deni sales, inspect customer balances, record
  repayments, add incoming stock. Profit KPIs, margins and destructive actions are locked.

---

## Theme engine

| Theme | Feel |
| --- | --- |
| *Savannah Glass* | Frosted milk glass, slate shadows, emerald profit accents. |
| *Midnight Nairobi* | Obsidian `#0d0d12` canvas, neon teal accents, translucent acrylic cards. |
| *Terminal Amber* | High-contrast amber-on-black ledger for bright outdoor market sunlight. |

Themes are driven by CSS custom properties in `src/styles/glass.css` (`[data-theme="savannah|midnight|amber"]`)
and persisted in the `settings` table. Framer Motion springs use `SPRING_PHYSICS`
(`stiffness: 300, damping: 25`) for tab transitions, accordions and checkmarks.

---

## Architecture

```
src/
  components/   CashFlowDashboard, CreditLedger, InventoryManager, SettingsCenter,
                QuickSaleModal, RoleSwitcher, ThemeToggle, DownloadAPKModal, AnimatedCheckmark
  db/           db.ts   — Dexie schema + atomic ledger transactions, backup/restore
                seed.ts — realistic Kenyan demo dataset (always seeded "today" data)
  styles/       glass.css — 3 theme variables, mesh gradient keyframes, glass utilities
  utils/        format.ts — KSh currency, Kenyan relative time, overdue, receipts, phone
                motion.ts — shared spring physics
  App.tsx       responsive web shell + native APK/mobile frame with bottom navigation
```

- **Storage:** `MtaaFlowOfflineLedgerDB` (Dexie) with tables `inventory`, `customers`,
  `creditEntries`, `transactions`, `stockLogs`, `settings`. Sales, repayments, expenses and
  restocks run inside `db.transaction('rw', ...)` blocks so stock, credit balance and cashflow
  rows can never drift apart.
- **Accounting model:** `Total Sales = POS + Credit issued`, `Cash Collected = POS + repayments`,
  `Net Profit = gross margin on POS & credit sales − expenses`. Repayment rows carry
  `netProfit: 0` so margin is never double counted.
- **Dual deployment:** `vite.config.ts` builds a static SPA (`vercel.json` handles SPA rewrites,
  APK MIME headers and service-worker caching); `capacitor.config.json` wraps the same `dist/`
  into `ke.co.mtaaflow.ledger` for Android.

---

## Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle
npm run preview    # serve dist on http://localhost:4173
npm run cap:sync   # build web assets and sync into android/
```

## Android APK

```bash
npx cap sync android
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

CI builds the universal APK through `.github/workflows/android-apk.yml` and uploads the
`mtaaflow-apk` artifact. Place the produced binary at
`public/apk/mtaaflow-v1.2.0-universal.apk` so the in-app **Download Android APK** button and
`vercel.json` MIME headers serve it directly.

---

## Demo data

First launch seeds a realistic Kenyan stall: maize flour, sugar, cooking oil, milk, bread,
soda, tea leaves, soap, airtime and eggs — four of them low or out of stock — plus four credit
customers (one overdue), historical receipts and repayment records. Reset any time from
**Settings → Reset Demo Data**.
