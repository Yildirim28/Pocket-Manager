/* =============================================================
   Pocket Manager — js/site.js
   Shared helpers: navbar, toasts, formatting, auth utilities.
   Each page sets <body data-page="..."> for nav highlighting.
   ============================================================= */

'use strict';

/* -------------------------------------------------------------
   FORMATTING UTILITIES (shared across pages)
------------------------------------------------------------- */
function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
        Number(value) || 0
    );
}

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

function loadBudget() {
    const stored = Number(localStorage.getItem(BUDGET_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_MONTHLY_BUDGET;
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
    const styles = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-slate-800' };
    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.className =
        `${styles[type] || styles.info} pointer-events-auto w-full max-w-sm rounded-lg px-4 py-3 ` +
        'text-sm font-medium text-white shadow-lg opacity-0 translate-y-2 transition-all duration-300';
    toast.textContent = message;
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

function isDark() {
    return document.documentElement.classList.contains('dark');
}

function applyTheme(dark) {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
}

function toggleTheme() {
    applyTheme(!isDark());
    syncThemeControls();
    showToast(isDark() ? 'Dark mode on 🌙' : 'Light mode on ☀️', 'info');
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
    // Apply persisted theme (head script already set it pre-paint).
    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === 'dark');

    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
        btn.addEventListener('click', toggleTheme);
    });
    syncThemeControls();
}

/* -------------------------------------------------------------
   ACCENT COLOR (user preference, persisted in localStorage)
------------------------------------------------------------- */
const ACCENT_STORAGE_KEY = 'pocket-manager:accent';

const ACCENTS = {
    indigo: { label: 'Indigo', from: '#4f46e5', to: '#8b5cf6', soft: '#eef2ff', text: '#4f46e5' },
    blue: { label: 'Ocean', from: '#2563eb', to: '#06b6d4', soft: '#eff6ff', text: '#2563eb' },
    emerald: { label: 'Emerald', from: '#059669', to: '#34d399', soft: '#ecfdf5', text: '#059669' },
    rose: { label: 'Rose', from: '#e11d48', to: '#fb7185', soft: '#fff1f2', text: '#e11d48' },
    amber: { label: 'Amber', from: '#d97706', to: '#fbbf24', soft: '#fffbeb', text: '#d97706' },
    violet: { label: 'Violet', from: '#7c3aed', to: '#c084fc', soft: '#f5f3ff', text: '#7c3aed' }
};

/* The app is styled with indigo utilities; these overrides remap
   them to CSS variables so the accent can change at runtime. */
function injectAccentStyles() {
    if (document.getElementById('pmAccentStyle')) return;
    const style = document.createElement('style');
    style.id = 'pmAccentStyle';
    style.textContent = `
:root{--pm-accent:#4f46e5;--pm-accent-to:#8b5cf6;--pm-accent-soft:#eef2ff;--pm-accent-text:#4f46e5}
.bg-indigo-600{background-color:var(--pm-accent)!important}
.from-indigo-600{--tw-gradient-from:var(--pm-accent)!important}
.via-violet-600{--tw-gradient-via:var(--pm-accent-to)!important}
.to-violet-600{--tw-gradient-to:var(--pm-accent-to)!important}
.text-indigo-600{color:var(--pm-accent)!important}
.text-indigo-700{color:var(--pm-accent-text)!important}
.hover\\:text-indigo-700:hover{color:var(--pm-accent-text)!important}
.bg-indigo-50{background-color:var(--pm-accent-soft)!important}
.hover\\:bg-indigo-50:hover{background-color:var(--pm-accent-soft)!important}
.border-indigo-200{border-color:var(--pm-accent-soft)!important}
.border-indigo-100{border-color:var(--pm-accent-soft)!important}
.focus\\:border-indigo-500:focus{border-color:var(--pm-accent)!important}
.focus\\:ring-indigo-200:focus{--tw-ring-color:var(--pm-accent-soft)!important}
.ring-indigo-200{--tw-ring-color:var(--pm-accent-soft)!important}
.focus\\:ring-indigo-500:focus{--tw-ring-color:var(--pm-accent)!important}`;
    document.head.appendChild(style);
}

function applyAccent(key) {
    const accent = ACCENTS[key] || ACCENTS.indigo;
    const root = document.documentElement.style;
    root.setProperty('--pm-accent', accent.from);
    root.setProperty('--pm-accent-to', accent.to);
    root.setProperty('--pm-accent-soft', accent.soft);
    root.setProperty('--pm-accent-text', accent.text);
    if (key !== localStorage.getItem(ACCENT_STORAGE_KEY)) {
        localStorage.setItem(ACCENT_STORAGE_KEY, key);
    }
}

function initAccent() {
    injectAccentStyles();
    applyAccent(localStorage.getItem(ACCENT_STORAGE_KEY) || 'indigo');
}

/* Renders swatch buttons into #accentPicker (settings page). */
/* Marks the active swatch in #accentPicker (static HTML on the
   settings page) and wires click handlers. */
