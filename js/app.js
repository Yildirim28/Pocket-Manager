/* =============================================================
   Pocket Manager — js/app.js
   Dashboard logic (app.html). Requires a signed-in user; the
   page redirects to login.html otherwise. Uses the shared
   client `sb` and helpers from js/config.js and js/site.js.

   Supports bulk entry (multiple expense rows at once) and an
   optional per-person cost breakdown on each row.
   ============================================================= */

'use strict';

/* -------------------------------------------------------------
   APPLICATION STATE
------------------------------------------------------------- */
const PERSONS_TABLE = 'persons';

let expenses = [];
let persons = [];
let monthlyBudget = loadBudget();
let armTimer = null;
let rowSeq = 0;

/* -------------------------------------------------------------
   DOM REFERENCES
------------------------------------------------------------- */
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

const totalSpentMonthEl = document.getElementById('totalSpentMonth');
const totalSpentSubEl = document.getElementById('totalSpentSub');
const topCategoryBadgeEl = document.getElementById('topCategoryBadge');
const topCategoryAmountEl = document.getElementById('topCategoryAmount');
const totalCountEl = document.getElementById('totalCount');
const utilitiesTotalMonthEl = document.getElementById('utilitiesTotalMonth');
const utilitiesSubEl = document.getElementById('utilitiesSub');
const peopleCardEl = document.getElementById('peopleCard');
const peopleBreakdownEl = document.getElementById('peopleBreakdown');

const budgetInput = document.getElementById('budgetInput');
const budgetBar = document.getElementById('budgetBar');
const budgetPercentTextEl = document.getElementById('budgetPercentText');
const budgetSpentLabelEl = document.getElementById('budgetSpentLabel');

const expenseForm = document.getElementById('expenseForm');
const expenseFields = document.getElementById('expenseFields');
const expenseRowsEl = document.getElementById('expenseRows');
const addRowButton = document.getElementById('addRowButton');
const rowErrorEl = document.getElementById('rowError');
const submitButton = document.getElementById('submitButton');
const submitButtonText = document.getElementById('submitButtonText');

const historySection = document.getElementById('historySection');
const historyCountEl = document.getElementById('historyCount');
const loadingStateEl = document.getElementById('loadingState');
const emptyStateEl = document.getElementById('emptyState');
const expenseTableBody = document.getElementById('expenseTableBody');
const expenseListEl = document.getElementById('expenseList');
const refreshButton = document.getElementById('refreshButton');

const personForm = document.getElementById('personForm');
const personNameInput = document.getElementById('personName');
const addPersonButton = document.getElementById('addPersonButton');
const personsListEl = document.getElementById('personsList');
const personsEmptyEl = document.getElementById('personsEmpty');

/* -------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------- */
const CATEGORY_COLORS = {
    Food: 'bg-green-100 text-green-800',
    Transport: 'bg-blue-100 text-blue-800',
    Bills: 'bg-red-100 text-red-800',
    Utilities: 'bg-sky-100 text-sky-800',
    Entertainment: 'bg-purple-100 text-purple-800',
    Shopping: 'bg-amber-100 text-amber-800',
    Other: 'bg-slate-100 text-slate-800',
    General: 'bg-indigo-100 text-indigo-800'
};

const CATEGORIES = [
    'Food',
    'Transport',
    'Utilities',
    'Entertainment',
    'Shopping',
    'Other'
];

const UTILITIES_CATEGORY = 'Utilities';

const UTILITY_TYPES = ['Wifi', 'Gas', 'Electricity', 'Other'];

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

const INPUT_CLASSES =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm placeholder-slate-400 ' +
    'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';

const PERSON_AMOUNT_CLASSES =
    'w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm placeholder-slate-400 ' +
    'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';

/* -------------------------------------------------------------
   DYNAMIC EXPENSE ROWS (bulk entry)
------------------------------------------------------------- */
function categoryOptionsHtml(selected) {
    return CATEGORIES.map(
        (c) => `<option value="${c}"${c === selected ? ' selected' : ''}>${c}</option>`
    ).join('');
}

