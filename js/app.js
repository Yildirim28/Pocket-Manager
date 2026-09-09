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
const totalSpentFlipEl = document.getElementById('totalSpentFlip');
const remainingBalanceEl = document.getElementById('remainingBalance');
const remainingBalanceSubEl = document.getElementById('remainingBalanceSub');
const topCategoryFlipEl = document.getElementById('topCategoryFlip');
const lowestCategoryAmountEl = document.getElementById('lowestCategoryAmount');
const lowestCategoryBadgeEl = document.getElementById('lowestCategoryBadge');
const utilitiesFlipEl = document.getElementById('utilitiesFlip');
const utilitiesBreakdownListEl = document.getElementById('utilitiesBreakdownList');
const totalTransactionsFlipEl = document.getElementById('totalTransactionsFlip');
const topTransactionsListEl = document.getElementById('topTransactionsList');
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
const budgetSpentValueEl = document.getElementById('budgetSpentValue');
const budgetTargetValueEl = document.getElementById('budgetTargetValue');
const budgetStatusTextEl = document.getElementById('budgetStatusText');
const budgetStatusEmojiEl = document.getElementById('budgetStatusEmoji');
const peopleCardSubtitleEl = document.getElementById('peopleCardSubtitle');

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
    Rent: 'bg-fuchsia-100 text-fuchsia-800',
    Entertainment: 'bg-purple-100 text-purple-800',
    Shopping: 'bg-amber-100 text-amber-800',
    Other: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100',
    General: 'bg-indigo-100 text-indigo-800'
};

const CATEGORIES = [
    'Food',
    'Transport',
    'Utilities',
    'Rent',
    'Entertainment',
    'Shopping',
    'Other'
];

const UTILITIES_CATEGORY = 'Utilities';

const UTILITY_TYPES = ['Wifi', 'Gas', 'Electricity', 'Other'];

const TRASH_ICON = '<i data-lucide="trash-2" class="h-4 w-4"></i>';

const DELETE_BUTTON_CLASSES =
    'inline-flex items-center justify-center rounded-lg p-2 text-slate-400 dark:text-slate-500 transition-colors ' +
    'hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500';

const DELETE_ARMED_CLASSES =
    'inline-flex items-center justify-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs ' +
    'font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500';

const INPUT_CLASSES =
    'w-full border-0 border-b border-slate-200 dark:border-slate-700 bg-transparent px-0 py-1.5 text-sm placeholder-slate-300 dark:placeholder-slate-600 ' +
    'transition-colors focus:border-indigo-500 focus:outline-none focus:ring-0';

