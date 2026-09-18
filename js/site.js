/* =============================================================
   Pocket Manager — js/site.js
   Shared helpers: navbar, toasts, formatting, auth utilities.
   Each page sets <body data-page="..."> for nav highlighting.
   ============================================================= */

'use strict';

/* -------------------------------------------------------------
   CURRENCY (user preference, persisted in localStorage)
------------------------------------------------------------- */
const CURRENCY_STORAGE_KEY = 'pocket-manager:currency';

const CURRENCIES = {
    BDT: { label: 'Bangladeshi Taka (৳)', code: 'BDT', locale: 'en-IN', symbol: '৳' },
    USD: { label: 'US Dollar ($)', code: 'USD', locale: 'en-US', symbol: '$' },
    EUR: { label: 'Euro (€)', code: 'EUR', locale: 'de-DE', symbol: '€' },
    GBP: { label: 'British Pound (£)', code: 'GBP', locale: 'en-GB', symbol: '£' },
    INR: { label: 'Indian Rupee (₹)', code: 'INR', locale: 'en-IN', symbol: '₹' },
    JPY: { label: 'Japanese Yen (¥)', code: 'JPY', locale: 'ja-JP', symbol: '¥' }
};

function currentCurrency() {
    return CURRENCIES[localStorage.getItem(CURRENCY_STORAGE_KEY)] || CURRENCIES.BDT;
}

function currencySymbol() {
    return currentCurrency().symbol;
}