function utilityOptionsHtml(selected) {
    return UTILITY_TYPES.map(
        (t) => `<option value="${t}"${t === selected ? ' selected' : ''}>${t}</option>`
    ).join('');
}

function expenseRowHtml(rowId) {
    return (
        '<div class="expense-row rounded-xl border border-slate-200 bg-slate-50/60 p-4" data-row="' + rowId + '">' +
        '<div class="grid grid-cols-1 gap-3 md:grid-cols-12">' +
        '<div class="md:col-span-4">' +
        '<label class="mb-1 block text-sm font-medium text-slate-700">Description <span class="text-red-500">*</span></label>' +
        '<input type="text" data-field="description" autocomplete="off" placeholder="e.g. Grocery run" class="' + INPUT_CLASSES + '" />' +
        '</div>' +
        '<div class="md:col-span-2">' +
        '<label class="mb-1 block text-sm font-medium text-slate-700">Amount ($) <span class="text-red-500">*</span></label>' +
        '<div class="relative">' +
        '<span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-slate-400">$</span>' +
        '<input type="number" data-field="amount" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" class="rounded-lg border border-slate-300 bg-white py-2.5 pl-7 pr-3 text-sm placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 w-full" />' +
        '</div>' +
        '</div>' +
        '<div class="md:col-span-2">' +
        '<label class="mb-1 block text-sm font-medium text-slate-700">Category</label>' +
        '<select data-field="category" class="' + INPUT_CLASSES + '">' +
        categoryOptionsHtml('Food') +
        '</select>' +
        '</div>' +
        '<div class="utility-type-wrap md:col-span-2 hidden">' +
        '<label class="mb-1 block text-sm font-medium text-slate-700">Utility type</label>' +
        '<select data-field="utility_type" class="' + INPUT_CLASSES + '">' +
        utilityOptionsHtml('Wifi') +
        '</select>' +
        '</div>' +
        '<div class="md:col-span-2">' +
        '<label class="mb-1 block text-sm font-medium text-slate-700">Date <span class="text-red-500">*</span></label>' +
        '<input type="date" data-field="date" value="' + todayLocalISO() + '" class="' + INPUT_CLASSES + '" />' +
        '</div>' +
        '<div class="flex items-end md:col-span-2">' +
        '<button type="button" class="remove-row-button inline-flex w-full items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600">' +
        'Remove' +
        '</button>' +
        '</div>' +
        '</div>' +
        '<div class="mt-3 border-t border-slate-200 pt-3">' +
        '<div class="flex items-center justify-between">' +
        '<button type="button" class="toggle-participants inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700">' +
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-4 w-4"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>' +
        'Split by person' +
        '</button>' +
        '</div>' +
        '<div class="participants mt-3 hidden">' +
        '<p class="mb-2 text-xs text-slate-400">Tap the people who share this expense &mdash; the amount splits equally between them.</p>' +
        '<div class="person-picker flex flex-wrap gap-2"></div>' +
        '<p class="split-preview mt-2 hidden text-xs font-medium text-slate-500"></p>' +
        '</div>' +
        '</div>' +
        '</div>'
    );
}

/* Equal-split helper: divides cents evenly, distributing the
   remainder cent-by-cent so shares always sum to the total. */
function computeShares(amount, names) {
    const n = names.length;
    if (n === 0) return [];
    const cents = Math.round(amount * 100);
    const base = Math.floor(cents / n);
    const shares = new Array(n).fill(base);
    let remainder = cents - base * n;
    for (let i = 0; remainder > 0; i = (i + 1) % n, remainder -= 1) shares[i] += 1;
    return names.map((name, i) => ({ name, amount: shares[i] / 100 }));
}