function initAccentPicker() {
    const mount = document.getElementById('accentPicker');
    if (!mount) return;
    const current = localStorage.getItem(ACCENT_STORAGE_KEY) || 'indigo';

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
   NAVBAR (auth-aware, injected into #navbar placeholder)
------------------------------------------------------------- */
const NAV_LOGO = '<i data-lucide="wallet" class="h-6 w-6"></i>';

function navLinkClass(page, current) {
    return (
        'rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
        (page === current
            ? 'bg-indigo-50 text-indigo-700'
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
        { page: 'settings', href: 'settings.html', label: 'Settings' }
    ];
    const links = user ? [...publicLinks.slice(0, 1), ...privateLinks, publicLinks[1]] : publicLinks;

    const desktopLinks = links
        .map((l) => `<a href="${l.href}" class="${navLinkClass(l.page, current)}">${l.label}</a>`)
        .join('');

    const installButton =
        '<button id="install-btn" type="button" title="Install Pocket Manager as an app" ' +
        'class="hidden items-center gap-1.5 rounded-lg border border-indigo-100 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50">' +
        '<i data-lucide="monitor-smartphone" class="h-4 w-4"></i>' +
        'Install app' +
        '</button>';

    const themeToggleButton =
        '<button type="button" data-theme-toggle aria-label="Switch to dark mode" title="Switch to dark mode" ' +
        'class="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">' +
        '<i data-lucide="moon" class="h-5 w-5"></i>' +
        '</button>';

    const authArea = user
        ? `<div class="hidden items-center gap-2 md:flex">
               <span class="max-w-[180px] truncate rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300" title="${escapeHTML(email)}">${escapeHTML(displayName)}</span>
               ${installButton}
               ${themeToggleButton}
               <button id="signOutBtn" type="button"
                   class="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400">
                   <i data-lucide="log-out" class="h-4 w-4"></i>
                   Sign out
               </button>
           </div>`
        : `<div class="hidden items-center gap-2 md:flex">
               ${themeToggleButton}
               ${installButton}
               <a href="login.html" class="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">Sign in</a>
               <a href="signup.html" class="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition-all hover:brightness-110">
                   Get started
                   <i data-lucide="arrow-right" class="h-3.5 w-3.5"></i>
               </a>
           </div>`;

    const mobileLinks = links
        .map((l) => `<a href="${l.href}" class="block rounded-lg px-3 py-2 text-sm font-medium ${l.page === current ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">${l.label}</a>`)
        .join('');

    const mobileInstallButton =
        '<button id="install-btn-mobile" type="button" ' +
        'class="hidden w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-100 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-indigo-700">' +
        '<i data-lucide="monitor-smartphone" class="h-4 w-4"></i> Install app</button>';

    const mobileAuth = user
        ? `<div class="border-t border-slate-100 pt-3 dark:border-slate-800">
               <p class="mb-2 truncate px-3 text-xs font-medium text-slate-400 dark:text-slate-500">${escapeHTML(displayName)}</p>
               <div class="flex items-center gap-2">
                   ${mobileInstallButton}
                   <button type="button" data-theme-toggle aria-label="Switch to dark mode"
                       class="theme-toggle-mobile inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                       <i data-lucide="moon" class="h-5 w-5"></i>
                   </button>
               </div>
               <button id="signOutBtnMobile" type="button"
                   class="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                   <i data-lucide="log-out" class="h-4 w-4"></i> Sign out
               </button>
           </div>`
        : `<div class="border-t border-slate-100 pt-3 dark:border-slate-800">
               <div class="flex items-center gap-2">
                   ${mobileInstallButton}
                   <button type="button" data-theme-toggle aria-label="Switch to dark mode"
                       class="theme-toggle-mobile inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                       <i data-lucide="moon" class="h-5 w-5"></i>
                   </button>
               </div>
               <a href="login.html" class="mt-1 block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Sign in</a>
               <a href="signup.html" class="mt-1 flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-sm font-semibold text-white">Get started <i data-lucide="arrow-right" class="h-3.5 w-3.5"></i></a>
           </div>`;

    mount.innerHTML =
        '<header class="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">' +
        '<nav class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 rounded-2xl border border-white/40 bg-white/60 px-3 shadow-xl shadow-slate-900/5 backdrop-blur-xl backdrop-saturate-150 dark:border-slate-700/60 dark:bg-slate-900/60 dark:shadow-black/20 sm:px-4" aria-label="Main navigation">' +
        '<a href="index.html" class="flex min-w-0 items-center gap-3">' +
        '<span class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30">' + NAV_LOGO + '</span>' +
        '<span><span class="block text-lg font-extrabold leading-tight tracking-tight text-slate-900 dark:text-slate-100">Pocket Manager</span>' +
        '<span class="block text-xs font-medium text-slate-400 dark:text-slate-500">Manual expense tracking</span></span>' +
        '</a>' +
        `<div class="hidden items-center gap-1 md:flex">${desktopLinks}</div>` +
        authArea +
        '<button id="navToggle" type="button" aria-label="Toggle menu" aria-expanded="false" ' +
        'class="rounded-lg p-2 text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden">' +
        '<i data-lucide="menu" class="h-6 w-6"></i>' +
        '</button>' +
        '</nav>' +
        `<div id="navMobileMenu" class="mx-auto mt-2 hidden max-w-6xl rounded-2xl border border-white/40 bg-white/70 p-3 shadow-xl shadow-slate-900/5 backdrop-blur-xl backdrop-saturate-150 dark:border-slate-700/60 dark:bg-slate-900/70 dark:shadow-black/20 md:hidden">${mobileLinks}${mobileAuth}</div>` +
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
    initServiceWorker();

    // The Supabase SDK may still be loading from the fallback CDN —
    // retry for up to 10s before giving up on auth-aware features.
    for (let i = 0; i < 50 && !sb; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        pmInitClient();
    }

    const session = await getSession();
    renderNavbar(session);

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
