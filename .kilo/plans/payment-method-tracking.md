# Payment Method Tracking — Implementation Plan

## Goal
Let users record **how** each expense was paid — **Cash, Card (credit/debit), bKash, Nagad, Other** — with a default of Cash, colored badges in history, and a monthly per-method breakdown on the dashboard.

---

## 1. Database (`schema.sql` + direct apply)

Add an idempotent migration (same pattern as `participants` / `utility_type`):

```sql
-- v5: payment method used for the expense.
alter table public.expenses
    add column if not exists payment_method text;

comment on column public.expenses.payment_method
    is 'How the expense was paid: Cash, Card, bKash, Nagad, Other';
```

- No RLS/policy changes needed (column inherits existing per-user policies).
- Apply directly to the live DB via the `pg` pooler connection (same method used for v3/v4 migrations), then verify with `information_schema.columns`.
- Existing rows get `NULL` → treated as "Other" in summaries, no chip shown in history.

## 2. Constants (`js/app.js`)

```js
const PAYMENT_METHODS = ['Cash', 'Card', 'bKash', 'Nagad', 'Other'];

const PAYMENT_METHOD_COLORS = {
    Cash:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    Card:   'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
    bKash:  'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
    Nagad:  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    Other:  'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
};

function paymentOptionsHtml(selected) { /* like categoryOptionsHtml */ }
```

- bKash uses its brand pink, Nagad its brand orange, Card violet, Cash slate.

## 3. Expense form (`js/app.js` → `expenseRowHtml`)

- New **"Payment"** `<select data-field="payment_method">` in every expense row, defaulting to **Cash**, always visible (unlike the conditional utility-type field).
- Adjust the desktop grid template from
  `md:grid-cols-[minmax(0,1fr)_130px_160px_150px_2rem]` to
  `md:grid-cols-[minmax(0,1fr)_110px_140px_140px_130px_2rem]`
  so description flexes and all fields fit; mobile keeps its 2-per-row wrap.
- Update `readRow()` to read `payment_method`.
- Update `addExpenses()` payload: `payment_method: data.paymentMethod || 'Cash'`.
- `validateRow()` unchanged (field always has a value).

## 4. History display (`js/app.js`)

- New helper `paymentChipHtml(expense)` — colored badge (uses `PAYMENT_METHOD_COLORS`), rendered **only when `payment_method` is set** (old rows stay clean).
- `tableRowHtml()`: chip shown in the Category cell next to category + utility badges.
- `listItemHtml()` (mobile feed): same chip in the meta row.

## 5. Dashboard breakdown (new "Payment Methods" card)

- New card below the budget card in `app.html`, styled like the People card (rose header → use amber/teal gradient header with 💳 emoji, dark-mode classes included).
- `renderSummary()` computes this-month totals per method:
  - `NULL`/empty `payment_method` groups under **Other**.
  - Renders a row per method with total, % of month, and a mini progress bar (max = top method), only for methods that have spending; whole card hidden when there is no spending this month.
- Reuses the person-card row pattern (name + amount + bar) for visual consistency.

## 6. Exports (`js/settings.js`)

- **CSV**: add `payment_method` to the `.select(...)` call, add "Payment Method" header + `csvEscape(e.payment_method ?? '')` column.
- **PNG report**: append the method to the category text (e.g. `Food · bKash`) to avoid widening the report layout.

## 7. Versioning & deploy

- Bump script versions `?v=29` → `?v=30` in all 7 HTML pages.
- Bump `sw.js` `CACHE_VERSION` `pocket-manager-v13` → `pocket-manager-v14`.
- Commit message: `Add payment method tracking (Cash/Card/bKash/Nagad) with dashboard breakdown`.
- Push to `main` → GitHub Pages redeploys.

## 8. Verification

1. `node --check` on all edited JS files.
2. Headless Chrome test (fake session + fake API):
   - Add expense with method "bKash" → toast success.
   - History row shows pink bKash chip.
   - Payment Methods card shows bKash total.
   - Zero console/page errors.
3. SQL check: `select payment_method, count(*) from expenses group by 1`.

## Edge cases handled

| Case | Behavior |
|---|---|
| Old expenses (NULL method) | No chip in history; grouped as "Other" in summary |
| Empty method on submit | Defaults to Cash |
| Dark mode | All new UI ships with `dark:` variants |
| Currency | Card uses shared `formatCurrency()` → respects ৳ default |
| Per-account data | Column covered by existing RLS policies |

## Files touched

| File | Change |
|---|---|
| `schema.sql` | + payment_method migration |
| `js/app.js` | constants, form field, readRow, payload, chips, summary card render |
| `app.html` | Payment Methods card markup |
| `js/settings.js` | CSV + PNG export columns |
| `*.html`, `sw.js` | version bumps |

No new pages, no auth changes, no contact changes.