function personChipsHtml(selectedNames) {
    if (persons.length === 0) {
        return '<span class="text-xs text-slate-400">No people yet — add them in the People section above.</span>';
    }
    return persons
        .map((p) => {
            const selected = selectedNames.has(p.name);
            return (
                `<button type="button" data-chip-person="${escapeHTML(p.name)}" ` +
                'class="person-chip inline-flex items-center rounded-full px-3 py-1 text-sm font-medium transition-colors ' +
                (selected
                    ? 'selected bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200') +
                `">${escapeHTML(p.name)}</button>`
            );
        })
        .join('');
}

function renderPersonPicker(row) {
    const picker = row.querySelector('.person-picker');
    if (!picker) return;
    const selected = new Set(
        Array.from(row.querySelectorAll('.person-chip.selected')).map((c) =>
            c.getAttribute('data-chip-person')
        )
    );
    picker.innerHTML = personChipsHtml(selected);
    updateSplitPreview(row);
}

/* Refresh every person picker after the persons roster changes,
   keeping current selections. */
function refreshParticipantDropdowns() {
    document.querySelectorAll('.expense-row').forEach(renderPersonPicker);
}

function selectedPersonsIn(row) {
    return Array.from(row.querySelectorAll('.person-chip.selected')).map((c) =>
        c.getAttribute('data-chip-person')
    );
}

function updateSplitPreview(row) {
    const preview = row.querySelector('.split-preview');
    if (!preview) return;
    const names = selectedPersonsIn(row);
    const amount = Number(row.querySelector('[data-field="amount"]').value);

    if (names.length === 0 || !Number.isFinite(amount) || amount <= 0) {
        preview.classList.add('hidden');
        preview.textContent = '';
        return;
    }

    const shares = computeShares(amount, names);
    preview.textContent = shares
        .map((s) => `${s.name} ${formatCurrency(s.amount)}`)
        .join('  ·  ');
    preview.classList.remove('hidden');
}

function addExpenseRow() {
    rowSeq += 1;
    expenseRowsEl.insertAdjacentHTML('beforeend', expenseRowHtml(rowSeq));
    updateRemoveButtons();
}

function removeExpenseRow(row) {
    if (document.querySelectorAll('.expense-row').length <= 1) {
        showToast('At least one expense row is required.', 'info');
        return;
    }
    row.remove();
    updateRemoveButtons();
}

function updateRemoveButtons() {
    const rows = document.querySelectorAll('.expense-row');
    const single = rows.length <= 1;
    rows.forEach((row) => {
        const btn = row.querySelector('.remove-row-button');
        if (btn) btn.disabled = single;
        if (btn) btn.classList.toggle('opacity-40', single);
        btn.classList.toggle('cursor-not-allowed', single);
    });
}

function updateParticipantsTotal(row) {
    updateSplitPreview(row);
}

function readRow(row) {
    const names = selectedPersonsIn(row);
    const amount = Number(row.querySelector('[data-field="amount"]').value);
    const participants = Number.isFinite(amount) && amount > 0 ? computeShares(amount, names) : [];
    const category = row.querySelector('[data-field="category"]').value;
    const utilitySelect = row.querySelector('[data-field="utility_type"]');
    return {
        description: row.querySelector('[data-field="description"]').value.trim(),
        amountInput: row.querySelector('[data-field="amount"]'),
        amount,
        category,
        utilityType: utilitySelect ? utilitySelect.value : null,
        date: row.querySelector('[data-field="date"]').value,
        participants
    };
}

function validateRow(row) {
    const data = readRow(row);
    const issues = [];

    if (!data.description) issues.push('a description');
    if (!Number.isFinite(data.amount) || data.amount <= 0) issues.push('a valid amount');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) issues.push('a valid date');

    if (issues.length > 0) {
        return `"${data.description || 'Untitled'}" needs ${issues.join(', ')}.`;
    }

    return null;
}

