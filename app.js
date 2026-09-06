/* =============================================================
   Pocket Manager — app.js
   Vanilla JavaScript (ES6+) client for Supabase PostgREST.
   Loaded with `defer` after the Supabase UMD SDK, so
   window.supabase.createClient is available at startup.
   ============================================================= */

'use strict';

/* -------------------------------------------------------------
   1. CONFIGURATION — replace with your Supabase project values
   Dashboard -> Project Settings -> API
------------------------------------------------------------- */
const SUPABASE_URL = 'https://nsxfulzwojdyyppypmcw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CQW-N2r5gzZTQRE5Fq2y1A_q69IbKNN';

const EXPENSES_TABLE = 'expenses';
const BUDGET_STORAGE_KEY = 'pocket-manager:monthly-budget';
const DEFAULT_MONTHLY_BUDGET = 2000;
const DELETE_ARM_TIMEOUT_MS = 3000;

/* -------------------------------------------------------------
   2. APPLICATION STATE
------------------------------------------------------------- */
let supabaseClient = null;
let expenses = [];
let monthlyBudget = loadBudget();
let armTimer = null;

/* -------------------------------------------------------------
   3. DOM REFERENCES
------------------------------------------------------------- */
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

const totalSpentMonthEl = document.getElementById('totalSpentMonth');
const totalSpentSubEl = document.getElementById('totalSpentSub');
const topCategoryBadgeEl = document.getElementById('topCategoryBadge');
const topCategoryAmountEl = document.getElementById('topCategoryAmount');
const totalCountEl = document.getElementById('totalCount');

const budgetInput = document.getElementById('budgetInput');
const budgetBar = document.getElementById('budgetBar');
const budgetPercentTextEl = document.getElementById('budgetPercentText');
const budgetSpentLabelEl = document.getElementById('budgetSpentLabel');

const expenseForm = document.getElementById('expenseForm');
const expenseFields = document.getElementById('expenseFields');
const descriptionInput = document.getElementById('description');
const descriptionErrorEl = document.getElementById('descriptionError');
const amountInput = document.getElementById('amount');
const amountErrorEl = document.getElementById('amountError');
const categorySelect = document.getElementById('category');
const dateInput = document.getElementById('expenseDate');
const dateErrorEl = document.getElementById('dateError');
const submitButton = document.getElementById('submitButton');
const submitButtonText = document.getElementById('submitButtonText');

const historySection = document.getElementById('historySection');
const historyCountEl = document.getElementById('historyCount');
const loadingStateEl = document.getElementById('loadingState');
const emptyStateEl = document.getElementById('emptyState');
const expenseTableBody = document.getElementById('expenseTableBody');
const expenseListEl = document.getElementById('expenseList');
const refreshButton = document.getElementById('refreshButton');

const toastContainer = document.getElementById('toastContainer');

/* -------------------------------------------------------------
   4. CONSTANTS
------------------------------------------------------------- */
const CATEGORY_COLORS = {
    Food: 'bg-green-100 text-green-800',
    Transport: 'bg-blue-100 text-blue-800',
    Bills: 'bg-red-100 text-red-800',
    Entertainment: 'bg-purple-100 text-purple-800',
    Shopping: 'bg-amber-100 text-amber-800',
    Other: 'bg-slate-100 text-slate-800',
    General: 'bg-indigo-100 text-indigo-800'
};

const TRASH_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" ' +
    'stroke="currentColor" class="h-4 w-4" aria-hidden="true">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />' +
    '</svg>';

const DELETE_BUTTON_CLASSES =
    'inline-flex items-center justify-center rounded-lg p-2 text-slate-400 transition-colors ' +
    'hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500';

const DELETE_ARMED_CLASSES =
    'inline-flex items-center justify-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs ' +
    'font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500';

/* -------------------------------------------------------------
   5. UTILITY LOGIC
------------------------------------------------------------- */
function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(Number(value) || 0);
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

/* Parse a 'YYYY-MM-DD' string as a LOCAL date to avoid
   UTC off-by-one shifts, then format it for display. */
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

function isConfigured() {
    return (
        typeof SUPABASE_URL === 'string' &&
        SUPABASE_URL.startsWith('https://') &&
        !SUPABASE_URL.includes('YOUR_') &&
        typeof SUPABASE_ANON_KEY === 'string' &&
        SUPABASE_ANON_KEY.length > 20 &&
        !SUPABASE_ANON_KEY.includes('YOUR_')
    );
}

