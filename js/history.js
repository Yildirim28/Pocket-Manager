/* =============================================================
   Pocket Manager — js/history.js
   Full transaction history (history.html): search, filters,
   sorting, pagination, trash (soft delete) and PDF export.

   PDF generation lives in js/pdf.js (shared with archive.html).
   Deleting an expense sets expenses.deleted_at instead of removing
   the row, so the Archive tab can restore or purge it later.
   ============================================================= */

'use strict';

(function historyPage() {
    /* ---------------- ELEMENTS ---------------- */
    const els = {
        refresh: document.getElementById('refreshButton'),
        pdf: document.getElementById('pdfButton'),
        pdfText: document.getElementById('pdfButtonText'),
        fullPdf: document.getElementById('fullPdfButton'),
        fullPdfText: document.getElementById('fullPdfButtonText'),
        statTotal: document.getElementById('statTotal'),
        statMonth: document.getElementById('statMonth'),
        statCount: document.getElementById('statCount'),
        statAvg: document.getElementById('statAvg'),
        search: document.getElementById('filterSearch'),
        category: document.getElementById('filterCategory'),
        person: document.getElementById('filterPerson'),
        month: document.getElementById('filterMonth'),
        sort: document.getElementById('filterSort'),
        summary: document.getElementById('filterSummary'),
        clear: document.getElementById('filterClear'),
        countBadge: document.getElementById('historyCountBadge'),
        loading: document.getElementById('historyLoading'),
        empty: document.getElementById('historyEmpty'),
        emptyTitle: document.getElementById('historyEmptyTitle'),
        emptyHint: document.getElementById('historyEmptyHint'),
        tableWrap: document.getElementById('historyTableWrap'),
        tableBody: document.getElementById('historyTableBody'),
        list: document.getElementById('historyList'),
        pagination: document.getElementById('historyPagination'),
        range: document.getElementById('historyRange'),
        pager: document.getElementById('historyPager'),
        perPage: document.getElementById('perPage'),
        heroTotal: document.getElementById('heroTotal'),
        heroDelta: document.getElementById('heroDelta'),
        heroChart: document.getElementById('heroChart'),
        heroOrbit: document.getElementById('heroOrbit'),
        heroRangeLabel: document.getElementById('heroRangeLabel')
    };

    const CATEGORY_COLORS = {
        Food: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300 dark:ring-1 dark:ring-inset dark:ring-green-500/25',
        Transport: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-1 dark:ring-inset dark:ring-blue-500/25',
        Bills: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300 dark:ring-1 dark:ring-inset dark:ring-red-500/25',
        Utilities: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-1 dark:ring-inset dark:ring-sky-500/25',
        Rent: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:ring-1 dark:ring-inset dark:ring-fuchsia-500/25',
        Entertainment: 'bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-1 dark:ring-inset dark:ring-purple-500/25',
        Shopping: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-1 dark:ring-inset dark:ring-amber-500/25',
        Other: 'bg-slate-100 text-slate-800 dark:bg-slate-500/15 dark:text-slate-200 dark:ring-1 dark:ring-inset dark:ring-slate-500/25',
        General: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-1 dark:ring-inset dark:ring-indigo-500/25'
    };

    const TRASH_ICON = '<i data-lucide="trash-2" class="h-4 w-4"></i>';
    const DELETE_BUTTON_CLASSES =
        'inline-flex items-center justify-center rounded-lg p-2 text-slate-400 dark:text-slate-500 transition-colors ' +
        'hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500';
    const DELETE_ARMED_CLASSES =
        'inline-flex items-center justify-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs ' +
        'font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500';

    /* ---------------- STATE ---------------- */
    let allExpenses = [];
    let filtered = [];
    let armTimer = null;
    const view = {
        query: '',
        category: '',
        person: '',
        month: '',
        sort: 'date-desc',
        page: 1,
        perPage: 20
    };

    /* ---------------- SMALL HELPERS ---------------- */
    function monthLabel(key) {
        const [year, month] = String(key).split('-');
        const date = new Date(Number(year), Number(month) - 1, 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    function badgeHtml(category) {
        const name = category || 'General';
        const colors = CATEGORY_COLORS[name] || CATEGORY_COLORS.General;
        return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors}">${escapeHTML(name)}</span>`;
    }

    function utilityChipHtml(expense) {
        if ((expense.category || '') !== 'Utilities' || !expense.utility_type) return '';
        return (
            '<span class="inline-flex items-center rounded-md bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">' +
            `${escapeHTML(expense.utility_type)}</span>`
        );
    }

    function participantsHtml(expense) {
        const participants = Array.isArray(expense.participants) ? expense.participants : [];
        if (participants.length === 0) return '<span class="pm-faint text-xs">—</span>';
        return participants
            .map(
                (p) =>
                    '<span class="inline-flex items-center rounded-md bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">' +
                    `${escapeHTML(p.name)} ${formatCurrency(p.amount)}</span>`
            )
            .join(' ');
    }

    /* ---------------- FILTERING ---------------- */
    function applyFilters() {
        const q = view.query.trim().toLowerCase();
        filtered = allExpenses.filter((expense) => {
            if (view.category && (expense.category || 'General') !== view.category) return false;
            if (view.month && String(expense.expense_date).slice(0, 7) !== view.month) return false;
            if (view.person) {
                const names = Array.isArray(expense.participants)
                    ? expense.participants.map((p) => String(p.name).toLowerCase())
                    : [];
                if (!names.includes(view.person.toLowerCase())) return false;
            }
            if (q) {
                const people = Array.isArray(expense.participants)
                    ? expense.participants.map((p) => p.name).join(' ')
                    : '';
                const haystack = `${expense.description || ''} ${expense.category || ''} ${expense.utility_type || ''} ${people}`.toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });

        filtered.sort((a, b) => {
            switch (view.sort) {
                case 'date-asc':
                    return String(a.expense_date).localeCompare(String(b.expense_date));
                case 'amount-desc':
                    return Number(b.amount) - Number(a.amount);
                case 'amount-asc':
                    return Number(a.amount) - Number(b.amount);
                case 'description-asc':
                    return String(a.description || '').localeCompare(String(b.description || ''));
                default:
                    return String(b.expense_date).localeCompare(String(a.expense_date));
            }
        });

        const pages = Math.max(1, Math.ceil(filtered.length / view.perPage));
        if (view.page > pages) view.page = pages;
    }

    function renderFilterSummary() {
        const active = [
            view.query.trim() && `search “${view.query.trim()}”`,
            view.category && `category ${view.category}`,
            view.person && `person ${view.person}`,
            view.month && monthLabel(view.month)
        ].filter(Boolean);

        els.summary.textContent = active.length
            ? `${active.length} filter${active.length === 1 ? '' : 's'} applied · ${active.join(' · ')}`
            : 'No filters applied';
    }

    /* ---------------- SUMMARY ---------------- */
    function renderStats() {
        const total = allExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const monthKey = currentMonthKey();
        const monthTotal = allExpenses
            .filter((e) => String(e.expense_date).slice(0, 7) === monthKey)
            .reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const count = allExpenses.length;
        const avg = count > 0 ? total / count : 0;

        els.statTotal.textContent = formatCurrency(total);
        els.statMonth.textContent = formatCurrency(monthTotal);
        els.statCount.textContent = count.toLocaleString();
        els.statAvg.textContent = formatCurrency(avg);
    }

    /* ---------------- TABLE / LIST ---------------- */
    function tableRowHtml(expense) {
        return (
            '<tr class="pm-row group">' +
            `<td class="whitespace-nowrap px-5 py-4 pm-muted text-xs">${formatDate(expense.expense_date)}</td>` +
            '<td class="px-5 py-4">' +
            `<p class="font-medium">${escapeHTML(expense.description)}</p>` +
            `<p class="pm-faint text-[11px]">Added ${formatTimestamp(expense.created_at)}</p>` +
            '</td>' +
            `<td class="px-5 py-4"><div class="flex flex-wrap items-center gap-1">${badgeHtml(expense.category)}${utilityChipHtml(expense)}</div></td>` +
            `<td class="px-5 py-4"><div class="flex max-w-xs flex-wrap gap-1">${participantsHtml(expense)}</div></td>` +
            `<td class="px-5 py-4 text-right font-semibold tabular-nums">${formatCurrency(expense.amount)}</td>` +
            `<td class="px-5 py-4 text-right">${deleteButtonHtml(expense.id)}</td>` +
            '</tr>'
        );
    }

    function listItemHtml(expense) {
        return (
            '<li class="pm-row p-4">' +
            '<div class="flex items-start justify-between gap-3">' +
            '<div class="min-w-0">' +
            `<p class="truncate font-medium">${escapeHTML(expense.description)}</p>` +
            `<div class="mt-2 flex flex-wrap items-center gap-2">${badgeHtml(expense.category)}${utilityChipHtml(expense)}` +
            `<span class="pm-faint text-xs">${formatDate(expense.expense_date)}</span></div>` +
            `<div class="mt-2 flex flex-wrap gap-1">${participantsHtml(expense)}</div>` +
            '</div>' +
            '<div class="flex flex-col items-end gap-2">' +
            `<span class="font-semibold tabular-nums">${formatCurrency(expense.amount)}</span>` +
            `${deleteButtonHtml(expense.id)}</div>` +
            '</div></li>'
        );
    }

    function deleteButtonHtml(id) {
        return (
            `<button type="button" data-id="${id}" data-armed="false" title="Delete expense" ` +
            `aria-label="Delete expense" class="${DELETE_BUTTON_CLASSES}">${TRASH_ICON}</button>`
        );
    }

    function pagerButton(label, page, { active = false, disabled = false, icon = null } = {}) {
        const cls = active ? 'pm-btn pm-btn-primary px-3 py-1.5 text-xs' : 'pm-btn pm-btn-outline px-3 py-1.5 text-xs';
        const inner = icon ? `<i data-lucide="${icon}" class="h-3.5 w-3.5"></i>` : label;
        return (
            `<button type="button" data-page="${page}" ${disabled ? 'disabled' : ''} class="${cls}">${inner}</button>`
        );
    }

    function renderPagination() {
        const total = filtered.length;
        if (total === 0) {
            els.pagination.classList.add('hidden');
            els.pagination.classList.remove('flex');
            els.pager.innerHTML = '';
            return;
        }
        els.pagination.classList.remove('hidden');
        els.pagination.classList.add('flex');

        const pages = Math.max(1, Math.ceil(total / view.perPage));
        const startIdx = (view.page - 1) * view.perPage + 1;
        const endIdx = Math.min(total, view.page * view.perPage);
        els.range.textContent = `Showing ${startIdx}–${endIdx} of ${total.toLocaleString()}`;

        const buttons = [pagerButton('', view.page - 1, { disabled: view.page === 1, icon: 'chevron-left' })];

        const windowSize = 5;
        let first = Math.max(1, view.page - Math.floor(windowSize / 2));
        let last = Math.min(pages, first + windowSize - 1);
        first = Math.max(1, last - windowSize + 1);

        if (first > 1) buttons.push(pagerButton('1', 1, { active: view.page === 1 }));
        if (first > 2) buttons.push('<span class="pm-faint px-1 text-xs">…</span>');
        for (let p = first; p <= last; p++) {
            buttons.push(pagerButton(String(p), p, { active: p === view.page }));
        }
        if (last < pages - 1) buttons.push('<span class="pm-faint px-1 text-xs">…</span>');
        if (last < pages) buttons.push(pagerButton(String(pages), pages, { active: view.page === pages }));

        buttons.push(pagerButton('', view.page + 1, { disabled: view.page === pages, icon: 'chevron-right' }));

        els.pager.innerHTML = buttons.join('');
    }

    function applyDelta(el, current, previous) {
        if (!el) return;
        if (!previous) {
            el.textContent = current > 0 ? 'New' : '—';
            el.style.color = '';
            return;
        }
        const change = ((current - previous) / previous) * 100;
        const up = change > 0;
        el.textContent = `${up ? '↑' : '↓'} ${Math.round(Math.abs(change))}%`;
        el.style.color = up ? '#fda4af' : 'var(--pm-accent-to)';
    }

    /* Hero: filtered total, month-over-month delta, 12-month trend
       and the category orbit. */
    function renderInsights() {
        const total = filtered.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        if (els.heroTotal) els.heroTotal.textContent = formatCurrency(total);
        if (els.heroRangeLabel) {
            els.heroRangeLabel.textContent = view.month ? `in ${monthLabel(view.month)}` : 'in view';
        }

        const now = new Date();
        const keyOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const sumFor = (key) =>
            allExpenses
                .filter((e) => String(e.expense_date).slice(0, 7) === key)
                .reduce((sum, e) => sum + Number(e.amount || 0), 0);

        applyDelta(
            els.heroDelta,
            sumFor(keyOf(now)),
            sumFor(keyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1)))
        );

        if (typeof pmRenderAreaChart === 'function') {
            pmRenderAreaChart(els.heroChart, pmMonthlySeries(filtered, 12), { height: 190 });
        }
        if (typeof pmRenderOrbitChart === 'function') {
            pmRenderOrbitChart(els.heroOrbit, pmCategoryTotals(filtered, 7));
        }
    }

    function render() {
        applyFilters();
        renderFilterSummary();
        renderInsights();

        const hasAny = allExpenses.length > 0;
        const hasVisible = filtered.length > 0;

        els.loading.classList.add('hidden');
        els.empty.classList.toggle('hidden', hasVisible);
        els.tableWrap.classList.toggle('pm-force-hidden', !hasVisible);
        els.list.classList.toggle('pm-force-hidden', !hasVisible);
        els.countBadge.textContent = filtered.length.toLocaleString();

        if (!hasVisible) {
            els.emptyTitle.textContent = hasAny ? 'No matching transactions' : 'No expenses yet';
            els.emptyHint.textContent = hasAny
                ? 'Try clearing a filter or searching for something else.'
                : 'Add your first expense on the dashboard and it will show up here.';
            els.tableBody.innerHTML = '';
            els.list.innerHTML = '';
            els.pagination.classList.add('hidden');
            els.pagination.classList.remove('flex');
            window.lucide?.createIcons();
            return;
        }

        const start = (view.page - 1) * view.perPage;
        const pageRows = filtered.slice(start, start + view.perPage);

        els.tableBody.innerHTML = pageRows.map(tableRowHtml).join('');
        els.list.innerHTML = pageRows.map(listItemHtml).join('');
        renderPagination();
        window.lucide?.createIcons();
    }

    /* ---------------- FILTER OPTION POPULATION ---------------- */
    function fillSelect(select, options, keepValue, allLabel) {
        const previous = select.value;
        select.innerHTML =
            `<option value="">${allLabel}</option>` +
            options.map((o) => `<option value="${escapeHTML(o.value)}">${escapeHTML(o.label)}</option>`).join('');
        const wanted = keepValue ?? previous;
        if (wanted && options.some((o) => o.value === wanted)) select.value = wanted;
    }

    function populateFilters() {
        const categories = [...new Set(allExpenses.map((e) => e.category || 'General'))].sort();
        const people = [
            ...new Set(
                allExpenses.flatMap((e) =>
                    Array.isArray(e.participants) ? e.participants.map((p) => String(p.name)) : []
                )
            )
        ].sort((a, b) => a.localeCompare(b));
        const months = [...new Set(allExpenses.map((e) => String(e.expense_date).slice(0, 7)))]
            .sort()
            .reverse();

        fillSelect(els.category, categories.map((c) => ({ value: c, label: c })), view.category, 'All categories');
        fillSelect(els.person, people.map((p) => ({ value: p, label: p })), view.person, 'Anyone');
        fillSelect(els.month, months.map((m) => ({ value: m, label: monthLabel(m) })), view.month, 'All months');
    }

    /* ---------------- DATA ---------------- */
    async function fetchExpenses() {
        els.loading.classList.remove('hidden');
        els.empty.classList.add('hidden');
        els.tableWrap.classList.add('pm-force-hidden');
        els.list.classList.add('pm-force-hidden');
        try {
            const { data, error } = await sb
                .from(EXPENSES_TABLE)
                .select('*')
                .order('expense_date', { ascending: false })
                .order('created_at', { ascending: false });
            if (error) throw error;
            // Trashed rows (deleted_at set) never appear in the ledger.
            allExpenses = (data ?? []).filter((expense) => !expense.deleted_at);
            populateFilters();
            renderStats();
            render();
        } catch (error) {
            showToast(`Could not load history: ${error.message}`, 'error');
            els.loading.classList.add('hidden');
            els.empty.classList.remove('hidden');
            els.emptyTitle.textContent = 'Could not load history';
            els.emptyHint.textContent = 'Check your connection and try refreshing.';
        }
    }

    /* ---------------- DELETE (two-stage confirm) ---------------- */
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

    async function deleteExpense(id) {
        const index = allExpenses.findIndex((expense) => expense.id === id);
        if (index === -1) return;
        const removed = allExpenses[index];

        allExpenses.splice(index, 1);
        renderStats();
        render();

        try {
            // Soft delete: the row is kept for the Archive tab's trash
            // and excluded from every calculation.
            const { error } = await sb
                .from(EXPENSES_TABLE)
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;
            showToast('Expense moved to trash.', 'success');
        } catch (error) {
            allExpenses.splice(Math.min(index, allExpenses.length), 0, removed);
            renderStats();
            render();
            const hint = String(error.message || '').includes('deleted_at')
                ? ' Run the v5 migration in schema.sql (Supabase SQL Editor) first.'
                : '';
            showToast(`Failed to delete expense: ${error.message}.${hint}`, 'error');
        }
    }

    /* =============================================================
       PDF EXPORT — delegates to the shared module in js/pdf.js
       ============================================================= */

    /* Exports exactly what the current filters show. */
    function exportPdf() {
        const hasFilters = !!(view.query.trim() || view.category || view.person || view.month);
        return pmPdf.exportRows(filtered.slice(), {
            filtered: hasFilters,
            button: els.pdf,
            buttonText: els.pdfText,
            idleLabel: 'Download PDF',
            emptyMessage: 'Nothing to export with the current filters.'
        });
    }

    /* Exports the complete ledger, ignoring the active filters. */
    function exportFullPdf() {
        return pmPdf.exportRows(allExpenses.slice(), {
            button: els.fullPdf,
            buttonText: els.fullPdfText,
            idleLabel: 'Download full history',
            emptyMessage: 'No expenses to export yet.'
        });
    }

    /* ---------------- EVENTS ---------------- */
    function wireEvents() {
        els.refresh.addEventListener('click', fetchExpenses);
        els.pdf.addEventListener('click', exportPdf);
        els.fullPdf?.addEventListener('click', exportFullPdf);

        let searchTimer = null;
        els.search.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                view.query = els.search.value;
                view.page = 1;
                render();
            }, 200);
        });

        els.category.addEventListener('change', () => {
            view.category = els.category.value;
            view.page = 1;
            render();
        });
        els.person.addEventListener('change', () => {
            view.person = els.person.value;
            view.page = 1;
            render();
        });
        els.month.addEventListener('change', () => {
            view.month = els.month.value;
            view.page = 1;
            render();
        });
        els.sort.addEventListener('change', () => {
            view.sort = els.sort.value;
            view.page = 1;
            render();
        });

        els.clear.addEventListener('click', () => {
            view.query = '';
            view.category = '';
            view.person = '';
            view.month = '';
            view.sort = 'date-desc';
            view.page = 1;
            els.search.value = '';
            els.category.value = '';
            els.person.value = '';
            els.month.value = '';
            els.sort.value = 'date-desc';
            render();
        });

        els.perPage.addEventListener('change', () => {
            view.perPage = Number(els.perPage.value) || 20;
            view.page = 1;
            render();
        });

        els.pager.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-page]');
            if (!button || button.disabled) return;
            const page = Number(button.getAttribute('data-page'));
            if (!Number.isFinite(page)) return;
            view.page = page;
            render();
            document.getElementById('results-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        const delegateDelete = (event) => {
            const button = event.target.closest('button[data-id]');
            if (!button) return;
            if (button.getAttribute('data-armed') === 'true') {
                disarmAllDeleteButtons();
                deleteExpense(button.getAttribute('data-id'));
            } else {
                armDeleteButton(button);
            }
        };
        els.tableBody.addEventListener('click', delegateDelete);
        els.list.addEventListener('click', delegateDelete);
        els.empty.addEventListener('click', delegateDelete);
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (!sb) {
            showToast('Missing Supabase credentials in js/config.js.', 'error');
            return;
        }
        const session = await requireAuth();
        if (!session) return;

        wireEvents();
        await fetchExpenses();
    });
})();