function formatCurrency(value) {
    const currency = currentCurrency();
    const amount = Number(value) || 0;

    // BDT: Intl renders the code "BDT" or Bengali numerals depending
    // on locale — use the ৳ symbol with familiar digits instead.
    if (currency.code === 'BDT') {
        const num = new Intl.NumberFormat('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
        return `${currency.symbol} ${num}`;
    }

    return new Intl.NumberFormat(currency.locale, {
        style: 'currency',
        currency: currency.code,
        maximumFractionDigits: 2
    }).format(amount);
}

function initCurrencyPicker() {
    const mount = document.getElementById('currencyPicker');
    const current = localStorage.getItem(CURRENCY_STORAGE_KEY) || 'BDT';

    // Update any static currency-prefix spans on the page.
    document.querySelectorAll('span[data-currency-symbol]').forEach((el) => {
        el.textContent = currencySymbol();
    });

    if (!mount) return;

    mount.innerHTML = Object.entries(CURRENCIES)
        .map(
            ([key, c]) =>
                `<option value="${key}"${key === current ? ' selected' : ''}>${c.label}</option>`
        )
        .join('');

    if (!mount.dataset.wired) {
        mount.dataset.wired = '1';
        mount.addEventListener('change', () => {
            localStorage.setItem(CURRENCY_STORAGE_KEY, mount.value);
            showToast(`Currency set to ${CURRENCIES[mount.value].label} ${CURRENCIES[mount.value].symbol}`, 'success');
            // Re-render the whole page so every amount updates.
            window.location.reload();
        });
    }
}

/* -------------------------------------------------------------
   FORMATTING UTILITIES (shared across pages)
------------------------------------------------------------- */

function todayLocalISO() {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');
}

function currentMonthKey() {
    return todayLocalISO().slice(0, 7);
}

function formatDate(dateStr) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
    if (!match) return '—';
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimestamp(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function escapeHTML(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/* Budget lives in the ACCOUNT (Supabase user metadata) so it follows
   the user to every device, with a per-user localStorage cache for
   instant offline loads and as a fallback when metadata is missing. */
const BUDGET_META_KEY = 'monthly_budget';

function budgetStorageKey(userId) {
    return userId ? `pocket-manager:budget:${userId}` : BUDGET_STORAGE_KEY;
}

/* Budget saved on the account itself (syncs across devices). */
function budgetFromUser(user) {
    const raw = user?.user_metadata?.[BUDGET_META_KEY];
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
}

/* Persist the budget to the account so other devices pick it up. */
async function saveBudgetToAccount(user, value) {
    if (!sb || !user) return false;
    const { error } = await sb.auth.updateUser({
        data: { [BUDGET_META_KEY]: value }
    });
    if (error) return false;
    // Keep the local session copy in sync immediately.
    if (user.user_metadata) user.user_metadata[BUDGET_META_KEY] = value;
    return true;
}

/* Local cache read (fast path / offline fallback). */
function loadBudget(userId) {
    const key = budgetStorageKey(userId);
    let stored = Number(localStorage.getItem(key));

    // One-time migration: adopt the old shared value for this user.
    if (userId && !Number.isFinite(stored)) {
        const legacy = Number(localStorage.getItem(BUDGET_STORAGE_KEY));
        if (Number.isFinite(legacy) && legacy > 0) {
            localStorage.setItem(key, String(legacy));
            return legacy;
        }
    }

    return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_MONTHLY_BUDGET;
}

/* Write the local cache (and optionally the account). */
function saveBudget(value, userId, user) {
    if (userId) localStorage.setItem(budgetStorageKey(userId), String(value));
    if (user) return saveBudgetToAccount(user, value);
    return Promise.resolve(false);
}

/* -------------------------------------------------------------
   TOAST NOTIFICATIONS
------------------------------------------------------------- */
function ensureToastContainer() {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.setAttribute('aria-live', 'polite');
        container.className = 'fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2';
        document.body.appendChild(container);
    }
    return container;
}

function showToast(message, type = 'info') {
    const dot = {
        success: 'var(--pm-accent)',
        error: '#f87171',
        info: 'var(--pm-border-strong)'
    }[type] || 'var(--pm-border-strong)';

    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.className =
        'pm-glass pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl ' +
        'px-4 py-3 text-sm font-medium shadow-2xl opacity-0 translate-y-2 transition-all duration-300';
    toast.style.color = 'var(--pm-text)';

    const indicator = document.createElement('span');
    indicator.className = 'h-2 w-2 shrink-0 rounded-full';
    indicator.style.background = dot;
    indicator.style.boxShadow = `0 0 12px ${dot}`;

    const label = document.createElement('span');
    label.className = 'min-w-0 flex-1';
    label.textContent = message;

    toast.append(indicator, label);
    ensureToastContainer().appendChild(toast);

    requestAnimationFrame(() => toast.classList.remove('opacity-0', 'translate-y-2'));
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/* -------------------------------------------------------------
   AUTH HELPERS
------------------------------------------------------------- */
async function getSession() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data?.session ?? null;
}

async function requireAuth() {
    const session = await getSession();
    if (!session) {
        window.location.replace('login.html');
        return null;
    }
    return session;
}

/* -------------------------------------------------------------
   DARK MODE (user preference, persisted in localStorage)
------------------------------------------------------------- */
const THEME_STORAGE_KEY = 'pocket-manager:theme';

/* Dark-first: dark unless the OS explicitly prefers light. */
function prefersDark() {
    try {
        return !window.matchMedia('(prefers-color-scheme: light)').matches;
    } catch {
        return true;
    }
}

function storedTheme() {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
}

/* Resolve the theme from the saved choice, else the system preference. */
function resolveDark() {
    const saved = storedTheme();
    if (saved) return saved === 'dark';
    return prefersDark();
}

function isDark() {
    return document.documentElement.classList.contains('dark');
}

function updateThemeColorMeta(dark) {
    document
        .querySelectorAll('meta[name="theme-color"]')
        .forEach((meta) => meta.setAttribute('content', dark ? '#05070d' : '#f4f6fb'));
}

/* persist=true records an explicit user choice; the initial call does
   not, so the app keeps following the OS until the user toggles. */
function applyTheme(dark, persist = true) {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    updateThemeColorMeta(dark);
    if (persist) localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
}

function toggleTheme() {
    applyTheme(!isDark());
    syncThemeControls();
    showToast(isDark() ? 'Dark mode on' : 'Light mode on', 'info');
}

/* Update every theme control (navbar icon buttons, settings
   switch) to reflect the current mode. */
function syncThemeControls() {
    const dark = isDark();

    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
        if (btn.classList.contains('theme-switch')) {
            // Settings-style switch: knob position + track color.
            btn.setAttribute('aria-checked', String(dark));
            const knob = btn.querySelector('.theme-knob');
            if (knob) knob.style.transform = dark ? 'translateX(20px)' : '';
            btn.style.backgroundColor = dark ? 'var(--pm-accent)' : '';
        } else {
            // Navbar icon button: moon in light, sun in dark.
            btn.innerHTML =
                `<i data-lucide="${dark ? 'sun' : 'moon'}" class="h-5 w-5"></i>`;
            btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
            btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
        }
    });
    window.lucide?.createIcons();
}