function sortExpenses() {
    expenses.sort(
        (a, b) =>
            String(b.expense_date).localeCompare(String(a.expense_date)) ||
            String(b.created_at).localeCompare(String(a.created_at))
    );
}

/* -------------------------------------------------------------
   6. TOAST NOTIFICATIONS
------------------------------------------------------------- */
function showToast(message, type = 'info') {
    const styles = {
        success: 'bg-emerald-600',
        error: 'bg-red-600',
        info: 'bg-slate-800'
    };
    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    toast.className =
        `${styles[type] || styles.info} pointer-events-auto w-full max-w-sm rounded-lg px-4 py-3 ` +
        'text-sm font-medium text-white shadow-lg opacity-0 translate-y-2 transition-all duration-300';
    toast.textContent = message;
    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0', 'translate-y-2');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/* -------------------------------------------------------------
   7. CONNECTION STATUS & FORM STATE
------------------------------------------------------------- */
function setStatus(state, text) {
    const dotColors = {
        online: 'bg-emerald-500',
        connecting: 'bg-yellow-400 animate-pulse',
        offline: 'bg-red-500',
        unconfigured: 'bg-slate-400'
    };
    statusDot.className = `h-2.5 w-2.5 rounded-full ${dotColors[state] || dotColors.unconfigured}`;
    statusText.textContent = text;
}

function setFormEnabled(enabled) {
    expenseFields.disabled = !enabled;
}

function setSubmitting(submitting) {
    submitButton.disabled = submitting;
    submitButtonText.textContent = submitting ? 'Adding…' : 'Add Expense';
}

function setLoading(loading) {
    loadingStateEl.classList.toggle('hidden', !loading);
    refreshButton.disabled = loading;
}

/* -------------------------------------------------------------
   8. FIELD VALIDATION HELPERS
------------------------------------------------------------- */
function setFieldError(input, errorEl, message) {
    input.classList.add('border-red-500', 'ring-1', 'ring-red-500');
    input.setAttribute('aria-invalid', 'true');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function clearFieldError(input, errorEl) {
    input.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
    input.removeAttribute('aria-invalid');
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
}

function clearAllFieldErrors() {
    clearFieldError(descriptionInput, descriptionErrorEl);
    clearFieldError(amountInput, amountErrorEl);
    clearFieldError(dateInput, dateErrorEl);
}

function validateExpenseForm() {
    let valid = true;

    const description = descriptionInput.value.trim();
    if (!description) {
        setFieldError(descriptionInput, descriptionErrorEl, 'Please enter a description.');
        valid = false;
    }

    const amount = Number(amountInput.value);
    if (amountInput.value.trim() === '' || !Number.isFinite(amount) || amount <= 0) {
        setFieldError(amountInput, amountErrorEl, 'Enter a valid amount greater than $0.');
        valid = false;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput.value)) {
        setFieldError(dateInput, dateErrorEl, 'Please choose a valid date.');
        valid = false;
    }

    return valid;
}

/* -------------------------------------------------------------
   9. METRICS & RENDERING
------------------------------------------------------------- */
function renderSummary() {
    const monthKey = currentMonthKey();
    const monthExpenses = expenses.filter(
        (expense) => String(expense.expense_date).slice(0, 7) === monthKey
    );

    // Total spent this month
    const totalThisMonth = monthExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount),
        0
    );
    totalSpentMonthEl.textContent = formatCurrency(totalThisMonth);
    totalSpentSubEl.textContent = new Date().toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    // Highest expense category this month
    const totalsByCategory = monthExpenses.reduce((acc, expense) => {
        const category = expense.category || 'General';
        acc[category] = (acc[category] || 0) + Number(expense.amount);
        return acc;
    }, {});

    const topEntry = Object.entries(totalsByCategory).sort((a, b) => b[1] - a[1])[0];
    if (topEntry) {
        const colors = CATEGORY_COLORS[topEntry[0]] || CATEGORY_COLORS.General;
        topCategoryBadgeEl.innerHTML =
            `<span class="inline-flex items-center rounded-full px-3 py-1 text-lg font-semibold ${colors}">` +
            `${escapeHTML(topEntry[0])}</span>`;
        topCategoryAmountEl.textContent = `${formatCurrency(topEntry[1])} this month`;
    } else {
        topCategoryBadgeEl.innerHTML =
            '<span class="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-lg font-semibold text-slate-500">—</span>';
        topCategoryAmountEl.textContent = 'No spending yet this month';
    }

    // Total transactions
    totalCountEl.textContent = expenses.length;
    historyCountEl.textContent = expenses.length;

    // Budget progress
    const percent = monthlyBudget > 0 ? (totalThisMonth / monthlyBudget) * 100 : 0;
    budgetBar.style.width = `${Math.min(percent, 100)}%`;
    budgetBar.className =
        'h-full rounded-full transition-all duration-500 ' +
        (percent >= 100 ? 'bg-red-500' : percent >= 75 ? 'bg-amber-500' : 'bg-emerald-500');

    budgetPercentTextEl.textContent = `${Math.round(percent)}%`;
    budgetPercentTextEl.classList.toggle('text-red-600', percent >= 100);
    budgetSpentLabelEl.textContent =
        `${formatCurrency(totalThisMonth)} of ${formatCurrency(monthlyBudget)} budget`;
}

