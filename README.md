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
- **Export** — download all expenses as CSV (spreadsheet) or PNG (report card)
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
├── settings.html     # Account, appearance, exports
├── contact.html      # Contact the owner
├── manifest.json     # PWA manifest
├── sw.js             # Service worker (offline support)
├── icon-192.png      # App icon (small)
├── icon-512.png      # App icon (large)
└── js/
    ├── config.js     # Supabase keys + app settings
    ├── site.js       # Navbar, theme, toasts, PWA install
    ├── app.js        # Dashboard logic
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
- **Total Spent This Month** — tap the card to flip and see your **remaining budget**
- **Highest Expense Category** — tap to flip and see the **lowest**
- **Utilities This Month** — tap to flip and see the **per-type breakdown**
- **Total Transactions** — glowing count; tap to flip and see your **top 5 biggest expenses**
- **🎯 Monthly Budget** — dark card with mood feedback (🤩 😌 😬 💥)
- **👥 Spending by Person** — totals, percentages, and itemized details per person

### 6. Set your budget
In the 🎯 Monthly Budget card, change the **Target** amount. It saves automatically in your browser.

### 7. Settings
Open **Settings** from the navbar:
- **Nickname** — shown in the navbar instead of your email
- **Appearance** — 6 accent colors, applied instantly
- **Export** — CSV (for Excel/Sheets) or PNG (a share-ready report card)
- **Change password**
- **Sign out**

### 8. Delete an expense
In Transaction History, click the 🗑 button → it turns red asking **Confirm?** → click again within 3 seconds to delete.

### 9. Install as an app
**Chrome/Edge (desktop & Android):** click **Install app** in the navbar.
**iPhone/iPad (Safari):** Share button → **Add to Home Screen**.

### 10. Contact the owner
Go to **Contact** — fill the form and send via WhatsApp or email, or use the direct buttons.

---

## 🚀 Run It Yourself

1. **Fork or clone** this repo
2. Create a free project at [supabase.com](https://supabase.com)
3. In Supabase **SQL Editor**, paste and run `schema.sql`
4. In Supabase → **Authentication → Sign In / Providers**, turn OFF **Confirm email** (so users can sign in right away)
5. Open `js/config.js` and replace:
   ```js
   const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR-PUBLISHABLE-KEY';
   ```
6. Host it anywhere static (GitHub Pages, Netlify, Vercel) — done!

> ⚠️ Use the **publishable/anon key** (safe with RLS), never the secret key.

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