function initThemeControls() {
    // Head script already painted the resolved theme; do not persist here.
    applyTheme(resolveDark(), false);

    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
        btn.addEventListener('click', toggleTheme);
    });
    syncThemeControls();

    // Follow OS changes until the user makes an explicit choice.
    if (!initThemeControls._wired) {
        initThemeControls._wired = true;
        try {
            window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
                if (storedTheme()) return;
                applyTheme(resolveDark(), false);
                syncThemeControls();
            });
        } catch {
            /* older browsers: no live switching, still fine */
        }
    }
}

/* -------------------------------------------------------------
   ACCENT COLOR (user preference, persisted in localStorage)
------------------------------------------------------------- */
const ACCENT_STORAGE_KEY = 'pocket-manager:accent';

/* Signature default is a mint/emerald "money" accent; the rest are
   retuned for dark surfaces (brighter, cleaner mid-tones). */
const DEFAULT_ACCENT = 'emerald';

const ACCENTS = {
    emerald: { label: 'Mint', from: '#10b981', to: '#34d399', soft: 'rgba(16,185,129,0.14)', text: '#059669', ink: '#04140f' },
    indigo: { label: 'Indigo', from: '#6366f1', to: '#818cf8', soft: 'rgba(99,102,241,0.14)', text: '#4f46e5', ink: '#ffffff' },
    blue: { label: 'Ocean', from: '#3b82f6', to: '#22d3ee', soft: 'rgba(59,130,246,0.14)', text: '#2563eb', ink: '#04140f' },
    violet: { label: 'Violet', from: '#8b5cf6', to: '#c084fc', soft: 'rgba(139,92,246,0.14)', text: '#7c3aed', ink: '#ffffff' },
    rose: { label: 'Rose', from: '#f43f5e', to: '#fb7185', soft: 'rgba(244,63,94,0.14)', text: '#e11d48', ink: '#ffffff' },
    amber: { label: 'Amber', from: '#f59e0b', to: '#fbbf24', soft: 'rgba(245,158,11,0.14)', text: '#d97706', ink: '#0b1220' }
};

/* The app is styled with indigo utilities; these overrides remap
   them to CSS variables so the accent can change at runtime. In dark
   mode the brighter gradient tone is used for legibility on the
   translucent accent-soft background. */
