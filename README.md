# 💜 Pocket Manager

A simple, free, and private expense tracker. Log your daily spending in seconds, split bills with friends and family, watch your monthly budget, and see where your money goes — all in one clean dashboard.

**Live app:** https://yildirim28.github.io/Pocket-Manager/

---

## ✨ Features

- **Multi-account** — sign up with email & password; each account only sees its own expenses
- **Bulk entry** — add many expenses in one form, submit all at once
- **Split by person** — save people once, then tap to split any expense equally
- **Utilities section** — track Wifi, Gas, Electricity (and Other) with a monthly breakdown
- **Monthly budget** — live progress bar that changes color as you approach your limit
- **Interactive cards** — tap cards to flip: remaining balance, lowest category, utilities breakdown, top 5 transactions
- **Installable (PWA)** — install it on your phone or desktop and use it like a native app
- **Offline-ready** — pages load even without internet (data syncs when back online)
- **History ledger** — search, filter (category, person, month) and sort every expense, with a downloadable PDF
- **Archive** — every past month in full detail (totals, budget, utilities, categories, people and each expense) with per-month and full-history PDF exports
- **Trash bin** — deleted expenses are soft-deleted to a trash that is excluded from every total, chart and export; restore them or delete them forever
- **Export** — download all expenses as CSV (spreadsheet), PNG (report card) or PDF
- **Accent colors** — 6 themes; pick your favorite in Settings
- **Contact owner** — send messages via WhatsApp or email

---

## 🛠 Built With

- **HTML + Tailwind CSS + JavaScript** — no framework, no build step
- [Supabase](https://supabase.com) — database + login (free tier)
- [Lucide](https://lucide.dev) icons
- Hosted on **GitHub Pages**

---

## 📁 Project Structure

```
├── index.html        # Landing page
├── login.html        # Sign in
├── signup.html       # Create account
├── app.html          # Dashboard (main app)
├── history.html      # Full transaction history + PDF export
├── archive.html      # Monthly archive, PDF list and trash
├── settings.html     # Account, appearance, exports
├── feedback.html     # Feedback form
├── contact.html      # Contact the owner
├── manifest.json     # PWA manifest
├── sw.js             # Service worker (offline support)
├── schema.sql        # Supabase schema + migrations
├── icon-192.png      # App icon (small)
├── icon-512.png      # App icon (large)
└── js/
    ├── config.js     # Supabase keys + app settings
    ├── site.js       # Navbar, theme, toasts, PWA install
    ├── app.js        # Dashboard logic
    ├── charts.js     # Area + orbit SVG charts
    ├── pdf.js        # Shared PDF export (History + Archive)
    ├── history.js    # History ledger + soft delete
    ├── archive.js    # Monthly archive, PDF list, trash manager
    ├── auth.js       # Sign in / sign up
    ├── settings.js   # Settings + exports
    └── contact.js    # Contact form
```

---

## 📖 User Manual

### 1. Create your account
Open the app → **Get started** → enter email + password (6+ characters) → **Create account**. You're signed in instantly. Already have an account? Use **Sign in**.

### 2. Add your people (optional)
Before splitting expenses, add the people you share costs with:
- Scroll to the **People** card on the dashboard
- Type a name (e.g. "Alice") → **Add person**
- Each person gets a fun mascot 🦊🐼🐯 that stays the same everywhere

### 3. Add expenses
Use the **Add Transactions** form:
1. Type a **description** (e.g. "Grocery run")
2. Enter the **amount**
3. Pick a **category** — Food, Transport, Utilities, Rent, Entertainment, Shopping, Other
4. Check the **date** (defaults to today)
5. **Utilities only:** a second dropdown appears — Wifi, Gas, Electricity, or Other
6. Click **Add another expense** to stack more rows
7. Hit **Add Expenses** — everything saves in one go

### 4. Split with people
1. Click **Split by person** under any expense row
2. Tap the people who share it — the amount divides **equally and automatically**
3. A preview shows each share, e.g. `Alice $10.00 · Bob $10.00`

### 5. Read the dashboard
- **🎯 Monthly Budget** — the first card you see: a dark hero with mood feedback (🤩 😌 😬 💥), a sand-timer that drains as you spend, pace + allowance tiles, and one-tap budget setting
- **Total Spent This Month** — tap the card to flip and see your **remaining budget**
- **Highest Expense Category** — tap to flip and see the **lowest**
- **Utilities This Month** — tap to flip and see the **per-type breakdown**
- **Total Transactions** — glowing count; tap to flip and see your **top 5 biggest expenses**
- **👥 Spending by Person** — totals, percentages, and itemized details per person

### 6. Set your budget
1. On the 🎯 **Monthly Budget** card, click **Set budget** (or the ✨ suggestion chip in the footer)
2. A modern panel opens with a **smart suggestion** built from your recent months, quick-pick amounts, and a custom field
3. Pick a value and hit **Save budget** — it applies instantly and syncs to your account across every device

### 7. Settings
Open **Settings** from the navbar:
- **Nickname** — shown in the navbar instead of your email
- **Appearance** — 6 accent colors, applied instantly
- **Export** — CSV (for Excel/Sheets) or PNG (a share-ready report card)
- **Change password**
- **Sign out**

### 8. Transaction History
Open **History** from the navbar:
- Search by description, filter by **category**, **person** or **month**, and sort to taste
- Paginate through results; totals update to match the filters
- Click **Download PDF** to export exactly what you see, or **Download full history** for everything

### 9. Archive
Open **Archive** from the navbar to see every past month in full detail:
- Hero stats — all-time spent, months tracked, transactions and items in trash
- **Month by month** — tap a month to expand totals, budget progress, utilities breakdown, category bars and the biggest expenses
- **Drill-down tables** — tap any person to unfold a table of every share they carry, and unfold **Every expense** for the month's full ledger (description, date, category/people chips and amount)
- **PDF list** — download a single month or the entire archive as a PDF (generated on your device)
- **Deleted expenses** — the trash bin (see below)

### 10. Delete, restore and empty the trash
Deleting never destroys anything right away:
1. In **History**, click the 🗑 button → it turns red asking **Confirm?** → click again within 3 seconds to move the expense to the trash.
2. The expense disappears from every total, chart and export and now waits in **Archive → Deleted expenses**.
3. Click **Restore** to bring it back, or **Delete** (confirm when it turns red) to remove it forever.
4. **Empty trash** clears the whole bin at once (with a confirm step).

### 11. Install as an app
**Chrome/Edge (desktop & Android):** click **Install app** in the navbar.
**iPhone/iPad (Safari):** Share button → **Add to Home Screen**.

### 12. Contact the owner
Go to **Contact** — fill the form and send via WhatsApp or email, or use the direct buttons.

---


## 🔒 Privacy

- Passwords are hashed by Supabase Auth
- **Row Level Security** is enforced in the database itself — account A can never read account B's data, even with direct API access
- No analytics, no ads, no tracking

---

## 📞 Contact

- **Email:** shamimosman344@gmail.com
- **WhatsApp:** +880 1639-815290

---

© 2026 Pocket Manager. Made with 💜 for people who budget.
