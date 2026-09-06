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
   NAVBAR (auth-aware, injected into #navbar placeholder)
------------------------------------------------------------- */
const NAV_LOGO =
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" ' +
    'stroke="currentColor" class="h-6 w-6" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />' +
    '</svg>';

function navLinkClass(page, current) {
    return (
        'rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
        (page === current
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
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

    const authArea = user
        ? `<div class="hidden items-center gap-3 md:flex">
               <span class="max-w-[200px] truncate text-sm font-medium text-slate-700" title="${escapeHTML(email)}">${escapeHTML(displayName)}</span>
               <button id="signOutBtn" type="button"
                   class="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200">
                   Sign out
               </button>
           </div>`
        : `<div class="hidden items-center gap-2 md:flex">
               <a href="login.html" class="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">Sign in</a>
               <a href="signup.html" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700">Get started</a>
           </div>`;

    const mobileLinks = links
        .map((l) => `<a href="${l.href}" class="block rounded-lg px-3 py-2 text-sm font-medium ${l.page === current ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}">${l.label}</a>`)
        .join('');

    const mobileAuth = user
        ? `<div class="border-t border-slate-200 pt-3">
               <p class="mb-2 truncate px-3 text-xs text-slate-400">${escapeHTML(displayName)}</p>
               <button id="signOutBtnMobile" type="button"
                   class="w-full rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Sign out</button>
           </div>`
        : `<div class="border-t border-slate-200 pt-3">
               <a href="login.html" class="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Sign in</a>
               <a href="signup.html" class="mt-1 block rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white">Get started</a>
           </div>`;

    mount.innerHTML =
        '<header class="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">' +
        '<nav class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4" aria-label="Main navigation">' +
        '<a href="index.html" class="flex items-center gap-3">' +
        `<span class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">${NAV_LOGO}</span>` +
        '<span><span class="block text-lg font-bold leading-tight text-slate-900">Pocket Manager</span>' +
        '<span class="block text-xs text-slate-500">Manual expense tracking</span></span>' +
        '</a>' +
        `<div class="hidden items-center gap-1 md:flex">${desktopLinks}</div>` +
        authArea +
        '<button id="navToggle" type="button" aria-label="Toggle menu" aria-expanded="false" ' +
        'class="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden">' +
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-6 w-6">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>' +
        '</button>' +
        '</nav>' +
        `<div id="navMobileMenu" class="hidden border-t border-slate-200 bg-white px-4 py-3 md:hidden">${mobileLinks}${mobileAuth}</div>` +
        '</header>';

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