function injectAccentStyles() {
    if (document.getElementById('pmAccentStyle')) return;
    const style = document.createElement('style');
    style.id = 'pmAccentStyle';
    style.textContent = `
:root{--pm-accent:#10b981;--pm-accent-to:#34d399;--pm-accent-soft:rgba(16,185,129,0.14);--pm-accent-text:#059669;--pm-accent-ink:#04140f}
.bg-indigo-600{background-color:var(--pm-accent)!important}
.bg-indigo-500{background-color:var(--pm-accent)!important}
.from-indigo-600{--tw-gradient-from:var(--pm-accent)!important}
.from-indigo-500{--tw-gradient-from:var(--pm-accent)!important}
.via-violet-600{--tw-gradient-via:var(--pm-accent-to)!important}
.to-violet-600{--tw-gradient-to:var(--pm-accent-to)!important}
.to-violet-500{--tw-gradient-to:var(--pm-accent-to)!important}
.text-indigo-600{color:var(--pm-accent-text)!important}
.text-indigo-700{color:var(--pm-accent-text)!important}
.hover\\:text-indigo-700:hover{color:var(--pm-accent-text)!important}
.hover\\:text-indigo-600:hover{color:var(--pm-accent-text)!important}
.bg-indigo-50{background-color:var(--pm-accent-soft)!important}
.bg-indigo-100{background-color:var(--pm-accent-soft)!important}
.hover\\:bg-indigo-50:hover{background-color:var(--pm-accent-soft)!important}
.border-indigo-200{border-color:color-mix(in srgb, var(--pm-accent) 30%, transparent)!important}
.border-indigo-100{border-color:color-mix(in srgb, var(--pm-accent) 22%, transparent)!important}
.focus\\:border-indigo-500:focus{border-color:var(--pm-accent)!important}
.focus\\:ring-indigo-200:focus{--tw-ring-color:color-mix(in srgb, var(--pm-accent) 24%, transparent)!important}
.ring-indigo-200{--tw-ring-color:color-mix(in srgb, var(--pm-accent) 24%, transparent)!important}
.focus\\:ring-indigo-500:focus{--tw-ring-color:var(--pm-accent)!important}
.dark .text-indigo-600{color:var(--pm-accent-to)!important}
.dark .text-indigo-700{color:var(--pm-accent-to)!important}
.dark .hover\\:text-indigo-700:hover{color:var(--pm-accent-to)!important}`;
    document.head.appendChild(style);
}

function applyAccent(key) {
    const accent = ACCENTS[key] || ACCENTS[DEFAULT_ACCENT];
    const root = document.documentElement.style;
    root.setProperty('--pm-accent', accent.from);
    root.setProperty('--pm-accent-to', accent.to);
    root.setProperty('--pm-accent-soft', accent.soft);
    root.setProperty('--pm-accent-text', accent.text);
    root.setProperty('--pm-accent-ink', accent.ink || '#04140f');
    if (key !== localStorage.getItem(ACCENT_STORAGE_KEY)) {
        localStorage.setItem(ACCENT_STORAGE_KEY, key);
    }
}

function initAccent() {
    injectAccentStyles();
    applyAccent(localStorage.getItem(ACCENT_STORAGE_KEY) || DEFAULT_ACCENT);
}

/* Renders swatch buttons into #accentPicker (settings page). */
/* Marks the active swatch in #accentPicker (static HTML on the
   settings page) and wires click handlers. */
function initAccentPicker() {
    const mount = document.getElementById('accentPicker');
    if (!mount) return;
    const current = localStorage.getItem(ACCENT_STORAGE_KEY) || DEFAULT_ACCENT;

    mount.querySelectorAll('button[data-accent]').forEach((button) => {
        const key = button.getAttribute('data-accent');
        const accent = ACCENTS[key];
        if (!accent) return;
        const active = key === current;
        button.style.boxShadow = active
            ? `0 0 0 2px #fff, 0 0 0 4px ${accent.from}`
            : '';
        button.setAttribute('aria-pressed', String(active));

        if (!button.dataset.wired) {
            button.dataset.wired = '1';
            button.addEventListener('click', () => {
                applyAccent(key);
                initAccentPicker();
                showToast(`Accent set to ${ACCENTS[key].label}.`, 'success');
            });
        }
    });
}

/* -------------------------------------------------------------
   PWA INSTALL (custom install button + service worker)
------------------------------------------------------------- */
let deferredInstallPrompt = null;

function isStandalone() {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true
    );
}

function syncInstallButton() {
    const show = !!deferredInstallPrompt && !isStandalone();
    document.querySelectorAll('#install-btn, #install-btn-mobile').forEach((btn) => {
        btn.classList.toggle('hidden', !show);
    });
}

window.addEventListener('beforeinstallprompt', (event) => {
    // Prevent Chrome's default mini-infobar; use our own button.
    event.preventDefault();
    deferredInstallPrompt = event;
    syncInstallButton();
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    syncInstallButton();
    showToast('Pocket Manager installed! Find it on your home screen.', 'success');
});

async function installApp() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    syncInstallButton();
    if (outcome === 'accepted') {
        showToast('Installing Pocket Manager…', 'success');
    }
}