const LABEL_CLASSES =
    'mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500';

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
        '<div class="expense-row group relative rounded-xl px-3 py-4 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/80" data-row="' + rowId + '">' +
        '<button type="button" title="Remove this expense" aria-label="Remove this expense" ' +
        'class="remove-row-button absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-300 dark:text-slate-600 transition-colors hover:bg-red-50 hover:text-red-500 md:right-2 md:top-3">' +
        '<i data-lucide="x" class="h-4 w-4"></i>' +
        '</button>' +
        '<div class="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-[minmax(0,1fr)_130px_160px_150px_2rem]">' +
        '<div class="col-span-2 md:col-span-1">' +
        '<label class="' + LABEL_CLASSES + '">Description</label>' +
        '<input type="text" data-field="description" autocomplete="off" placeholder="e.g. Grocery run" class="' + INPUT_CLASSES + '" />' +
        '</div>' +
        '<div>' +
        '<label class="' + LABEL_CLASSES + '">Amount</label>' +
        '<div class="relative">' +
        '<span class="pointer-events-none absolute inset-y-0 left-0 flex items-center text-sm text-slate-300 dark:text-slate-600">$</span>' +
        '<input type="number" data-field="amount" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" class="w-full border-0 border-b border-slate-200 dark:border-slate-700 bg-transparent py-1.5 pl-4 pr-0 text-sm placeholder-slate-300 dark:placeholder-slate-600 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-0" />' +
        '</div>' +
        '</div>' +
        '<div>' +
        '<label class="' + LABEL_CLASSES + '">Category</label>' +
        '<select data-field="category" class="' + INPUT_CLASSES + ' cursor-pointer">' +
        categoryOptionsHtml('Food') +
        '</select>' +
        '</div>' +
        '<div>' +
        '<label class="' + LABEL_CLASSES + '">Date</label>' +
        '<input type="date" data-field="date" value="' + todayLocalISO() + '" class="' + INPUT_CLASSES + ' cursor-pointer" />' +
        '</div>' +
        '<div class="hidden md:block"></div>' +
        '</div>' +
        '<div class="utility-type-wrap mt-4 hidden md:max-w-[220px]">' +
        '<label class="' + LABEL_CLASSES + '">Utility type</label>' +
        '<select data-field="utility_type" class="' + INPUT_CLASSES + ' cursor-pointer">' +
        utilityOptionsHtml('Wifi') +
        '</select>' +
        '</div>' +
        '<div class="mt-4">' +
        '<button type="button" class="toggle-participants inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 dark:text-slate-500 transition-colors hover:text-indigo-600">' +
        '<i data-lucide="users-round" class="h-4 w-4"></i>' +
        'Split by person' +
        '</button>' +
        '<div class="participants mt-3 hidden">' +
        '<div class="person-picker flex flex-wrap gap-2"></div>' +
        '<div class="split-editor mt-3 space-y-2"></div>' +
        '<div class="split-total hidden text-xs font-semibold"></div>' +
        '<button type="button" class="split-reset hidden text-xs font-semibold text-slate-400 dark:text-slate-500 underline-offset-2 transition-colors hover:text-indigo-600 hover:underline">' +
        '↺ Reset to equal split' +
        '</button>' +
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
        return '<span class="text-xs text-slate-400 dark:text-slate-500">No people yet — add them in the People section above.</span>';
    }
    return persons
        .map((p) => {
            const selected = selectedNames.has(p.name);
            return (
                `<button type="button" data-chip-person="${escapeHTML(p.name)}" ` +
                'class="person-chip inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-all active:scale-95 ' +
                (selected
                    ? 'selected border-transparent bg-indigo-600 text-white shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900') +
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
    renderSplitEditor(row);
    window.lucide?.createIcons();
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

/* Read the current editable split amounts from a row's editor. */
function splitEditorAmounts(row) {
    const values = {};
    row.querySelectorAll('.split-row').forEach((splitRow) => {
        const name = splitRow.getAttribute('data-split-name');
        const value = Number(splitRow.querySelector('[data-split-amount]').value);
        if (name && Number.isFinite(value)) values[name] = value;
    });
    return values;
}

function splitRowHtml(name, amount) {
    return (
        '<div class="split-row flex items-center justify-between gap-3 rounded-lg bg-slate-50 dark:bg-slate-900 px-3 py-1.5" data-split-name="' +
        escapeHTML(name) +
        '">' +
        `<span class="truncate text-sm font-medium text-slate-600 dark:text-slate-300">${escapeHTML(name)}</span>` +
        '<div class="relative shrink-0">' +
        '<span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2 text-xs text-slate-400 dark:text-slate-500">$</span>' +
        '<input type="number" data-split-amount min="0" step="0.01" inputmode="decimal" value="' +
        (Number.isFinite(amount) ? amount : 0) +
        '" class="w-24 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 py-1.5 pl-5 pr-2 text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" />' +
        '</div>' +
        '</div>'
    );
}

/* Build the editable amount editor for the selected people.
   Defaults to an equal split; once the user edits an amount
   (data-split-dirty), values are preserved across changes. */
function renderSplitEditor(row) {
    const editor = row.querySelector('.split-editor');
    if (!editor) return;

    const names = selectedPersonsIn(row);
    const amount = Number(row.querySelector('[data-field="amount"]').value) || 0;
    const dirty = row.getAttribute('data-split-dirty') === 'true';
    const existing = splitEditorAmounts(row);

    let values = {};
    if (dirty && names.length > 0) {
        names.forEach((name) => {
            values[name] = name in existing ? existing[name] : 0;
        });
    } else {
        computeShares(amount, names).forEach((share) => {
            values[share.name] = share.amount;
        });
    }

    editor.innerHTML = names.map((name) => splitRowHtml(name, values[name])).join('');
    updateSplitTotal(row);
}

/* Live total: green when contributions match the amount,
   amber with the difference when they don't. */
function updateSplitTotal(row) {
    const totalEl = row.querySelector('.split-total');
    const resetBtn = row.querySelector('.split-reset');
    if (!totalEl) return;

    const names = selectedPersonsIn(row);
    if (names.length === 0) {
        totalEl.classList.add('hidden');
        resetBtn?.classList.add('hidden');
        return;
    }

    const amounts = splitEditorAmounts(row);
    const sum = names.reduce((acc, name) => acc + (amounts[name] || 0), 0);
    const amount = Number(row.querySelector('[data-field="amount"]').value) || 0;
    const matches = Math.abs(sum - amount) < 0.005;

    totalEl.textContent = matches
        ? `✓ Contributions total ${formatCurrency(sum)} — matches the amount`
        : `Contributions total ${formatCurrency(sum)} of ${formatCurrency(amount)} — ${formatCurrency(Math.abs(amount - sum))} ${sum > amount ? 'over' : 'left'}`;
    totalEl.className =
        'split-total text-xs font-semibold ' + (matches ? 'text-emerald-600' : 'text-amber-600');
    totalEl.classList.remove('hidden');
    resetBtn?.classList.remove('hidden');
}

function addExpenseRow() {
    rowSeq += 1;
    expenseRowsEl.insertAdjacentHTML('beforeend', expenseRowHtml(rowSeq));
    updateRemoveButtons();
    window.lucide?.createIcons();
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
        if (!btn) return;
        btn.disabled = single;
        btn.classList.toggle('opacity-0', single);
        btn.classList.toggle('pointer-events-none', single);
    });
}

function updateParticipantsTotal(row) {
    renderSplitEditor(row);
}

function readRow(row) {
    const participants = [];
    row.querySelectorAll('.split-row').forEach((splitRow) => {
        const name = splitRow.getAttribute('data-split-name');
        const value = Number(splitRow.querySelector('[data-split-amount]').value);
        if (name && Number.isFinite(value) && value > 0) {
            participants.push({ name, amount: Math.round(value * 100) / 100 });
        }
    });
    const category = row.querySelector('[data-field="category"]').value;
    const utilitySelect = row.querySelector('[data-field="utility_type"]');
    return {
        description: row.querySelector('[data-field="description"]').value.trim(),
        amountInput: row.querySelector('[data-field="amount"]'),
        amount: Number(row.querySelector('[data-field="amount"]').value),
        category,
        utilityType: utilitySelect ? utilitySelect.value : null,
        date: row.querySelector('[data-field="date"]').value,
        participants
    };
}

/* Allow only real positive currency values (numbers, max 2 decimals). */
function cleanAmount(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return null;
    return Math.round(num * 100) / 100;
}

function validateRow(row) {
    const data = readRow(row);
    const issues = [];

    if (!data.description) issues.push('a description');
    const amount = cleanAmount(data.amount);
    if (amount === null) issues.push('a valid amount (positive number)');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) issues.push('a valid date');

    if (issues.length > 0) {
        return `"${data.description || 'Untitled'}" needs ${issues.join(', ')}.`;
    }

    // Custom contributions: every selected person needs a real
    // positive amount, and the total must match the expense.
    const splitRows = row.querySelectorAll('.split-row');
    if (splitRows.length > 0) {
        let invalidShare = null;
        const shares = [];
        splitRows.forEach((splitRow) => {
            const name = splitRow.getAttribute('data-split-name');
            const share = cleanAmount(splitRow.querySelector('[data-split-amount]').value);
            if (share === null && !invalidShare) {
                invalidShare = name;
            } else if (share !== null) {
                shares.push(share);
            }
        });

        if (invalidShare) {
            return `"${data.description}": ${invalidShare}'s contribution must be a positive number.`;
        }

        const sum = shares.reduce((acc, s) => acc + s, 0);
        if (Math.abs(sum - amount) > 0.005) {
            const diff = formatCurrency(Math.abs(amount - sum));
            return `"${data.description}": contributions total ${formatCurrency(sum)} but the amount is ${formatCurrency(amount)} (${diff} ${sum > amount ? 'over' : 'missing'}). Adjust the split or reset to equal.`;
        }
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
                '<i data-lucide="x" class="h-3 w-3"></i>' +
                '</button></span>'
        )
        .join('');
    window.lucide?.createIcons();
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

    // Remaining balance (back face of the flip card)
    if (remainingBalanceEl) {
        const remaining = monthlyBudget - totalThisMonth;
        if (remaining >= 0) {
            remainingBalanceEl.textContent = formatCurrency(remaining);
            remainingBalanceSubEl.textContent = `left from your ${formatCurrency(monthlyBudget)} budget ✨`;
        } else {
            remainingBalanceEl.textContent = formatCurrency(Math.abs(remaining));
            remainingBalanceSubEl.textContent = `over your ${formatCurrency(monthlyBudget)} budget 😬`;
        }
    }

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

    // Per-type breakdown (back face of the utilities flip card)
    if (utilitiesBreakdownListEl) {
        if (utilitiesExpenses.length > 0) {
            const byType = {};
            utilitiesExpenses.forEach((expense) => {
                const type = expense.utility_type || 'Other';
                byType[type] = (byType[type] || 0) + Number(expense.amount);
            });
            const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
            const maxType = entries[0][1] || 1;

            utilitiesBreakdownListEl.innerHTML = entries
                .map(([type, value]) => {
                    const width = Math.max(6, Math.round((value / maxType) * 100));
                    const percent = utilitiesTotal > 0 ? Math.round((value / utilitiesTotal) * 100) : 0;
                    return (
                        '<div>' +
                        '<div class="flex items-baseline justify-between text-sm">' +
                        `<span class="font-semibold text-white">${escapeHTML(type)}</span>` +
                        `<span class="font-bold tabular-nums text-white">${formatCurrency(value)} <span class="text-[11px] font-medium text-cyan-100/70">${percent}%</span></span>` +
                        '</div>' +
                        '<div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/20">' +
                        `<div class="h-full rounded-full bg-white/80" style="width: ${width}%"></div>` +
                        '</div>' +
                        '</div>'
                    );
                })
                .join('');
        } else {
            utilitiesBreakdownListEl.innerHTML =
                '<p class="text-xs text-cyan-100/80">No utilities expenses yet this month</p>';
        }
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
        topCategoryAmountEl.textContent = formatCurrency(topEntry[1]);
        topCategoryBadgeEl.innerHTML =
            `<span class="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${colors}">` +
            `${escapeHTML(topEntry[0])}</span>`;
    } else {
        topCategoryAmountEl.textContent = formatCurrency(0);
        topCategoryBadgeEl.innerHTML =
            '<span class="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-sm font-semibold text-slate-500 dark:text-slate-400">—</span>';
    }

    // Lowest category (back face of the top-category flip card)
    if (lowestCategoryAmountEl) {
        const lowestEntry = Object.entries(totalsByCategory).sort((a, b) => a[1] - b[1])[0];
        if (lowestEntry) {
            lowestCategoryAmountEl.textContent = formatCurrency(lowestEntry[1]);
            lowestCategoryBadgeEl.innerHTML =
                `<span class="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-sm font-semibold text-white ring-1 ring-white/25">` +
                `${escapeHTML(lowestEntry[0])}</span>`;
        } else {
            lowestCategoryAmountEl.textContent = formatCurrency(0);
            lowestCategoryBadgeEl.innerHTML =
                '<span class="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-sm font-semibold text-white ring-1 ring-white/25">—</span>';
        }
    }

    totalCountEl.textContent = expenses.length;
    historyCountEl.textContent = expenses.length;

    // Top 5 transactions (back face of the total-transactions flip card)
    if (topTransactionsListEl) {
        const topFive = [...expenses]
            .sort((a, b) => Number(b.amount) - Number(a.amount))
            .slice(0, 5);

        if (topFive.length > 0) {
            topTransactionsListEl.innerHTML = topFive
                .map(
                    (expense, index) =>
                        `<li class="flex items-baseline justify-between gap-2 text-xs">` +
                        `<span class="flex min-w-0 items-baseline gap-1.5">` +
                        `<span class="font-bold text-white">${index + 1}.</span>` +
                        `<span class="truncate text-emerald-50">${escapeHTML(expense.description)}</span>` +
                        `</span>` +
                        `<span class="whitespace-nowrap font-bold tabular-nums text-white">${formatCurrency(expense.amount)}</span>` +
                        `</li>`
                )
                .join('');
        } else {
            topTransactionsListEl.innerHTML =
                '<li class="text-xs text-emerald-100/80">No expenses yet</li>';
        }
    }

    // Per-person totals this month
    renderPeopleBreakdown(monthExpenses, totalThisMonth);

    // Budget progress (dark hero card with mood states)
    const percent = monthlyBudget > 0 ? (totalThisMonth / monthlyBudget) * 100 : 0;
    budgetBar.style.width = `${Math.min(percent, 100)}%`;

    let mood;
    if (percent >= 100) {
        budgetBar.className =
            'h-full rounded-full bg-gradient-to-r from-rose-500 to-red-500 transition-all duration-700';
        mood = { emoji: '😵', text: 'Budget blown — every taka from here hurts 💥', pct: 'text-rose-300' };
    } else if (percent >= 75) {
        budgetBar.className =
            'h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-400 transition-all duration-700';
        mood = { emoji: '😬', text: 'Getting close to your limit — slow down a little', pct: 'text-amber-300' };
    } else if (percent >= 25) {
        budgetBar.className =
            'h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700';
        mood = { emoji: '😌', text: 'Comfortably on track — keep it up ✅', pct: 'text-emerald-300' };
    } else {
        budgetBar.className =
            'h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-700';
        mood = { emoji: '🤩', text: 'Barely touched your budget — great start!', pct: 'text-sky-300' };
    }

    budgetStatusEmojiEl.textContent = mood.emoji;
    budgetStatusTextEl.textContent = mood.text;
    budgetSpentValueEl.textContent = formatCurrency(totalThisMonth);
    budgetTargetValueEl.textContent = formatCurrency(monthlyBudget);
    budgetPercentTextEl.textContent = `${Math.round(percent)}%`;
    budgetPercentTextEl.className =
        'rounded-full bg-white/10 px-3 py-1 text-sm font-bold tabular-nums ring-1 ring-white/15 ' + mood.pct;
}

