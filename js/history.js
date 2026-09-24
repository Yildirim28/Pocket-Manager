/* =============================================================
   Pocket Manager — js/history.js
   Full transaction history (history.html): search, filters,
   sorting, pagination, delete and PDF export.

   The PDF is generated locally (no dependencies): each page is
   rendered as an SVG table, rasterised to JPEG, then embedded as
   an image XObject in a hand-written PDF file.
   ============================================================= */

'use strict';

(function historyPage() {
    /* ---------------- ELEMENTS ---------------- */
    const els = {
        refresh: document.getElementById('refreshButton'),
        pdf: document.getElementById('pdfButton'),
        pdfText: document.getElementById('pdfButtonText'),
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
    function truncate(value, max) {
        const str = String(value ?? '');
        return str.length > max ? str.slice(0, max - 1) + '…' : str;
    }

    function xmlEscape(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
    }

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

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
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
            allExpenses = data ?? [];
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
            const { error } = await sb.from(EXPENSES_TABLE).delete().eq('id', id);
            if (error) throw error;
            showToast('Expense deleted.', 'success');
        } catch (error) {
            allExpenses.splice(Math.min(index, allExpenses.length), 0, removed);
            renderStats();
            render();
            showToast(`Failed to delete expense: ${error.message}`, 'error');
        }
    }

    /* =============================================================
       PDF EXPORT — vector-lite: SVG table -> JPEG -> PDF pages
       ============================================================= */
    const PDF_ROWS_PER_PAGE = 28;

    function pdfPageSvg(rows, info) {
        const W = 1000;
        const H = 1414;
        const padX = 48;
        const amountRight = W - padX;
        const cols = { date: padX, desc: padX + 155, cat: 606, people: 772 };
        const FONT = 'Arial, Helvetica, sans-serif';
        const rowH = 36;
        const firstRowY = 282;

        const rootStyles = getComputedStyle(document.documentElement);
        const accent = rootStyles.getPropertyValue('--pm-accent').trim() || '#10b981';
        const accentTo = rootStyles.getPropertyValue('--pm-accent-to').trim() || '#34d399';

        const parts = [];
        parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
        parts.push(
            `<defs><linearGradient id="hdr" x1="0" y1="0" x2="1" y2="1">` +
            `<stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${accentTo}"/>` +
            `</linearGradient></defs>`
        );
        parts.push(`<rect width="${W}" height="140" fill="url(#hdr)"/>`);
        parts.push(`<text x="${padX}" y="66" font-family="${FONT}" font-size="34" font-weight="800" fill="#ffffff">Transaction History</text>`);
        parts.push(
            `<text x="${padX}" y="102" font-family="${FONT}" font-size="15" fill="#ffffff" opacity="0.9">` +
            `Pocket Manager · Generated ${xmlEscape(formatDate(todayLocalISO()))}${info.filtered ? ' · Filtered view' : ''}</text>`
        );
        parts.push(
            `<text x="${amountRight}" y="66" font-family="${FONT}" font-size="13" font-weight="700" ` +
            `fill="#ffffff" text-anchor="end" opacity="0.9">Page ${info.page} of ${info.pageCount}</text>`
        );

        parts.push(
            `<text x="${padX}" y="186" font-family="${FONT}" font-size="15" fill="#0f172a">` +
            `<tspan font-weight="700">${info.count}</tspan> transactions</text>`
        );
        parts.push(
            `<text x="${amountRight}" y="186" font-family="${FONT}" font-size="15" fill="#0f172a" text-anchor="end">` +
            `<tspan font-weight="700">Total </tspan><tspan font-weight="800" fill="${accent}">${xmlEscape(formatCurrency(info.total))}</tspan></text>`
        );

        const head = `font-family="${FONT}" font-size="12" font-weight="700" fill="#64748b" letter-spacing="1"`;
        parts.push(`<text x="${cols.date}" y="236" ${head}>DATE</text>`);
        parts.push(`<text x="${cols.desc}" y="236" ${head}>DESCRIPTION</text>`);
        parts.push(`<text x="${cols.cat}" y="236" ${head}>CATEGORY</text>`);
        parts.push(`<text x="${cols.people}" y="236" ${head}>PEOPLE</text>`);
        parts.push(`<text x="${amountRight}" y="236" ${head} text-anchor="end">AMOUNT</text>`);
        parts.push(`<line x1="${padX - 12}" y1="252" x2="${amountRight + 12}" y2="252" stroke="#e2e8f0" stroke-width="2"/>`);

        let y = firstRowY;
        rows.forEach((expense, index) => {
            if (index % 2 === 0) {
                parts.push(
                    `<rect x="${padX - 12}" y="${y - 24}" width="${W - (padX - 12) * 2}" height="${rowH}" fill="#f8fafc" rx="8"/>`
                );
            }
            const people = Array.isArray(expense.participants)
                ? expense.participants.map((p) => p.name).join(', ')
                : '—';
            const type = expense.utility_type ? ` (${expense.utility_type})` : '';
            parts.push(`<text x="${cols.date}" y="${y}" font-family="${FONT}" font-size="13" fill="#64748b">${xmlEscape(formatDate(expense.expense_date))}</text>`);
            parts.push(`<text x="${cols.desc}" y="${y}" font-family="${FONT}" font-size="14" fill="#0f172a">${xmlEscape(truncate(expense.description, 44))}</text>`);
            parts.push(`<text x="${cols.cat}" y="${y}" font-family="${FONT}" font-size="13" fill="#475569">${xmlEscape(truncate((expense.category || 'General') + type, 20))}</text>`);
            parts.push(`<text x="${cols.people}" y="${y}" font-family="${FONT}" font-size="13" fill="#475569">${xmlEscape(truncate(people, 16))}</text>`);
            parts.push(
                `<text x="${amountRight}" y="${y}" font-family="${FONT}" font-size="14" font-weight="700" ` +
                `fill="#0f172a" text-anchor="end">${xmlEscape(formatCurrency(expense.amount))}</text>`
            );
            y += rowH;
        });

        if (info.last) {
            parts.push(`<line x1="${padX - 12}" y1="${y - 14}" x2="${amountRight + 12}" y2="${y - 14}" stroke="#e2e8f0" stroke-width="2"/>`);
            const totalY = y + 30;
            parts.push(`<text x="${cols.desc}" y="${totalY}" font-family="${FONT}" font-size="16" font-weight="700" fill="#0f172a">Total</text>`);
            parts.push(
                `<text x="${amountRight}" y="${totalY}" font-family="${FONT}" font-size="20" font-weight="800" ` +
                `fill="${accent}" text-anchor="end">${xmlEscape(formatCurrency(info.total))}</text>`
            );
        }

        parts.push(`<line x1="${padX}" y1="${H - 64}" x2="${amountRight}" y2="${H - 64}" stroke="#e2e8f0" stroke-width="1"/>`);
        parts.push(`<text x="${padX}" y="${H - 38}" font-family="${FONT}" font-size="11" fill="#94a3b8">Generated by Pocket Manager</text>`);
        parts.push(`<text x="${amountRight}" y="${H - 38}" font-family="${FONT}" font-size="11" fill="#94a3b8" text-anchor="end">Page ${info.page} / ${info.pageCount}</text>`);

        return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;
    }

    async function svgToJpegPage(svg) {
        const scale = 1.4;
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
        try {
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Could not render the report page.'));
                img.src = url;
            });
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(1000 * scale);
            canvas.height = Math.round(1414 * scale);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const base64 = canvas.toDataURL('image/jpeg', 0.86).split(',')[1];
            const bin = atob(base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return { bytes, w: canvas.width, h: canvas.height };
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    /* Assembles a valid multi-page PDF (one JPEG per page). */
    function buildPdf(pages) {
        const pageW = 595.28;
        const pageH = 841.89;
        const enc = new TextEncoder();
        const chunks = [];
        let pos = 0;
        const pushStr = (str) => {
            const b = enc.encode(str);
            chunks.push(b);
            pos += b.length;
        };
        const pushBytes = (b) => {
            chunks.push(b);
            pos += b.length;
        };

        const offsets = {};
        const n = pages.length;
        const total = 2 + 3 * n;

        pushStr('%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n');

        offsets[1] = pos;
        pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

        const kids = [];
        for (let i = 0; i < n; i++) kids.push(`${3 + 3 * i} 0 R`);
        offsets[2] = pos;
        pushStr(`2 0 obj\n<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${n} >>\nendobj\n`);

        for (let i = 0; i < n; i++) {
            const pageId = 3 + 3 * i;
            const contentId = 4 + 3 * i;
            const imageId = 5 + 3 * i;

            offsets[pageId] = pos;
            pushStr(
                `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
                `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`
            );

            const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
            offsets[contentId] = pos;
            pushStr(`${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

            const img = pages[i];
            offsets[imageId] = pos;
            pushStr(
                `${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} ` +
                `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`
            );
            pushBytes(img.bytes);
            pushStr('\nendstream\nendobj\n');
        }

        const xrefPos = pos;
        let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
        for (let id = 1; id <= total; id++) {
            xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
        }
        pushStr(xref);
        pushStr(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

        return new Blob(chunks, { type: 'application/pdf' });
    }

    async function exportPdf() {
        if (filtered.length === 0) {
            showToast('Nothing to export with the current filters.', 'info');
            return;
        }

        const rows = filtered.slice();
        const total = rows.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const pageCount = Math.max(1, Math.ceil(rows.length / PDF_ROWS_PER_PAGE));
        const hasFilters = !!(view.query.trim() || view.category || view.person || view.month);

        els.pdf.disabled = true;
        els.pdfText.textContent = 'Preparing…';
        try {
            const pages = [];
            for (let i = 0; i < rows.length; i += PDF_ROWS_PER_PAGE) {
                const chunk = rows.slice(i, i + PDF_ROWS_PER_PAGE);
                const svg = pdfPageSvg(chunk, {
                    page: pages.length + 1,
                    pageCount,
                    count: rows.length,
                    total,
                    last: i + PDF_ROWS_PER_PAGE >= rows.length,
                    filtered: hasFilters
                });
                pages.push(await svgToJpegPage(svg));
                els.pdfText.textContent = `Preparing ${pages.length}/${pageCount}…`;
            }

            downloadBlob(buildPdf(pages), `pocket-manager-history-${todayLocalISO()}.pdf`);
            showToast(`Exported ${rows.length} transactions as PDF.`, 'success');
        } catch (error) {
            showToast(`PDF export failed: ${error.message}`, 'error');
        } finally {
            els.pdf.disabled = false;
            els.pdfText.textContent = 'Download PDF';
        }
    }

    /* ---------------- EVENTS ---------------- */
    function wireEvents() {
        els.refresh.addEventListener('click', fetchExpenses);
        els.pdf.addEventListener('click', exportPdf);

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