function badgeHtml(category) {
    const name = category || 'General';
    const colors = CATEGORY_COLORS[name] || CATEGORY_COLORS.General;
    return (
        `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors}">` +
        `${escapeHTML(name)}</span>`
    );
}

function deleteButtonHtml(id) {
    return (
        `<button type="button" data-id="${id}" data-armed="false" title="Delete expense" ` +
        `aria-label="Delete expense" class="${DELETE_BUTTON_CLASSES}">${TRASH_ICON}</button>`
    );
}

function tableRowHtml(expense) {
    return (
        '<tr class="transition-colors hover:bg-slate-50">' +
        `<td class="px-6 py-4"><p class="font-medium text-slate-800">${escapeHTML(expense.description)}</p>` +
        `<p class="text-xs text-slate-400">Added ${formatTimestamp(expense.created_at)}</p></td>` +
        `<td class="px-6 py-4">${badgeHtml(expense.category)}</td>` +
        `<td class="px-6 py-4 text-slate-600">${formatDate(expense.expense_date)}</td>` +
        `<td class="px-6 py-4 text-right font-semibold tabular-nums text-slate-800">${formatCurrency(expense.amount)}</td>` +
        `<td class="px-6 py-4 text-right">${deleteButtonHtml(expense.id)}</td>` +
        '</tr>'
    );
}

function listItemHtml(expense) {
    return (
        '<li class="px-4 py-4 transition-colors hover:bg-slate-50">' +
        '<div class="flex items-start justify-between gap-3">' +
        '<div class="min-w-0">' +
        `<p class="truncate font-medium text-slate-800">${escapeHTML(expense.description)}</p>` +
        `<div class="mt-2 flex flex-wrap items-center gap-2">${badgeHtml(expense.category)}` +
        `<span class="text-xs text-slate-500">${formatDate(expense.expense_date)}</span></div>` +
        '</div>' +
        '<div class="flex flex-col items-end gap-2">' +
        `<span class="font-semibold tabular-nums text-slate-800">${formatCurrency(expense.amount)}</span>` +
        `${deleteButtonHtml(expense.id)}</div>` +
        '</div></li>'
    );
}

function renderExpenses() {
    const hasExpenses = expenses.length > 0;
    emptyStateEl.classList.toggle('hidden', !hasExpenses);
    expenseTableBody.innerHTML = hasExpenses ? expenses.map(tableRowHtml).join('') : '';
    expenseListEl.innerHTML = hasExpenses ? expenses.map(listItemHtml).join('') : '';
}

function renderAll() {
    renderSummary();
    renderExpenses();
}