const AVATAR_GRADIENTS = [
    'from-rose-400 to-pink-500',
    'from-violet-400 to-purple-500',
    'from-sky-400 to-blue-500',
    'from-amber-400 to-orange-500',
    'from-emerald-400 to-teal-500',
    'from-fuchsia-400 to-pink-500',
    'from-cyan-400 to-sky-500',
    'from-lime-400 to-green-500'
];

/* Fun mascot emoji assigned per person (stable per name). */
const MASCOTS = ['🦊', '🐼', '🐯', '🦁', '🐨', '🐵', '🐸', '🐧', '🐰', '🐻', '🦉', '🐙', '🦄', '🐢', '🐳', '🦜', '🐝', '🦋', '🐬', '🐿️'];

const RANK_EMOJIS = ['🥇', '🥈', '🥉'];

function avatarGradient(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function mascotFor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 33 + name.charCodeAt(i)) >>> 0;
    return MASCOTS[hash % MASCOTS.length];
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
    const peopleCount = entries.length;

    peopleCardSubtitleEl.textContent =
        peopleCount === 1
            ? '1 person splitting this month 🤝'
            : `${peopleCount} people splitting this month 🤝`;

    peopleBreakdownEl.innerHTML = entries
        .map(([name, data], index) => {
            const width = Math.max(6, Math.round((data.total / max) * 100));
            const share = totalThisMonth > 0 ? Math.round((data.total / totalThisMonth) * 100) : 0;
            const rank = RANK_EMOJIS[index] || '';
            const mascot = mascotFor(name);
            const gradient = avatarGradient(name);

            const details = data.details
                .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                .map(
                    (d) =>
                        '<li class="flex items-baseline justify-between gap-3 py-1.5">' +
                        `<span class="flex min-w-0 items-baseline gap-1.5">${badgeHtml(d.category)} ` +
                        `<span class="truncate text-slate-600 dark:text-slate-300">${escapeHTML(d.description)}</span>` +
                        `<span class="ml-1 whitespace-nowrap text-slate-400 dark:text-slate-500">${formatDate(d.date)}</span></span>` +
                        `<span class="whitespace-nowrap font-semibold tabular-nums text-rose-700">${formatCurrency(d.share)}</span>` +
                        '</li>'
                )
                .join('');

            return (
                '<div class="group rounded-2xl border border-rose-100/80 bg-white dark:bg-slate-900 p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:shadow-rose-100">' +
                '<div class="flex items-center gap-3">' +
                `<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-lg shadow-md ring-2 ring-white">${mascot}</span>` +
                '<div class="min-w-0 flex-1">' +
                '<div class="flex items-baseline justify-between gap-2">' +
                `<span class="truncate text-sm font-bold text-slate-800 dark:text-slate-100">${rank ? rank + ' ' : ''}${escapeHTML(name)}</span>` +
                `<span class="whitespace-nowrap text-sm font-extrabold tabular-nums text-slate-900 dark:text-slate-100">${formatCurrency(data.total)} <span class="text-[11px] font-semibold text-slate-400 dark:text-slate-500">· ${share}%</span></span>` +
                '</div>' +
                '<div class="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-rose-50">' +
                `<div class="h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700" style="width: ${width}%"></div>` +
                '</div>' +
                '</div>' +
                '</div>' +
                `<details class="mt-3"><summary class="cursor-pointer select-none text-xs font-semibold text-rose-500 transition-colors hover:text-rose-600">📝 ${data.details.length} expense${data.details.length === 1 ? '' : 's'} — view details</summary>` +
                `<ul class="mt-2 divide-y divide-rose-50 border-t border-rose-100 text-xs">${details}</ul>` +
                '</details>' +
                '</div>'
            );
        })
        .join('');
    window.lucide?.createIcons();
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
    if (participants.length === 0) return '<span class="text-xs text-slate-400 dark:text-slate-500">—</span>';
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
        '<tr class="transition-colors hover:bg-slate-50 dark:hover:bg-slate-900">' +
        `<td class="px-6 py-4"><p class="font-medium text-slate-800 dark:text-slate-100">${escapeHTML(expense.description)}</p>` +
        `<p class="text-xs text-slate-400 dark:text-slate-500">Added ${formatTimestamp(expense.created_at)}</p></td>` +
        `<td class="px-6 py-4"><div class="flex flex-wrap items-center gap-1">${badgeHtml(expense.category)}${utilityChipHtml(expense)}</div></td>` +
        `<td class="px-6 py-4"><div class="flex max-w-xs flex-wrap gap-1">${participantsSummaryHtml(expense)}</div></td>` +
        `<td class="px-6 py-4 text-slate-600 dark:text-slate-300">${formatDate(expense.expense_date)}</td>` +
        `<td class="px-6 py-4 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">${formatCurrency(expense.amount)}</td>` +
        `<td class="px-6 py-4 text-right">${deleteButtonHtml(expense.id)}</td>` +
        '</tr>'
    );
}