function initInstallButton() {
    document.querySelectorAll('#install-btn, #install-btn-mobile').forEach((btn) => {
        btn.addEventListener('click', installApp);
    });
    syncInstallButton();
}

function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.warn('Service worker registration failed:', err);
        });
    });
}

/* -------------------------------------------------------------
   PROFILE AVATARS — ancient ➜ modern character faces, each with
   its own motion effect. Stored on the account (syncs devices).
------------------------------------------------------------- */
const AVATAR_META_KEY = 'avatar';

const AVATARS = [
    { id: 'apes', emoji: '🦍', label: 'Prehistoric', anim: 'pm-anim-thump' },
    { id: 'caveman', emoji: '🧔', label: 'Stone Age', anim: 'pm-anim-wiggle' },
    { id: 'sage', emoji: '👳', label: 'Ancient Sage', anim: 'pm-anim-floaty' },
    { id: 'scholar', emoji: '👲', label: 'Ancient Scholar', anim: 'pm-anim-nod' },
    { id: 'warrior', emoji: '🥷', label: 'Warrior Age', anim: 'pm-anim-dash' },
    { id: 'royal', emoji: '🤴', label: 'Royal Era', anim: 'pm-anim-shine' },
    { id: 'worker', emoji: '👷', label: 'Industrial Age', anim: 'pm-anim-hammer' },
    { id: 'agent', emoji: '🕵', label: 'Modern Era', anim: 'pm-anim-peek' },
    { id: 'everyone', emoji: '🧑', label: 'Today', anim: 'pm-anim-wave' },
    { id: 'ai', emoji: '🤖', label: 'Future AI', anim: 'pm-anim-pulse' }
];

const DEFAULT_AVATAR_ID = 'everyone';

function avatarById(id) {
    return AVATARS.find((a) => a.id === id) || AVATARS.find((a) => a.id === DEFAULT_AVATAR_ID);
}

/* Avatar chosen on the account (metadata), or the default. */
function avatarFor(user) {
    return avatarById(user?.user_metadata?.[AVATAR_META_KEY]);
}

async function saveAvatarToAccount(user, id) {
    if (!sb || !user) return false;
    const { error } = await sb.auth.updateUser({ data: { [AVATAR_META_KEY]: id } });
    if (error) return false;
    if (user.user_metadata) user.user_metadata[AVATAR_META_KEY] = id;
    return true;
}

/* Animated avatar markup. size: 'sm' (navbar) | 'md' | 'lg' (picker). */
function avatarHtml(user, size = 'sm', extraClasses = '') {
    const avatar = avatarFor(user);
    const sizes = {
        sm: { ring: 'h-9 w-9', text: 'text-lg' },
        md: { ring: 'h-11 w-11', text: 'text-xl' },
        lg: { ring: 'h-14 w-14', text: 'text-2xl' }
    };
    const s = sizes[size] || sizes.sm;
    return (
        `<span class="inline-flex ${s.ring} shrink-0 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700 ${extraClasses}">` +
        `<span class="${s.text} ${avatar.anim}" role="img" aria-label="${avatar.label}">${avatar.emoji}</span>` +
        '</span>'
    );
}