/* -------------------------------------------------------------
   PERSONS ROSTER (create once, pick from dropdown when splitting)
------------------------------------------------------------- */
async function fetchPersons() {
    try {
        const { data, error } = await sb
            .from(PERSONS_TABLE)
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        persons = data ?? [];
    } catch (error) {
        showToast(`Could not load people: ${error.message}`, 'error');
        persons = [];
    }
    renderPersons();
    refreshParticipantDropdowns();
}

function renderPersons() {
    const hasPersons = persons.length > 0;
    personsEmptyEl.classList.toggle('hidden', hasPersons);
    personsListEl.innerHTML = persons
        .map(
            (p) =>
                `<span class="inline-flex items-center gap-1.5 rounded-full bg-rose-50 py-1 pl-3 pr-1.5 text-sm font-medium text-rose-700">` +
                `${escapeHTML(p.name)}` +
                `<button type="button" data-person-id="${p.id}" title="Remove ${escapeHTML(p.name)}" ` +
                'class="inline-flex h-5 w-5 items-center justify-center rounded-full text-rose-400 transition-colors hover:bg-rose-200 hover:text-rose-700" ' +
                'aria-label="Remove person">' +
                '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="h-3 w-3"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>' +
                '</button></span>'
        )
        .join('');
}

async function addPerson(event) {
    event.preventDefault();
    const name = personNameInput.value.trim();
    if (!name) {
        showToast('Please enter a name.', 'error');
        return;
    }
    if (persons.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        showToast(`"${name}" is already in your people list.`, 'info');
        personNameInput.value = '';
        return;
    }

    addPersonButton.disabled = true;
    try {
        const { data, error } = await sb
            .from(PERSONS_TABLE)
            .insert({ name })
            .select()
            .single();

        if (error) throw error;

        persons.push(data);
        persons.sort((a, b) => a.name.localeCompare(b.name));
        renderPersons();
        refreshParticipantDropdowns();
        personNameInput.value = '';
        personNameInput.focus();
        showToast(`Added ${name}.`, 'success');
    } catch (error) {
        showToast(`Could not add person: ${error.message}`, 'error');
    } finally {
        addPersonButton.disabled = false;
    }
}

async function deletePerson(id) {
    const person = persons.find((p) => p.id === id);
    if (!person) return;

    try {
        const { error } = await sb.from(PERSONS_TABLE).delete().eq('id', id);
        if (error) throw error;

        persons = persons.filter((p) => p.id !== id);
        renderPersons();
        refreshParticipantDropdowns();
        showToast(`Removed ${person.name}.`, 'success');
    } catch (error) {
        showToast(`Could not remove person: ${error.message}`, 'error');
    }
}

/* -------------------------------------------------------------
   CONNECTION STATUS & FORM STATE
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
    addRowButton.disabled = submitting;
    submitButtonText.textContent = submitting ? 'Adding…' : 'Add Expenses';
}

function setLoading(loading) {
    loadingStateEl.classList.toggle('hidden', !loading);
    refreshButton.disabled = loading;
}

function showRowError(message) {
    rowErrorEl.textContent = message;
    rowErrorEl.classList.remove('hidden');
}

function hideRowError() {
    rowErrorEl.textContent = '';
    rowErrorEl.classList.add('hidden');
}

/* -------------------------------------------------------------
   METRICS & RENDERING
------------------------------------------------------------- */
function sortExpenses() {
    expenses.sort(
        (a, b) =>
            String(b.expense_date).localeCompare(String(a.expense_date)) ||
            String(b.created_at).localeCompare(String(a.created_at))
    );
}