function listItemHtml(expense) {
    return (
        '<li class="px-4 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900">' +
        '<div class="flex items-start justify-between gap-3">' +
        '<div class="min-w-0">' +
        `<p class="truncate font-medium text-slate-800 dark:text-slate-100">${escapeHTML(expense.description)}</p>` +
        `<div class="mt-2 flex flex-wrap items-center gap-2">${badgeHtml(expense.category)}${utilityChipHtml(expense)}` +
        `<span class="text-xs text-slate-500 dark:text-slate-400">${formatDate(expense.expense_date)}</span></div>` +
        `<div class="mt-2 flex flex-wrap gap-1">${participantsSummaryHtml(expense)}</div>` +
        '</div>' +
        '<div class="flex flex-col items-end gap-2">' +
        `<span class="font-semibold tabular-nums text-slate-800 dark:text-slate-100">${formatCurrency(expense.amount)}</span>` +
        `${deleteButtonHtml(expense.id)}</div>` +
        '</div></li>'
    );
}

function renderExpenses() {
    const hasExpenses = expenses.length > 0;
    emptyStateEl.classList.toggle('hidden', hasExpenses);
    expenseTableBody.innerHTML = hasExpenses ? expenses.map(tableRowHtml).join('') : '';
    expenseListEl.innerHTML = hasExpenses ? expenses.map(listItemHtml).join('') : '';
    window.lucide?.createIcons();
}

