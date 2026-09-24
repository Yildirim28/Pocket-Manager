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
        .forEach((meta) => meta.setAttribute('content', dark ? '#06201e' : '#eef6f4'));
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
    emerald: { label: 'Teal', from: '#14b8a6', to: '#5eead4', soft: 'rgba(20,184,166,0.16)', text: '#0f766e', ink: '#04211d' },
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
:root{--pm-accent:#14b8a6;--pm-accent-to:#5eead4;--pm-accent-soft:rgba(20,184,166,0.16);--pm-accent-text:#0f766e;--pm-accent-ink:#04211d}
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
    /* Illustrated round avatars (SVG) */
    { id: 'hex-luna', label: 'Luna', anim: 'pm-anim-3d', hex: { bg: ['#b8e986', '#76c442'], skin: '#f7d3b2', hair: '#1f6f63', hairAlt: '#17554c', style: 'bob', shirt: '#2fa36b' } },
    { id: 'hex-nina', label: 'Nina', anim: 'pm-anim-3d', hex: { bg: ['#ff9db8', '#f9628f'], skin: '#f4c7a3', hair: '#7a4a35', hairAlt: '#633a29', style: 'bun', glasses: '#4b3426', shirt: '#d94f6e' } },
    { id: 'hex-leo', label: 'Leo', anim: 'pm-anim-3d', hex: { bg: ['#c4a28a', '#a17c63'], skin: '#e8b184', hair: '#6b4130', hairAlt: '#573324', style: 'short', shirt: '#8c4a3a' } },
    { id: 'hex-ella', label: 'Ella', anim: 'pm-anim-3d', hex: { bg: ['#a78bfa', '#8b5cf6'], skin: '#f7d3b2', hair: '#f9d77a', hairAlt: '#eec25f', style: 'long', shirt: '#f2b33d' } },
    { id: 'hex-kai', label: 'Kai', anim: 'pm-anim-3d', hex: { bg: ['#7dd3fc', '#3b9ae1'], skin: '#f0bd93', hair: '#232a33', hairAlt: '#161b22', style: 'short', glasses: '#1f242b', shirt: '#232a33' } },
    { id: 'hex-zara', label: 'Zara', anim: 'pm-anim-3d', hex: { bg: ['#fca5a5', '#f43f5e'], skin: '#8a5a3b', hair: '#241a14', hairAlt: '#171009', style: 'curly', shirt: '#f472b6' } },
    { id: 'hex-milo', label: 'Milo', anim: 'pm-anim-3d', hex: { bg: ['#fdba74', '#f97316'], skin: '#f2c299', hair: '#3f2d20', hairAlt: '#2f2016', style: 'tuft', shirt: '#ea580c' } },
    { id: 'hex-ivy', label: 'Ivy', anim: 'pm-anim-3d', hex: { bg: ['#6ee7b7', '#10b981'], skin: '#d99a6c', hair: '#2f2a26', hairAlt: '#1f1c19', style: 'pony', shirt: '#0d9488' } },
    /* Boys */
    { id: 'hex-tom', label: 'Tom · Boy', anim: 'pm-anim-3d', hex: { bg: ['#7dd3fc', '#0ea5e9'], skin: '#fad7b5', hair: '#8a5a2b', hairAlt: '#6f4722', style: 'bowl', shirt: '#0284c7' } },
    { id: 'hex-sam', label: 'Sam · Boy', anim: 'pm-anim-3d', hex: { bg: ['#fde047', '#facc15'], skin: '#f0bd93', hair: '#4b3621', hairAlt: '#382815', style: 'tuft', shirt: '#eab308' } },
    /* Men */
    { id: 'hex-david', label: 'David · Man', anim: 'pm-anim-3d', hex: { bg: ['#a5b4fc', '#6366f1'], skin: '#e8b184', hair: '#2f2a26', hairAlt: '#1f1c19', style: 'short', shirt: '#4f46e5' } },
    { id: 'hex-marco', label: 'Marco · Man', anim: 'pm-anim-3d', hex: { bg: ['#cbd5e1', '#64748b'], skin: '#d99a6c', hair: '#26201b', hairAlt: '#171310', style: 'short', beard: '#2f2721', shirt: '#334155' } },
    /* Old men */
    { id: 'hex-walter', label: 'Walter · Elder', anim: 'pm-anim-3d', hex: { bg: ['#86efac', '#22c55e'], skin: '#eec9a4', hair: '#d4d4d4', hairAlt: '#b8b8b8', style: 'bald', beard: '#e2e2e2', shirt: '#166534' } },
    { id: 'hex-george', label: 'George · Elder', anim: 'pm-anim-3d', hex: { bg: ['#fdba74', '#fb923c'], skin: '#e8bd97', hair: '#c0c0c0', hairAlt: '#a8a8a8', style: 'short', glasses: '#444444', shirt: '#c2410c' } },
    /* Ladies */
    { id: 'hex-rose', label: 'Rose · Lady', anim: 'pm-anim-3d', hex: { bg: ['#fca5a5', '#ef4444'], skin: '#f7d3b2', hair: '#a16207', hairAlt: '#854f0d', style: 'long', shirt: '#dc2626' } },
    { id: 'hex-evelyn', label: 'Evelyn · Elder', anim: 'pm-anim-3d', hex: { bg: ['#67e8f9', '#06b6d4'], skin: '#eec9a4', hair: '#d9d9d9', hairAlt: '#bfbfbf', style: 'bun', glasses: '#555555', shirt: '#0e7490' } },
    /* Emoji characters, ancient ➜ modern. Each with its own motion effect.
       Stored on the account (syncs devices). */
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

/* -------------------------------------------------------------
   ROUND AVATARS — illustrated faces drawn as inline SVG inside a
   round border. The face layer gently tilts in 3D while the frame
   stays still. Scales cleanly at any size.
------------------------------------------------------------- */
const AVATAR_R = 46; /* face layer radius (sits inside the frame) */

function hexHairMarkup(style, h, alt) {
    switch (style) {
        case 'bob':
            return (
                `<path d="M28,56 Q26,24 50,24 Q74,24 72,56 L68,64 Q66,46 64,40 Q56,31 50,31 Q44,31 36,40 Q34,46 32,64 Z" fill="${h}"/>` +
                `<path d="M34,38 Q42,29 56,32 Q64,34 67,41 Q58,33 46,35 Q39,36 34,38 Z" fill="${alt}"/>`
            );
        case 'bowl':
            return (
                `<path d="M30,54 Q28,24 50,24 Q72,24 70,54 L66,58 Q67,40 62,34 Q54,29 46,31 Q35,34 33,44 Q32,50 34,58 Z" fill="${h}"/>` +
                `<path d="M33,42 Q41,31 55,33 Q64,35 67,43 Q57,35 45,37 Q38,38 33,42 Z" fill="${alt}"/>`
            );
        case 'bun':
            return (
                `<circle cx="50" cy="21" r="7.5" fill="${h}"/>` +
                `<path d="M31,52 Q31,26 50,26 Q69,26 69,52 Q67,40 62,36 Q54,31 44,34 Q34,38 31,52 Z" fill="${h}"/>` +
                `<path d="M33,40 Q42,31 55,33 Q63,35 67,42 Q57,35 45,37 Q38,38 33,40 Z" fill="${alt}"/>`
            );
        case 'long':
            return (
                `<path d="M27,70 Q24,24 50,24 Q76,24 73,70 L67,74 Q68,46 64,38 Q56,30 50,30 Q44,30 36,38 Q32,46 33,74 Z" fill="${h}"/>` +
                `<path d="M31,42 Q36,29 50,29 Q64,29 69,42 Q60,33 48,35 Q38,36 31,42 Z" fill="${alt}"/>`
            );
        case 'curly':
            return (
                `<g fill="${h}"><circle cx="35" cy="34" r="9"/><circle cx="50" cy="27" r="10"/><circle cx="65" cy="34" r="9"/><circle cx="31" cy="45" r="7"/><circle cx="69" cy="45" r="7"/></g>` +
                `<path d="M35,44 Q42,34 55,36 Q63,38 66,45 Q57,38 46,40 Q39,41 35,44 Z" fill="${alt}"/>`
            );
        case 'tuft':
            return (
                `<path d="M32,46 Q33,27 50,27 Q67,27 68,46 Q64,36 56,33 Q52,28 55,24 Q46,26 44,32 Q36,35 32,46 Z" fill="${h}"/>` +
                `<path d="M36,37 Q44,30 55,32 Q62,34 65,39 Q56,33 45,35 Q40,36 36,37 Z" fill="${alt}"/>`
            );
        case 'pony':
            return (
                `<path d="M67,38 Q81,44 74,62 Q77,44 67,38 Z" fill="${alt}"/>` +
                `<circle cx="71" cy="36" r="6" fill="${h}"/>` +
                `<path d="M31,50 Q31,25 50,25 Q69,25 69,50 Q67,38 61,34 Q54,30 44,33 Q34,37 31,50 Z" fill="${h}"/>` +
                `<path d="M33,40 Q41,31 54,33 Q62,35 66,42 Q56,35 44,37 Q38,38 33,40 Z" fill="${alt}"/>`
            );
        case 'bald':
            return (
                `<path d="M30,52 Q30,36 40,33 Q34,40 33,54 Z" fill="${h}"/>` +
                `<path d="M70,52 Q70,36 60,33 Q66,40 67,54 Z" fill="${h}"/>` +
                `<path d="M33,44 Q38,37 45,36 L44,40 Q39,41 36,47 Z" fill="${alt}"/>` +
                `<path d="M67,44 Q62,37 55,36 L56,40 Q61,41 64,47 Z" fill="${alt}"/>`
            );
        default: /* short */
            return (
                `<path d="M32,48 Q32,26 50,26 Q68,26 68,48 Q66,37 59,33 Q54,31 47,32 Q37,35 32,48 Z" fill="${h}"/>` +
                `<path d="M36,38 Q44,30 56,32 Q63,34 66,40 Q56,33 45,35 Q40,36 36,38 Z" fill="${alt}"/>`
            );
    }
}

function roundAvatarSvg(a, sizeClass = '') {
    const p = a.hex;
    const gid = `pmHexBg-${a.id}`;
    const clipId = `pmHexClip-${a.id}`;
    return (
        `<svg viewBox="0 0 100 100" class="${sizeClass}" role="img" aria-label="${a.label}" xmlns="http://www.w3.org/2000/svg">` +
        `<defs>` +
        `<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="${p.bg[0]}"/><stop offset="1" stop-color="${p.bg[1]}"/>` +
        `</linearGradient>` +
        `<clipPath id="${clipId}"><circle cx="50" cy="50" r="${AVATAR_R}"/></clipPath>` +
        `</defs>` +
        `<g clip-path="url(#${clipId})">` +
        `<circle cx="50" cy="50" r="${AVATAR_R}" fill="url(#${gid})"/>` +
        `<path d="M18,100 Q22,72 50,72 Q78,72 82,100 Z" fill="${p.shirt}"/>` +
        `<rect x="44" y="54" width="12" height="14" rx="5" fill="${p.skin}"/>` +
        hexHairMarkup(p.style, p.hair, p.hairAlt) +
        `<ellipse cx="50" cy="47" rx="16.5" ry="18.5" fill="${p.skin}"/>` +
        hexHairMarkup(p.style, p.hair, p.hairAlt) +
        (p.beard
            ? `<path d="M35,52 Q34,70 50,73 Q66,70 65,52 Q63,63 57,66 Q53,68 50,68 Q47,68 43,66 Q37,63 35,52 Z" fill="${p.beard}"/>`
            : '') +
        `<circle cx="43.5" cy="48" r="2.2" fill="#2b2b2b"/>` +
        `<circle cx="56.5" cy="48" r="2.2" fill="#2b2b2b"/>` +
        `<path d="M45,57 Q50,61.5 55,57" stroke="#b0654f" stroke-width="2" stroke-linecap="round" fill="none"/>` +
        (p.glasses
            ? `<g stroke="${p.glasses}" stroke-width="2" fill="none">` +
              `<circle cx="43.5" cy="48" r="6.5"/><circle cx="56.5" cy="48" r="6.5"/>` +
              `<path d="M50,48 h0 M49.8,47.4 h0.4"/><path d="M37,47 L31.5,45.5"/><path d="M63,47 L68.5,45.5"/></g>`
            : '') +
        `</g>` +
        '</svg>'
    );
}

/* Round frame + 3D-tilting face layer. */
function roundAvatarHtml(avatar, sizeClass, extraClasses = '') {
    return (
        `<span class="relative inline-flex ${sizeClass} shrink-0 overflow-hidden rounded-full ring-2 ring-white shadow-md dark:ring-slate-700 ${extraClasses}">` +
        `<span class="pm-avatar-3d block h-full w-full" role="img" aria-label="${avatar.label}">` +
        roundAvatarSvg(avatar, 'h-full w-full') +
        '</span></span>'
    );
}

/* Inner face markup for any avatar (round SVG or emoji). */
function avatarFaceHtml(avatar, textClass = 'text-lg') {
    if (avatar.hex) return roundAvatarSvg(avatar, 'h-full w-full');
    return `<span class="${textClass} ${avatar.anim}" role="img" aria-label="${avatar.label}">${avatar.emoji}</span>`;
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
    if (avatar.hex) return roundAvatarHtml(avatar, s.ring, extraClasses);
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
@keyframes pm-avatar-3d{0%,100%{transform:perspective(300px) rotateY(-14deg) rotateX(5deg) scale(1.12)}25%{transform:perspective(300px) rotateY(0deg) rotateX(0deg) scale(1.12)}50%{transform:perspective(300px) rotateY(14deg) rotateX(-5deg) scale(1.12)}75%{transform:perspective(300px) rotateY(0deg) rotateX(0deg) scale(1.12)}}
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
.pm-avatar-3d{animation:pm-avatar-3d 5s ease-in-out infinite;transform-origin:center;display:inline-block;will-change:transform}
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
  [class^="pm-anim-"],.pm-avatar-3d{animation:none !important}
  .pm-avatar-3d{transform:scale(1.12) !important}
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
        const inner = a.hex
            ? `<span class="pm-avatar-3d block h-full w-full">${roundAvatarSvg(a, 'h-full w-full')}</span>`
            : `<span class="text-2xl ${a.anim}">${a.emoji}</span>`;
        const well = a.hex
            ? `<span class="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full ring-2 ring-white shadow-md dark:ring-slate-700">`
            : `<span class="flex h-14 w-14 items-center justify-center rounded-full bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700">`;
        return (
            `<button type="button" data-avatar="${a.id}" title="${a.label}" aria-label="${a.label}" ` +
            'class="group flex flex-col items-center gap-1.5 rounded-2xl p-2 transition-colors ' +
            (active
                ? 'bg-indigo-50 dark:bg-indigo-500/15 ring-2 ring-indigo-400'
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 ring-1 ring-transparent') +
            '">' +
            well +
            inner +
            '</span>' +
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
            showToast(`Avatar set to ${avatar.emoji ? avatar.emoji + ' ' : ''}${avatar.label}`, 'success');
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
        { page: 'history', href: 'history.html', label: 'History' },
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

    /* Mobile bottom tab bar (signed-in only), like a native banking app. */
    const tabLinks = [
        { page: 'dashboard', href: 'app.html', label: 'Home', icon: 'house' },
        { page: 'history', href: 'history.html', label: 'History', icon: 'receipt-text' },
        { page: 'feedback', href: 'feedback.html', label: 'Feedback', icon: 'message-square' },
        { page: 'settings', href: 'settings.html', label: 'Settings', icon: 'settings' }
    ];
    const tabbar = user
        ? '<nav class="pm-tabbar flex items-stretch gap-1" aria-label="Quick navigation">' +
          tabLinks
              .map(
                  (t) =>
                      `<a href="${t.href}" class="pm-tabbar-item"${t.page === current ? ' aria-current="page"' : ''}>` +
                      `<i data-lucide="${t.icon}" class="h-5 w-5"></i><span>${t.label}</span></a>`
              )
              .join('') +
          '</nav>'
        : '';

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
        '</header>' +
        tabbar;

    document.body.classList.toggle('pm-has-tabbar', !!user);

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