/* -------------------------------------------------------------
   10. CRUD OPERATIONS (async/await)
------------------------------------------------------------- */
async function fetchExpenses() {
    setLoading(true);
    try {
        const { data, error } = await supabaseClient
            .from(EXPENSES_TABLE)
            .select('*')
            .order('expense_date', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;

        expenses = data ?? [];
        renderAll();
    } catch (error) {
        showToast(`Could not load expenses: ${error.message}`, 'error');
    } finally {
        setLoading(false);
    }
}

async function addExpense(event) {
    event.preventDefault();

    if (!supabaseClient) {
        showToast('Database is not connected. Check your Supabase configuration in app.js.', 'error');
        return;
    }

    clearAllFieldErrors();
    if (!validateExpenseForm()) return;

    const payload = {
        description: descriptionInput.value.trim(),
        amount: Math.round(Number(amountInput.value) * 100) / 100,
        category: categorySelect.value,
        expense_date: dateInput.value
    };

    setSubmitting(true);
    try {
        const { data, error } = await supabaseClient
            .from(EXPENSES_TABLE)
            .insert(payload)
            .select()
            .single();

        if (error) throw error;

        expenses.unshift(data);
        sortExpenses();
        renderAll();
        resetForm();
        showToast('Expense added successfully.', 'success');
    } catch (error) {
        showToast(`Failed to add expense: ${error.message}`, 'error');
    } finally {
        setSubmitting(false);
    }
}

async function deleteExpense(id) {
    const index = expenses.findIndex((expense) => expense.id === id);
    if (index === -1) return;

    const removed = expenses[index];

    // Optimistic update: remove locally, re-render immediately.
    expenses.splice(index, 1);
    renderAll();

    try {
        const { error } = await supabaseClient
            .from(EXPENSES_TABLE)
            .delete()
            .eq('id', id);

        if (error) throw error;

        showToast('Expense deleted.', 'success');
    } catch (error) {
        // Roll back the optimistic removal on failure.
        expenses.splice(Math.min(index, expenses.length), 0, removed);
        sortExpenses();
        renderAll();
        showToast(`Failed to delete expense: ${error.message}`, 'error');
    }
}

function resetForm() {
    expenseForm.reset();
    clearAllFieldErrors();
    dateInput.value = todayLocalISO();
    descriptionInput.focus();
}

/* -------------------------------------------------------------
   11. INLINE DELETE CONFIRMATION (two-stage)
------------------------------------------------------------- */
function resetDeleteButton(button) {
    button.setAttribute('data-armed', 'false');
    button.className = DELETE_BUTTON_CLASSES;
    button.innerHTML = TRASH_ICON;
}

function disarmAllDeleteButtons() {
    if (armTimer) {
        clearTimeout(armTimer);
        armTimer = null;
    }
    document
        .querySelectorAll('button[data-armed="true"]')
        .forEach(resetDeleteButton);
}

function armDeleteButton(button) {
    disarmAllDeleteButtons();
    button.setAttribute('data-armed', 'true');
    button.className = DELETE_ARMED_CLASSES;
    button.textContent = 'Confirm?';
    armTimer = setTimeout(() => {
        const armed = document.querySelector('button[data-armed="true"]');
        if (armed) resetDeleteButton(armed);
        armTimer = null;
    }, DELETE_ARM_TIMEOUT_MS);
}

/* -------------------------------------------------------------
   12. INITIALIZATION
------------------------------------------------------------- */
async function initializeConnection() {
    if (!isConfigured()) {
        setStatus('unconfigured', 'Not configured');
        setFormEnabled(false);
        showToast('Please set SUPABASE_URL and SUPABASE_ANON_KEY at the top of app.js.', 'error');
        return;
    }

    setStatus('connecting', 'Connecting…');

    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (error) {
        setStatus('offline', 'Offline');
        setFormEnabled(false);
        showToast(`Failed to initialize Supabase client: ${error.message}`, 'error');
        return;
    }

    try {
        const { error } = await supabaseClient
            .from(EXPENSES_TABLE)
            .select('id', { count: 'exact', head: true });

        if (error) throw error;

        setStatus('online', 'Connected');
        await fetchExpenses();
    } catch (error) {
        setStatus('offline', 'Offline');
        showToast(`Database connection failed: ${error.message}`, 'error');
    }
}

function init() {
    // Default the date field to today and sync the budget input
    // with the locally persisted value.
    dateInput.value = todayLocalISO();
    budgetInput.value = monthlyBudget;
    renderAll();

    // Event listeners
    expenseForm.addEventListener('submit', addExpense);

    budgetInput.addEventListener('change', () => {
        const value = Number(budgetInput.value);
        if (!Number.isFinite(value) || value <= 0) {
            budgetInput.value = monthlyBudget;
            showToast('Budget target must be a positive number.', 'error');
            return;
        }
        monthlyBudget = value;
        localStorage.setItem(BUDGET_STORAGE_KEY, String(value));
        renderSummary();
    });

    // Real-time validation feedback: clear an error as soon as
    // the user edits the offending field.
    descriptionInput.addEventListener('input', () => clearFieldError(descriptionInput, descriptionErrorEl));
    amountInput.addEventListener('input', () => clearFieldError(amountInput, amountErrorEl));
    dateInput.addEventListener('change', () => clearFieldError(dateInput, dateErrorEl));

    // Delegated listener for both desktop table and mobile feed.
    historySection.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-id]');
        if (!button) return;

        if (button.getAttribute('data-armed') === 'true') {
            disarmAllDeleteButtons();
            deleteExpense(button.getAttribute('data-id'));
        } else {
            armDeleteButton(button);
        }
    });

    refreshButton.addEventListener('click', () => {
        if (supabaseClient) fetchExpenses();
    });

    initializeConnection();
}

init();