function renderAll() {
    renderSummary();
    renderExpenses();
    if (typeof renderPersons === 'function') renderPersons();
    window.lucide?.createIcons();
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
            chip.classList.toggle('border-transparent', selected);
            chip.classList.toggle('text-white', selected);
            chip.classList.toggle('shadow-sm', selected);
            chip.classList.toggle('bg-white dark:bg-slate-900', !selected);
            chip.classList.toggle('border-slate-200 dark:border-slate-700', !selected);
            chip.classList.toggle('text-slate-500 dark:text-slate-400', !selected);
            renderSplitEditor(row);
        }
    });

    expenseRowsEl.addEventListener('input', (event) => {
        const row = event.target.closest('.expense-row');
        if (!row) return;

        if (event.target.matches('[data-field="amount"]')) {
            const raw = event.target.value;
            if (raw !== '' && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) {
                event.target.value = raw.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
            }
            // Changing the amount re-splits equally unless the user
            // has entered custom contributions.
            if (row.getAttribute('data-split-dirty') === 'true') {
                updateSplitTotal(row);
            } else {
                renderSplitEditor(row);
            }
        }

        if (event.target.matches('[data-split-amount]')) {
            const input = event.target;
            // Real numbers only: strip anything but digits and one dot.
            const cleaned = input.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
            if (cleaned !== input.value) input.value = cleaned;

            row.setAttribute('data-split-dirty', 'true');

            // Two-person split: editing one share auto-fills the other
            // from the remaining total.
            const splitRows = row.querySelectorAll('.split-row');
            if (splitRows.length === 2) {
                const other = Array.from(splitRows).find(
                    (r) => r.querySelector('[data-split-amount]') !== input
                );
                const total = Number(row.querySelector('[data-field="amount"]').value) || 0;
                const value = Number(input.value);
                if (other && Number.isFinite(value) && value >= 0 && total > 0) {
                    const remainder = Math.round((total - value) * 100) / 100;
                    other.querySelector('[data-split-amount]').value = Math.max(0, remainder);
                }
            }
            updateSplitTotal(row);
        }
    });

    expenseRowsEl.addEventListener('click', (event) => {
        if (event.target.closest('.split-reset')) {
            const row = event.target.closest('.expense-row');
            if (!row) return;
            row.setAttribute('data-split-dirty', 'false');
            renderSplitEditor(row);
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
    initFormEvents();
    addExpenseRow();

    // Flip cards: click/tap anywhere (or Enter/Space) to flip.
    const wireFlip = (element) => {
        if (!element) return;
        element.addEventListener('click', () => element.classList.toggle('is-flipped'));
        element.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                element.classList.toggle('is-flipped');
            }
        });
    };
    wireFlip(totalSpentFlipEl);
    wireFlip(topCategoryFlipEl);
    wireFlip(utilitiesFlipEl);
    wireFlip(totalTransactionsFlipEl);

    // The Supabase SDK may still be loading from the fallback CDN —
    // retry for up to 10s before showing "not configured".
    for (let i = 0; i < 50 && !sb; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        pmInitClient();
    }

    if (!sb) {
        setStatus('unconfigured', 'Not configured');
        setFormEnabled(false);
        showToast('Could not load the Supabase SDK. Check your connection and refresh.', 'error');
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