function renderSummary() {
    const monthKey = currentMonthKey();
    const monthExpenses = expenses.filter(
        (expense) => String(expense.expense_date).slice(0, 7) === monthKey
    );

    const totalThisMonth = monthExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount),
        0
    );
    totalSpentMonthEl.textContent = formatCurrency(totalThisMonth);
    totalSpentSubEl.textContent = new Date().toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    // Utilities this month, broken down by sub-type
    const utilitiesExpenses = monthExpenses.filter(
        (expense) => (expense.category || '') === UTILITIES_CATEGORY
    );
    const utilitiesTotal = utilitiesExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount),
        0
    );
    utilitiesTotalMonthEl.textContent = formatCurrency(utilitiesTotal);
    if (utilitiesExpenses.length > 0) {
        const byType = {};
        utilitiesExpenses.forEach((expense) => {
            const type = expense.utility_type || 'Other';
            byType[type] = (byType[type] || 0) + Number(expense.amount);
        });
        const breakdown = Object.entries(byType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, value]) => `${type} ${formatCurrency(value)}`)
            .join(' · ');
        utilitiesSubEl.textContent = breakdown;
    } else {
        utilitiesSubEl.textContent = 'No utilities expenses yet this month';
    }

    // Highest category (excluding Utilities, which has its own card)
    const totalsByCategory = monthExpenses
        .filter((expense) => (expense.category || '') !== UTILITIES_CATEGORY)
        .reduce((acc, expense) => {
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

    totalCountEl.textContent = expenses.length;
    historyCountEl.textContent = expenses.length;

    // Per-person totals this month
    renderPeopleBreakdown(monthExpenses, totalThisMonth);

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

function renderPeopleBreakdown(monthExpenses, totalThisMonth) {
    const byPerson = {};
    let hasAny = false;

    monthExpenses.forEach((expense) => {
        const participants = Array.isArray(expense.participants) ? expense.participants : [];
        participants.forEach((p) => {
            if (!p || !p.name) return;
            const key = String(p.name).trim();
            if (!key) return;
            if (!byPerson[key]) byPerson[key] = { total: 0, details: [] };
            const share = Number(p.amount || 0);
            byPerson[key].total += share;
            byPerson[key].details.push({
                description: expense.description,
                date: expense.expense_date,
                category: expense.category,
                share
            });
            hasAny = true;
        });
    });

    if (!hasAny) {
        peopleCardEl.classList.add('hidden');
        return;
    }

    peopleCardEl.classList.remove('hidden');
    const entries = Object.entries(byPerson).sort((a, b) => b[1].total - a[1].total);
    const max = entries[0][1].total || 1;

    peopleBreakdownEl.innerHTML = entries
        .map(([name, data]) => {
            const width = Math.max(4, Math.round((data.total / max) * 100));
            const share = totalThisMonth > 0 ? Math.round((data.total / totalThisMonth) * 100) : 0;
            const details = data.details
                .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                .map(
                    (d) =>
                        '<li class="flex items-baseline justify-between gap-3 py-1.5">' +
                        `<span class="min-w-0 truncate">${badgeHtml(d.category)} ` +
                        `<span class="text-slate-600">${escapeHTML(d.description)}</span>` +
                        `<span class="ml-1 whitespace-nowrap text-slate-400">${formatDate(d.date)}</span></span>` +
                        `<span class="whitespace-nowrap font-semibold tabular-nums text-rose-700">${formatCurrency(d.share)}</span>` +
                        '</li>'
                )
                .join('');
            return (
                '<div class="rounded-xl border border-slate-100 bg-slate-50/50 p-3">' +
                '<div class="mb-1.5 flex items-center justify-between text-sm">' +
                `<span class="font-semibold text-slate-700">${escapeHTML(name)}</span>` +
                `<span class="tabular-nums text-slate-600">${formatCurrency(data.total)} <span class="text-xs text-slate-400">(${share}% of month)</span></span>` +
                '</div>' +
                '<div class="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">' +
                `<div class="h-full rounded-full bg-rose-400" style="width: ${width}%"></div>` +
                '</div>' +
                `<details class="mt-2"><summary class="cursor-pointer select-none text-xs font-medium text-indigo-600 hover:text-indigo-700">${data.details.length} expense${data.details.length === 1 ? '' : 's'} &mdash; view details</summary>` +
                `<ul class="mt-1.5 divide-y divide-slate-100 border-t border-slate-100 pt-0.5 text-xs">${details}</ul>` +
                '</details>' +
                '</div>'
            );
        })
        .join('');
}

function badgeHtml(category) {
    const name = category || 'General';
    const colors = CATEGORY_COLORS[name] || CATEGORY_COLORS.General;
    return (
        `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors}">` +
        `${escapeHTML(name)}</span>`
    );
}

function participantsSummaryHtml(expense) {
    const participants = Array.isArray(expense.participants) ? expense.participants : [];
    if (participants.length === 0) return '<span class="text-xs text-slate-400">—</span>';
    return participants
        .map(
            (p) =>
                `<span class="inline-flex items-center rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-700">` +
                `${escapeHTML(p.name)} ${formatCurrency(p.amount)}</span>`
        )
        .join(' ');
}

function utilityChipHtml(expense) {
    if ((expense.category || '') !== UTILITIES_CATEGORY) return '';
    const type = expense.utility_type || 'Other';
    return (
        '<span class="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700">' +
        `${escapeHTML(type)}</span>`
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
        `<td class="px-6 py-4"><div class="flex flex-wrap items-center gap-1">${badgeHtml(expense.category)}${utilityChipHtml(expense)}</div></td>` +
        `<td class="px-6 py-4"><div class="flex max-w-xs flex-wrap gap-1">${participantsSummaryHtml(expense)}</div></td>` +
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
        `<div class="mt-2 flex flex-wrap items-center gap-2">${badgeHtml(expense.category)}${utilityChipHtml(expense)}` +
        `<span class="text-xs text-slate-500">${formatDate(expense.expense_date)}</span></div>` +
        `<div class="mt-2 flex flex-wrap gap-1">${participantsSummaryHtml(expense)}</div>` +
        '</div>' +
        '<div class="flex flex-col items-end gap-2">' +
        `<span class="font-semibold tabular-nums text-slate-800">${formatCurrency(expense.amount)}</span>` +
        `${deleteButtonHtml(expense.id)}</div>` +
        '</div></li>'
    );
}

function renderExpenses() {
    const hasExpenses = expenses.length > 0;
    emptyStateEl.classList.toggle('hidden', hasExpenses);
    expenseTableBody.innerHTML = hasExpenses ? expenses.map(tableRowHtml).join('') : '';
    expenseListEl.innerHTML = hasExpenses ? expenses.map(listItemHtml).join('') : '';
}

function renderAll() {
    renderSummary();
    renderExpenses();
}

/* -------------------------------------------------------------
   CRUD OPERATIONS (async/await)
------------------------------------------------------------- */
async function fetchExpenses() {
    setLoading(true);
    try {
        const { data, error } = await sb
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

async function addExpenses(event) {
    event.preventDefault();
    hideRowError();

    const rows = Array.from(document.querySelectorAll('.expense-row'));
    const payloads = [];
    const errors = [];

    rows.forEach((row) => {
        const issue = validateRow(row);
        if (issue) {
            errors.push(issue);
            return;
        }
        const data = readRow(row);
        payloads.push({
            description: data.description,
            amount: Math.round(data.amount * 100) / 100,
            category: data.category,
            utility_type: data.category === UTILITIES_CATEGORY ? (data.utilityType || 'Other') : null,
            expense_date: data.date,
            participants: data.participants.length > 0 ? data.participants : null
        });
    });

    if (errors.length > 0) {
        showRowError(errors[0] + (errors.length > 1 ? ` (+${errors.length - 1} more issue${errors.length > 2 ? 's' : ''})` : ''));
        return;
    }

    if (payloads.length === 0) return;

    setSubmitting(true);
    try {
        const { data, error } = await sb
            .from(EXPENSES_TABLE)
            .insert(payloads)
            .select();

        if (error) throw error;

        expenses.unshift(...(data ?? []));
        sortExpenses();
        renderAll();
        resetForm();
        showToast(
            payloads.length === 1
                ? 'Expense added successfully.'
                : `${payloads.length} expenses added successfully.`,
            'success'
        );
    } catch (error) {
        showToast(`Failed to add expenses: ${error.message}`, 'error');
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
        const { error } = await sb.from(EXPENSES_TABLE).delete().eq('id', id);
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
    expenseRowsEl.innerHTML = '';
    addExpenseRow();
    hideRowError();
}

/* -------------------------------------------------------------
   INLINE DELETE CONFIRMATION (two-stage)
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
    document.querySelectorAll('button[data-armed="true"]').forEach(resetDeleteButton);
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
   FORM EVENT DELEGATION
------------------------------------------------------------- */
function initFormEvents() {
    addRowButton.addEventListener('click', addExpenseRow);

    expenseRowsEl.addEventListener('click', (event) => {
        const row = event.target.closest('.expense-row');
        if (!row) return;

        if (event.target.closest('.remove-row-button')) {
            removeExpenseRow(row);
            return;
        }

        if (event.target.closest('.toggle-participants')) {
            if (persons.length === 0) {
                showToast('Create people first in the People section above — then you can split expenses.', 'info');
                personNameInput?.focus();
                document.getElementById('people-heading')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            const box = row.querySelector('.participants');
            box.classList.toggle('hidden');
            if (!box.classList.contains('hidden')) renderPersonPicker(row);
            return;
        }

        const chip = event.target.closest('.person-chip');
        if (chip) {
            const selected = chip.classList.toggle('selected');
            chip.classList.toggle('bg-indigo-600', selected);
            chip.classList.toggle('text-white', selected);
            chip.classList.toggle('shadow-sm', selected);
            chip.classList.toggle('bg-slate-100', !selected);
            chip.classList.toggle('text-slate-600', !selected);
            chip.classList.toggle('hover:bg-slate-200', !selected);
            updateSplitPreview(row);
        }
    });

    expenseRowsEl.addEventListener('input', (event) => {
        const row = event.target.closest('.expense-row');
        if (!row) return;
        if (event.target.matches('[data-field="amount"]')) {
            updateSplitPreview(row);
        }
    });

    expenseRowsEl.addEventListener('change', (event) => {
        const row = event.target.closest('.expense-row');
        if (!row) return;
        if (event.target.matches('[data-field="category"]')) {
            const isUtilities = event.target.value === UTILITIES_CATEGORY;
            row.querySelector('.utility-type-wrap')?.classList.toggle('hidden', !isUtilities);
        }
    });
}

/* -------------------------------------------------------------
   INITIALIZATION (auth-guarded)
------------------------------------------------------------- */
async function init() {
    budgetInput.value = monthlyBudget;
    renderAll();

    if (!sb) {
        setStatus('unconfigured', 'Not configured');
        setFormEnabled(false);
        showToast('Missing Supabase credentials in js/config.js.', 'error');
        return;
    }

    setStatus('connecting', 'Connecting…');

    // Auth guard: dashboard requires a signed-in user.
    const session = await requireAuth();
    if (!session) return;

    // If the session expires or is revoked while browsing,
    // send the user back to the login page.
    sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') window.location.replace('login.html');
    });

    try {
        const { error } = await sb
            .from(EXPENSES_TABLE)
            .select('id', { count: 'exact', head: true });

        if (error) throw error;

        setStatus('online', 'Connected');
        await fetchExpenses();
        await fetchPersons();
    } catch (error) {
        setStatus('offline', 'Offline');
        showToast(`Database connection failed: ${error.message}`, 'error');
    }

    // Event listeners
    expenseForm.addEventListener('submit', addExpenses);
    initFormEvents();
    addExpenseRow();

    personForm.addEventListener('submit', addPerson);
    personsListEl.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-person-id]');
        if (button) deletePerson(button.getAttribute('data-person-id'));
    });

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

    refreshButton.addEventListener('click', fetchExpenses);
}

document.addEventListener('DOMContentLoaded', init);