/* Each avatar's motion effect + a reduced-motion opt-out. */
function injectAvatarStyles() {
    if (document.getElementById('pmAvatarStyles')) return;
    const style = document.createElement('style');
    style.id = 'pmAvatarStyles';
    style.textContent = `
@keyframes pm-thump{0%,100%{transform:translateY(0) scaleY(1)}30%{transform:translateY(-22%) scaleY(1.08)}55%{transform:translateY(0) scaleY(.92)}}
@keyframes pm-wiggle{0%,100%{transform:rotate(-10deg)}50%{transform:rotate(10deg)}}
@keyframes pm-floaty{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-16%) rotate(3deg)}}
@keyframes pm-nod{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(14%) rotate(-4deg)}}
@keyframes pm-dash{0%,100%{transform:translateX(-14%) skewX(-6deg)}50%{transform:translateX(14%) skewX(6deg)}}
@keyframes pm-shine{0%,100%{transform:scale(1) rotate(-4deg)}50%{transform:scale(1.14) rotate(4deg)}}
@keyframes pm-hammer{0%,100%{transform:rotate(-22deg)}45%{transform:rotate(14deg)}70%{transform:rotate(-6deg)}}
@keyframes pm-peek{0%,100%{transform:translateX(-10%) rotate(-8deg)}50%{transform:translateX(16%) rotate(8deg)}}
@keyframes pm-wave{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(14deg)}}
@keyframes pm-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}
.pm-anim-thump{animation:pm-thump 1.6s ease-in-out infinite;transform-origin:center bottom;display:inline-block;will-change:transform}
.pm-anim-wiggle{animation:pm-wiggle 1.8s ease-in-out infinite;transform-origin:center bottom;display:inline-block;will-change:transform}
.pm-anim-floaty{animation:pm-floaty 3s ease-in-out infinite;display:inline-block;will-change:transform}
.pm-anim-nod{animation:pm-nod 2.1s ease-in-out infinite;transform-origin:center top;display:inline-block;will-change:transform}
.pm-anim-dash{animation:pm-dash 2s ease-in-out infinite;display:inline-block;will-change:transform}
.pm-anim-shine{animation:pm-shine 2.4s ease-in-out infinite;display:inline-block;will-change:transform}
.pm-anim-hammer{animation:pm-hammer 1.4s ease-in-out infinite;transform-origin:center bottom;display:inline-block;will-change:transform}
.pm-anim-peek{animation:pm-peek 2.6s ease-in-out infinite;display:inline-block;will-change:transform}
.pm-anim-wave{animation:pm-wave 1.9s ease-in-out infinite;transform-origin:center bottom;display:inline-block;will-change:transform}
.pm-anim-pulse{animation:pm-pulse 1.5s ease-in-out infinite;display:inline-block;will-change:transform}
@media (prefers-reduced-motion: reduce){
  [class^="pm-anim-"]{animation:none !important}
}`;
    document.head.appendChild(style);
}

/* Renders the avatar chooser into #avatarPicker (settings page). */
function initAvatarPicker() {
    const mount = document.getElementById('avatarPicker');
    if (!mount) return;
    const current = avatarById(currentAccountUser()?.user_metadata?.[AVATAR_META_KEY]).id;

    mount.innerHTML = AVATARS.map((a) => {
        const active = a.id === current;
        return (
            `<button type="button" data-avatar="${a.id}" title="${a.label}" aria-label="${a.label}" ` +
            'class="group flex flex-col items-center gap-1.5 rounded-2xl p-2 transition-colors ' +
            (active
                ? 'bg-indigo-50 dark:bg-indigo-500/15 ring-2 ring-indigo-400'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 ring-1 ring-transparent') +
            '">' +
            `<span class="flex h-14 w-14 items-center justify-center rounded-full bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700">` +
            `<span class="text-2xl ${a.anim}">${a.emoji}</span></span>` +
            `<span class="text-[10px] font-semibold ${active ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-400 dark:text-slate-500'}">${a.label}</span>` +
            '</button>'
        );
    }).join('');

    mount.querySelectorAll('button[data-avatar]').forEach((button) => {
        button.addEventListener('click', async () => {
            const id = button.getAttribute('data-avatar');
            const user = currentAccountUser();
            if (!user) return;
            button.disabled = true;
            const ok = await saveAvatarToAccount(user, id);
            button.disabled = false;
            if (!ok) {
                showToast('Could not save avatar — check your connection.', 'error');
                return;
            }
            initAvatarPicker();
            renderNavbar({ user });
            const avatar = avatarById(id);
            showToast(`Avatar set to ${avatar.emoji} ${avatar.label}`, 'success');
        });
    });
}

/* Last known signed-in user (set by initSite / page scripts). */
let _pmAccountUser = null;
function setAccountUser(user) {
    _pmAccountUser = user;
}
function currentAccountUser() {
    return _pmAccountUser;
}

/* -------------------------------------------------------------
   NAVBAR (auth-aware, injected into #navbar placeholder)
------------------------------------------------------------- */
const NAV_LOGO = '<i data-lucide="wallet" class="h-6 w-6"></i>';

function navLinkClass(page, current) {
    return (
        'rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200 ' +
        (page === current
            ? 'pm-accent-soft text-indigo-700 ring-1 ring-inset ring-indigo-200'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100')
    );
}

async function signOutAndRedirect() {
    if (sb) await sb.auth.signOut();
    window.location.href = 'index.html';
}

function renderNavbar(session) {
    const mount = document.getElementById('navbar');
    if (!mount) return;

    const current = document.body.dataset.page || '';
    const user = session?.user ?? null;
    const email = user ? user.email : null;
    const rawNickname = user?.user_metadata?.nickname;
    const nickname = typeof rawNickname === 'string' ? rawNickname.trim() : '';
    const displayName = user ? (nickname || email) : null;

    const publicLinks = [
        { page: 'home', href: 'index.html', label: 'Home' },
        { page: 'contact', href: 'contact.html', label: 'Contact' }
    ];
    const privateLinks = [
        { page: 'dashboard', href: 'app.html', label: 'Dashboard' },
        { page: 'feedback', href: 'feedback.html', label: 'Feedback' },
        { page: 'settings', href: 'settings.html', label: 'Settings' }
    ];
    const links = user ? [...publicLinks.slice(0, 1), ...privateLinks, publicLinks[1]] : publicLinks;

    const desktopLinks = links
        .map((l) => `<a href="${l.href}" class="${navLinkClass(l.page, current)}">${l.label}</a>`)
        .join('');

    const installButton =
        '<button id="install-btn" type="button" title="Install Pocket Manager as an app" ' +
        'class="hidden pm-btn pm-btn-outline">' +
        '<i data-lucide="monitor-smartphone" class="h-4 w-4"></i>' +
        '<span class="hidden sm:inline">Install app</span>' +
        '</button>';

    const themeToggleButton =
        '<button type="button" data-theme-toggle aria-label="Switch to dark mode" title="Switch to dark mode" ' +
        'class="pm-icon-btn">' +
        '<i data-lucide="moon" class="h-5 w-5"></i>' +
        '</button>';

    const authArea = user
        ? `<div class="hidden items-center gap-2 md:flex">
               <a href="settings.html" title="Change your avatar in Settings"
                   class="pm-chip max-w-[210px] py-1 pl-1 pr-3 transition-colors hover:border-indigo-200">
                   ${avatarHtml(user, 'sm')}
                   <span class="truncate text-sm font-medium" title="${escapeHTML(email)}">${escapeHTML(displayName)}</span>
               </a>
               ${installButton}
               ${themeToggleButton}
               <button id="signOutBtn" type="button" class="pm-btn pm-btn-ghost" title="Sign out">
                   <i data-lucide="log-out" class="h-4 w-4"></i>
                   <span class="hidden lg:inline">Sign out</span>
               </button>
           </div>`
        : `<div class="hidden items-center gap-2 md:flex">
               ${themeToggleButton}
               ${installButton}
               <a href="login.html" class="pm-btn pm-btn-ghost">Sign in</a>
               <a href="signup.html" class="pm-btn pm-btn-primary">
                   Get started
                   <i data-lucide="arrow-right" class="h-3.5 w-3.5"></i>
               </a>
           </div>`;

    const mobileLinks = links
        .map((l) => `<a href="${l.href}" class="block rounded-lg px-3 py-2 text-sm font-medium ${l.page === current ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">${l.label}</a>`)
        .join('');

    const mobileInstallButton =
        '<button id="install-btn-mobile" type="button" class="hidden pm-btn pm-btn-outline w-full">' +
        '<i data-lucide="monitor-smartphone" class="h-4 w-4"></i> Install app</button>';

    const mobileThemeToggle =
        '<button type="button" data-theme-toggle aria-label="Switch to dark mode" ' +
        'class="pm-icon-btn border border-slate-200 dark:border-slate-700">' +
        '<i data-lucide="moon" class="h-5 w-5"></i>' +
        '</button>';

    const mobileAuth = user
        ? `<div class="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
               <a href="settings.html" class="mb-2 flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                   ${avatarHtml(user, 'md')}
                   <span class="min-w-0">
                       <span class="block truncate text-sm font-semibold">${escapeHTML(displayName)}</span>
                       <span class="block text-[11px] pm-faint">Tap to change avatar</span>
                   </span>
               </a>
               <div class="flex items-center gap-2">
                   ${mobileInstallButton}
                   ${mobileThemeToggle}
               </div>
               <button id="signOutBtnMobile" type="button" class="pm-btn pm-btn-danger mt-2 w-full">
                   <i data-lucide="log-out" class="h-4 w-4"></i> Sign out
               </button>
           </div>`
        : `<div class="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
               <div class="flex items-center gap-2">
                   ${mobileInstallButton}
                   ${mobileThemeToggle}
               </div>
               <a href="login.html" class="pm-btn pm-btn-ghost mt-1 w-full">Sign in</a>
               <a href="signup.html" class="pm-btn pm-btn-primary mt-2 w-full">Get started <i data-lucide="arrow-right" class="h-3.5 w-3.5"></i></a>
           </div>`;

    mount.innerHTML =
        '<header class="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">' +
        '<nav class="pm-glass mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 rounded-2xl px-3 shadow-lg shadow-black/5 dark:shadow-black/40 sm:px-4" aria-label="Main navigation">' +
        '<a href="index.html" class="flex min-w-0 items-center gap-3">' +
        '<span class="pm-icon-tile">' + NAV_LOGO + '</span>' +
        '<span class="min-w-0"><span class="font-display block truncate text-lg font-bold leading-tight">Pocket Manager</span>' +
        '<span class="pm-faint block text-xs font-medium">Manual expense tracking</span></span>' +
        '</a>' +
        `<div class="hidden items-center gap-1 md:flex">${desktopLinks}</div>` +
        authArea +
        '<button id="navToggle" type="button" aria-label="Toggle menu" aria-expanded="false" ' +
        'class="pm-icon-btn md:hidden">' +
        '<i data-lucide="menu" class="h-6 w-6"></i>' +
        '</button>' +
        '</nav>' +
        `<div id="navMobileMenu" class="pm-glass mx-auto mt-2 hidden max-w-6xl rounded-2xl p-3 shadow-xl shadow-black/10 dark:shadow-black/40 md:hidden">${mobileLinks}${mobileAuth}</div>` +
        '</header>';

    // Render Lucide icons inside the injected markup.
    window.lucide?.createIcons();
    initInstallButton();
    initThemeControls();

    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('navMobileMenu');
    toggle?.addEventListener('click', () => {
        const open = !menu.classList.contains('hidden');
        menu.classList.toggle('hidden');
        toggle.setAttribute('aria-expanded', String(!open));
    });

    document.getElementById('signOutBtn')?.addEventListener('click', signOutAndRedirect);
    document.getElementById('signOutBtnMobile')?.addEventListener('click', signOutAndRedirect);

    // Landing page hero CTA swap: "Get started" -> "Open dashboard"
    const heroCta = document.getElementById('heroCta');
    if (user && heroCta) {
        heroCta.textContent = 'Open Dashboard';
        heroCta.href = 'app.html';
    }
}

async function initSite() {
    initAccent();
    initAccentPicker();
    initCurrencyPicker();
    injectAvatarStyles();
    initAvatarPicker();
    initServiceWorker();

    // The Supabase SDK may still be loading from the fallback CDN —
    // retry for up to 10s before giving up on auth-aware features.
    for (let i = 0; i < 50 && !sb; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        pmInitClient();
    }

    const session = await getSession();
    setAccountUser(session?.user ?? null);
    renderNavbar(session);
    if (session?.user) initAvatarPicker();

    // React to sign-in/out happening in another tab.
    if (sb) {
        sb.auth.onAuthStateChange((event, newSession) => {
            if (event === 'SIGNED_OUT') {
                renderNavbar(null);
            }
        });
    }

    const yearEl = document.getElementById('footerYear');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}

document.addEventListener('DOMContentLoaded', initSite);
