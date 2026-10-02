/* =============================================================
   Pocket Manager — js/archive.js
   Archive page (archive.html): month-by-month detail views,
   the history PDF list and the trash (soft-deleted expenses).

   Trashed rows (deleted_at set) are excluded from every total,
   chart and export — they only live in the trash manager below,
   where they can be restored or deleted forever.
   ============================================================= */

'use strict';

(function archivePage() {
    /* ---------------- ELEMENTS ---------------- */
    const els = {
        refresh: document.getElementById('refreshButton'),
        statTotal: document.getElementById('statTotal'),
        statMonths: document.getElementById('statMonths'),
        statCount: document.getElementById('statCount'),
        statTrash: document.getElementById('statTrash'),
        heroTotal: document.getElementById('heroTotal'),
        heroDelta: document.getElementById('heroDelta'),
        heroChart: document.getElementById('heroChart'),
        heroOrbit: document.getElementById('heroOrbit'),
        monthsCountBadge: document.getElementById('monthsCountBadge'),
        monthsLoading: document.getElementById('monthsLoading'),
        monthsEmpty: document.getElementById('monthsEmpty'),
        monthsList: document.getElementById('monthsList'),
        fullPdf: document.getElementById('fullPdfButton'),
        fullPdfText: document.getElementById('fullPdfButtonText'),
        pdfList: document.getElementById('pdfList'),
        pdfListEmpty: document.getElementById('pdfListEmpty'),
        trashCountBadge: document.getElementById('trashCountBadge'),
        trashLoading: document.getElementById('trashLoading'),
        trashEmpty: document.getElementById('trashEmpty'),
        trashList: document.getElementById('trashList'),
        emptyTrash: document.getElementById('emptyTrashButton')
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

    const PURGE_IDLE_CLASSES = 'pm-btn pm-btn-danger px-3 py-1.5 text-xs';
    const PURGE_ARMED_CLASSES =
        'inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs ' +
        'font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500';
    const MASCOTS = ['🦊', '🐼', '🐯', '🦁', '🐨', '🐵', '🐸', '🐧', '🐰', '🐻', '🦉', '🐙', '🦄', '🐢', '🐳', '🦜', '🐝', '🦋', '🐬', '🐿️'];
    const AVATAR_COLORS = [
        { from: '#a78bfa', to: '#a855f7' },
        { from: '#38bdf8', to: '#3b82f6' },
        { from: '#fbbf24', to: '#f97316' },
        { from: '#34d399', to: '#14b8a6' },
        { from: '#e879f9', to: '#ec4899' },
        { from: '#22d3ee', to: '#0ea5e9' },
        { from: '#a3e635', to: '#22c55e' }
    ];

    /* ---------------- STATE ---------------- */
    let activeExpenses = [];   // counted everywhere
    let trashedExpenses = [];  // counted nowhere
    let monthKeys = [];        // descending
    const expanded = new Set();
    let monthlyBudget = DEFAULT_MONTHLY_BUDGET;
    let currentUser = null;
    let armTimer = null;

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
        if (participants.length === 0) return '';
        return participants
            .map(
                (p) =>
                    '<span class="inline-flex items-center rounded-md bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">' +
                    `${escapeHTML(p.name)} ${formatCurrency(p.amount)}</span>`
            )
            .join(' ');
    }

    function mascotFor(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = (hash * 33 + name.charCodeAt(i)) >>> 0;
        return MASCOTS[hash % MASCOTS.length];
    }

    function personColors(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
        return AVATAR_COLORS[hash % AVATAR_COLORS.length];
    }

    function sum(rows) {
        return rows.reduce((total, e) => total + Number(e.amount || 0), 0);
    }

    function statTile(label, value) {
        return (
            '<div class="rounded-xl border border-slate-200/70 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/40">' +
            `<p class="pm-faint text-[10px] font-bold uppercase tracking-wider">${label}</p>` +
            `<p class="mt-0.5 truncate text-sm font-bold">${value}</p>` +
            '</div>'
        );
    }

    /* ---------------- HERO STATS + INSIGHTS ---------------- */
    function renderStats() {
        const total = sum(activeExpenses);
        const months = new Set(activeExpenses.map((e) => String(e.expense_date).slice(0, 7))).size;

        els.statTotal.textContent = formatCurrency(total);
        els.statMonths.textContent = months.toLocaleString();
        els.statCount.textContent = activeExpenses.length.toLocaleString();
        els.statTrash.textContent = trashedExpenses.length.toLocaleString();
        els.trashCountBadge.textContent = trashedExpenses.length.toLocaleString();
        els.monthsCountBadge.textContent = months.toLocaleString();

        if (els.heroTotal) els.heroTotal.textContent = formatCurrency(total);

        // Month-over-month delta on the current month vs previous.
        const now = new Date();
        const keyOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const sumFor = (key) => sum(activeExpenses.filter((e) => String(e.expense_date).slice(0, 7) === key));
        const current = sumFor(keyOf(now));
        const previous = sumFor(keyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
        applyDelta(els.heroDelta, current, previous);

        if (typeof pmRenderAreaChart === 'function') {
            pmRenderAreaChart(els.heroChart, pmMonthlySeries(activeExpenses, 12), { height: 190 });
        }
        if (typeof pmRenderOrbitChart === 'function') {
            pmRenderOrbitChart(els.heroOrbit, pmCategoryTotals(activeExpenses, 7));
        }
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

    /* ---------------- MONTH ACCORDION ---------------- */
    function groupByMonth(rows) {
        const groups = {};
        rows.forEach((expense) => {
            const key = String(expense.expense_date).slice(0, 7);
            (groups[key] = groups[key] || []).push(expense);
        });
        return Object.keys(groups)
            .sort()
            .reverse()
            .map((key) => ({ key, rows: groups[key].sort((a, b) => String(b.expense_date).localeCompare(String(a.expense_date))) }));
    }

    function monthHeaderHtml(month) {
        const label = monthLabel(month.key);
        const total = sum(month.rows);
        const isOpen = expanded.has(month.key);
        const utilities = sum(month.rows.filter((e) => (e.category || '') === 'Utilities'));
        return (
            '<h3 class="flex items-stretch">' +
            `<button type="button" class="month-toggle flex min-w-0 flex-1 items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60" ` +
            `data-month="${month.key}" aria-expanded="${isOpen}" aria-controls="month-panel-${month.key}">` +
            '<span class="flex min-w-0 items-center gap-3">' +
            `<span class="pm-icon-tile pm-icon-tile-sm"><i data-lucide="${isOpen ? 'chevron-down' : 'chevron-right'}" class="h-4 w-4"></i></span>` +
            '<span class="min-w-0">' +
            `<span class="block truncate text-sm font-semibold">${escapeHTML(label)}</span>` +
            `<span class="pm-faint block text-xs">${month.rows.length} expense${month.rows.length === 1 ? '' : 's'}${utilities > 0 ? ` · Utilities ${formatCurrency(utilities)}` : ''}</span>` +
            '</span>' +
            '</span>' +
            `<span class="pm-stat-value shrink-0 text-sm font-bold">${formatCurrency(total)}</span>` +
            '</button>' +
            '<span class="flex shrink-0 items-center pr-4">' +
            `<button type="button" class="month-pdf pm-btn pm-btn-outline px-2.5 py-1.5 text-xs" data-month-pdf="${month.key}" title="Download ${escapeHTML(label)} as PDF">` +
            '<i data-lucide="file-text" class="h-3.5 w-3.5"></i><span class="hidden sm:inline">PDF</span></button>' +
            '</span>' +
            '</h3>'
        );
    }

    /* ---------------- MONTH DETAIL BLOCKS ---------------- */
    function budgetBarColor(percent) {
        if (percent >= 100) return 'from-rose-500 to-red-500';
        if (percent >= 75) return 'from-amber-300 to-orange-400';
        if (percent >= 25) return 'from-emerald-400 to-emerald-500';
        return 'from-sky-400 to-emerald-500';
    }

    function monthStatTiles(rows) {
        const total = sum(rows);
        const utilities = sum(rows.filter((e) => (e.category || '') === 'Utilities'));
        const people = sum(
            rows.reduce((acc, e) => acc.concat(Array.isArray(e.participants) ? e.participants : []), []).map((p) => Number(p.amount || 0))
        );
        const avg = rows.length > 0 ? total / rows.length : 0;

        return (
            '<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">' +
            statTile('Spent', formatCurrency(total)) +
            statTile('Transactions', rows.length.toLocaleString()) +
            statTile('Average', formatCurrency(avg)) +
            statTile('Utilities', formatCurrency(utilities)) +
            '</div>' +
            (people > 0
                ? `<p class="pm-faint mt-2 text-xs">Split across people: <span class="font-semibold">${formatCurrency(people)}</span></p>`
                : '')
        );
    }

    function budgetBlockHtml(rows) {
        const total = sum(rows);
        const percent = monthlyBudget > 0 ? (total / monthlyBudget) * 100 : 0;
        const clamped = Math.min(Math.max(percent, 0), 100);

        return (
            '<div class="rounded-2xl bg-slate-900 p-4 text-white dark:bg-black/40">' +
            '<div class="flex flex-wrap items-baseline justify-between gap-2">' +
            `<span class="pm-stat-value text-xl font-bold">${formatCurrency(total)}</span>` +
            `<span class="text-xs font-semibold text-white/60">of ${formatCurrency(monthlyBudget)} budget · ${Math.round(percent)}%</span>` +
            '</div>' +
            '<div class="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/15">' +
            `<div class="h-full rounded-full bg-gradient-to-r ${budgetBarColor(percent)}" style="width:${clamped}%"></div>` +
            '</div>' +
            `<p class="mt-2 text-xs text-white/60">${
                percent >= 100
                    ? '💥 Over the monthly target'
                    : `${formatCurrency(Math.max(monthlyBudget - total, 0))} left from the monthly target`
            }</p>` +
            '</div>'
        );
    }

    function utilitiesBlockHtml(rows) {
        const utilityRows = rows.filter((e) => (e.category || '') === 'Utilities');
        if (utilityRows.length === 0) return '';

        const utilityTotal = sum(utilityRows);
        const byType = {};
        utilityRows.forEach((e) => {
            const type = e.utility_type || 'Other';
            byType[type] = (byType[type] || 0) + Number(e.amount || 0);
        });
        const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]);
        const maxValue = entries[0][1] || 1;

        return (
            '<div class="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">' +
            '<p class="pm-eyebrow"><i data-lucide="plug-zap" class="h-3.5 w-3.5"></i> Utilities</p>' +
            `<p class="pm-stat-value mt-1.5 text-lg font-bold">${formatCurrency(utilityTotal)}</p>` +
            '<div class="mt-3 space-y-2.5">' +
            entries
                .map(([type, value]) => {
                    const width = Math.max(6, Math.round((value / maxValue) * 100));
                    const share = utilityTotal > 0 ? Math.round((value / utilityTotal) * 100) : 0;
                    return (
                        '<div>' +
                        '<div class="flex items-baseline justify-between gap-2 text-xs">' +
                        `<span class="font-semibold">${escapeHTML(type)}</span>` +
                        `<span class="font-bold tabular-nums">${formatCurrency(value)} <span class="pm-faint font-medium">${share}%</span></span>` +
                        '</div>' +
                        '<div class="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">' +
                        `<div class="h-full rounded-full bg-sky-400" style="width:${width}%"></div>` +
                        '</div>' +
                        '</div>'
                    );
                })
                .join('') +
            '</div></div>'
        );
    }

    function categoriesBlockHtml(rows) {
        const byCategory = {};
        rows.filter((e) => (e.category || '') !== 'Utilities').forEach((e) => {
            const key = e.category || 'General';
            byCategory[key] = (byCategory[key] || 0) + Number(e.amount || 0);
        });
        const entries = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
        if (entries.length === 0) return '';

        const total = sum(rows);
        const maxValue = entries[0][1] || 1;

        return (
            '<div class="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">' +
            '<p class="pm-eyebrow"><i data-lucide="pie-chart" class="h-3.5 w-3.5"></i> Categories</p>' +
            '<div class="mt-3 space-y-3">' +
            entries
                .map(([name, value]) => {
                    const width = Math.max(6, Math.round((value / maxValue) * 100));
                    const share = total > 0 ? Math.round((value / total) * 100) : 0;
                    return (
                        '<div>' +
                        '<div class="flex items-baseline justify-between gap-2">' +
                        `<span class="flex min-w-0 items-center gap-2">${badgeHtml(name)}</span>` +
                        `<span class="whitespace-nowrap text-xs font-bold tabular-nums">${formatCurrency(value)} <span class="pm-faint font-medium">${share}%</span></span>` +
                        '</div>' +
                        '<div class="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">' +
                        `<div class="h-full rounded-full" style="width:${width}%;background:linear-gradient(90deg, var(--pm-accent), var(--pm-accent-to))"></div>` +
                        '</div>' +
                        '</div>'
                    );
                })
                .join('') +
            '</div></div>'
        );
    }

    function topFiveBlockHtml(rows) {
        if (rows.length === 0) return '';
        const top = [...rows].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5);
        return (
            '<div class="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">' +
            '<p class="pm-eyebrow"><i data-lucide="flame" class="h-3.5 w-3.5"></i> Biggest expenses</p>' +
            '<ol class="mt-3 space-y-2.5">' +
            top
                .map((e, i) => {
                    return (
                        '<li class="flex items-center gap-3">' +
                        `<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">${i + 1}</span>` +
                        '<span class="min-w-0 flex-1">' +
                        `<span class="block truncate text-sm font-medium">${escapeHTML(e.description || 'Untitled')}</span>` +
                        `<span class="pm-faint block text-xs">${formatDate(e.expense_date)}</span>` +
                        '</span>' +
                        `<span class="whitespace-nowrap text-sm font-bold tabular-nums">${formatCurrency(e.amount)}</span>` +
                        '</li>'
                    );
                })
                .join('') +
            '</ol></div>'
        );
    }

    function peopleBlockHtml(rows) {
        const byPerson = {};
        rows.forEach((expense) => {
            (Array.isArray(expense.participants) ? expense.participants : []).forEach((p) => {
                if (!p || !p.name) return;
                const key = String(p.name).trim();
                if (!key) return;
                if (!byPerson[key]) byPerson[key] = { total: 0, details: [] };
                const share = Number(p.amount || 0);
                byPerson[key].total += share;
                byPerson[key].details.push({ description: expense.description, date: expense.expense_date, share });
            });
        });
        const entries = Object.entries(byPerson).sort((a, b) => b[1].total - a[1].total);
        if (entries.length === 0) return '';

        const grand = entries.reduce((acc, [, v]) => acc + v.total, 0) || 1;

        return (
            '<div class="rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">' +
            '<p class="pm-eyebrow"><i data-lucide="users" class="h-3.5 w-3.5"></i> By person</p>' +
            '<div class="mt-3 space-y-4">' +
            entries
                .map(([name, info]) => {
                    const colors = personColors(name);
                    const share = Math.round((info.total / grand) * 100);
                    return (
                        '<div>' +
                        '<div class="flex items-center gap-2">' +
                        `<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base" style="background:linear-gradient(135deg, ${colors.from}, ${colors.to})">${mascotFor(name)}</span>` +
                        '<span class="min-w-0 flex-1">' +
                        `<span class="block truncate text-sm font-semibold">${escapeHTML(name)}</span>` +
                        `<span class="pm-faint block text-xs">${info.details.length} expense${info.details.length === 1 ? '' : 's'}</span>` +
                        '</span>' +
                        `<span class="whitespace-nowrap text-sm font-bold tabular-nums">${formatCurrency(info.total)} <span class="pm-faint text-[11px] font-semibold">· ${share}%</span></span>` +
                        '</div>' +
                        `<ul class="mt-2 space-y-1 border-l-2 pl-3" style="border-color:${colors.from}">` +
                        info.details
                            .map(
                                (d) =>
                                    '<li class="flex items-baseline justify-between gap-2 text-xs">' +
                                    `<span class="pm-muted truncate">${escapeHTML(d.description || 'Untitled')} <span class="pm-faint">${formatDate(d.date)}</span></span>` +
                                    `<span class="whitespace-nowrap font-semibold tabular-nums" style="color:${colors.from}">${formatCurrency(d.share)}</span>` +
                                    '</li>'
                            )
                            .join('') +
                        '</ul>' +
                        '</div>'
                    );
                })
                .join('') +
            '</div></div>'
        );
    }

    function expenseListHtml(rows) {
        if (rows.length === 0) return '';
        return (
            '<div class="rounded-2xl border border-slate-200/70 dark:border-slate-800">' +
            '<div class="flex items-center justify-between gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-slate-800">' +
            '<p class="pm-eyebrow"><i data-lucide="receipt-text" class="h-3.5 w-3.5"></i> Every expense</p>' +
            `<span class="pm-faint text-xs">${rows.length} item${rows.length === 1 ? '' : 's'}</span>` +
            '</div>' +
            '<ul class="divide-y divide-slate-100 dark:divide-slate-800">' +
            rows
                .map((e) => {
                    const date = formatDate(e.expense_date);
                    const desc = escapeHTML(e.description || 'Untitled');
                    const categories = `${badgeHtml(e.category)} ${utilityChipHtml(e)}`;
                    const people = participantsHtml(e);
                    return (
                        '<li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">' +
                        `<span class="pm-faint w-16 shrink-0 text-xs font-medium">${date}</span>` +
                        `<span class="min-w-0 flex-1 font-medium">${desc}` +
                        `<span class="mt-1 flex flex-wrap items-center gap-1">${categories}${people ? ` ${people}` : ''}</span></span>` +
                        `<span class="whitespace-nowrap text-sm font-bold tabular-nums">${formatCurrency(e.amount)}</span>` +
                        '</li>'
                    );
                })
                .join('') +
            '</ul></div>'
        );
    }

    function monthDetailHtml(month) {
        const rows = month.rows;
        const categories = categoriesBlockHtml(rows);
        const utilities = utilitiesBlockHtml(rows);
        const grid = categories || utilities ? '<div class="grid gap-4 lg:grid-cols-2">' + categories + utilities + '</div>' : '';

        const blocks = [
            monthStatTiles(rows),
            budgetBlockHtml(rows),
            grid,
            topFiveBlockHtml(rows),
            peopleBlockHtml(rows),
            expenseListHtml(rows)
        ].filter(Boolean);

        return (
            `<div id="month-panel-${month.key}" class="space-y-4 border-t border-slate-200/70 bg-slate-50/50 px-5 py-5 dark:border-slate-800 dark:bg-slate-900/30">` +
            blocks.join('') +
            '</div>'
        );
    }

    function monthCardHtml(month) {
        const isOpen = expanded.has(month.key);
        return (
            `<div class="month-card" data-month-card="${month.key}">` +
            monthHeaderHtml(month) +
            (isOpen ? monthDetailHtml(month) : '') +
            '</div>'
        );
    }

    function renderMonths() {
        const months = groupByMonth(activeExpenses);
        monthKeys = months.map((m) => m.key);

        els.monthsLoading.classList.add('hidden');
        if (months.length === 0) {
            els.monthsList.innerHTML = '';
            els.monthsEmpty.classList.remove('hidden');
            return;
        }
        els.monthsEmpty.classList.add('hidden');

        // Open the newest month by default on first render.
        if (expanded.size === 0) expanded.add(monthKeys[0]);

        els.monthsList.innerHTML = months.map(monthCardHtml).join('');
        window.lucide?.createIcons();
    }

    function toggleMonth(key) {
        if (expanded.has(key)) expanded.delete(key);
        else expanded.add(key);

        const card = els.monthsList.querySelector(`[data-month-card="${key}"]`);
        const month = groupByMonth(activeExpenses).find((m) => m.key === key);
        if (card && month) {
            card.outerHTML = monthCardHtml(month);
            window.lucide?.createIcons();
        }
    }

    /* ---------------- PDF LIST ---------------- */
    function pdfRowHtml(month) {
        const label = monthLabel(month.key);
        const total = sum(month.rows);
        return (
            '<li class="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">' +
            '<span class="flex min-w-0 items-center gap-3">' +
            '<span class="pm-icon-tile pm-icon-tile-sm"><i data-lucide="calendar-range" class="h-4 w-4"></i></span>' +
            '<span class="min-w-0">' +
            `<span class="block truncate text-sm font-semibold">${escapeHTML(label)}</span>` +
            `<span class="pm-faint block text-xs">${month.rows.length} expense${month.rows.length === 1 ? '' : 's'}</span>` +
            '</span>' +
            '</span>' +
            '<span class="flex items-center gap-3">' +
            `<span class="pm-stat-value text-sm font-bold">${formatCurrency(total)}</span>` +
            `<button type="button" class="month-pdf pm-btn pm-btn-outline px-3 py-1.5 text-xs" data-month-pdf="${month.key}" title="Download ${escapeHTML(label)} as PDF">` +
            '<i data-lucide="download" class="h-3.5 w-3.5"></i><span class="hidden sm:inline">PDF</span></button>' +
            '</span>' +
            '</li>'
        );
    }

    function renderPdfList() {
        const months = groupByMonth(activeExpenses);
        if (months.length === 0) {
            els.pdfList.innerHTML = '';
            els.pdfListEmpty.classList.remove('hidden');
            return;
        }
        els.pdfListEmpty.classList.add('hidden');
        els.pdfList.innerHTML = months.map(pdfRowHtml).join('');
        window.lucide?.createIcons();
    }

    function exportMonthPdf(key) {
        const rows = activeExpenses
            .filter((e) => String(e.expense_date).slice(0, 7) === key)
            .sort((a, b) => String(a.expense_date).localeCompare(String(b.expense_date)));
        const label = monthLabel(key);
        const button = els.monthsList.querySelector(`[data-month-pdf="${key}"]`);
        return pmPdf.exportRows(rows, {
            title: `Expenses — ${label}`,
            range: label,
            filename: `pocket-manager-${key}.pdf`,
            button,
            emptyMessage: 'No expenses in that month.'
        });
    }

    function exportFullPdf() {
        const rows = activeExpenses
            .slice()
            .sort((a, b) => String(a.expense_date).localeCompare(String(b.expense_date)));
        return pmPdf.exportRows(rows, {
            title: 'Full Expense Archive',
            range: monthKeys.length > 0 ? `${monthLabel(monthKeys[monthKeys.length - 1])} – ${monthLabel(monthKeys[0])}` : '',
            filename: `pocket-manager-archive-${todayLocalISO()}.pdf`,
            button: els.fullPdf,
            buttonText: els.fullPdfText,
            idleLabel: 'Download full history',
            emptyMessage: 'No expenses to export yet.'
        });
    }

    /* ---------------- TRASH ---------------- */
    function trashRowHtml(expense) {
        const date = formatDate(expense.expense_date);
        const deleted = formatTimestamp(expense.deleted_at);
        const people = participantsHtml(expense);
        return (
            '<li class="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">' +
            '<span class="min-w-0 flex-1">' +
            `<span class="block truncate text-sm font-medium">${escapeHTML(expense.description || 'Untitled')}</span>` +
            '<span class="mt-1 flex flex-wrap items-center gap-1">' +
            `<span class="pm-faint text-xs">${date}</span>` +
            badgeHtml(expense.category) +
            utilityChipHtml(expense) +
            (people ? ` ${people}` : '') +
            '</span>' +
            (deleted ? `<span class="pm-faint mt-1 block text-[11px]">Deleted ${escapeHTML(deleted)}</span>` : '') +
            '</span>' +
            `<span class="whitespace-nowrap text-sm font-bold tabular-nums">${formatCurrency(expense.amount)}</span>` +
            '<span class="flex items-center gap-2">' +
            `<button type="button" class="pm-btn pm-btn-outline px-3 py-1.5 text-xs" data-restore-id="${expense.id}">` +
            '<i data-lucide="rotate-ccw" class="h-3.5 w-3.5"></i><span>Restore</span></button>' +
            `<button type="button" class="${PURGE_IDLE_CLASSES}" data-purge-id="${expense.id}" data-armed="false">` +
            '<i data-lucide="trash-2" class="h-3.5 w-3.5"></i><span>Delete</span></button>' +
            '</span>' +
            '</li>'
        );
    }

    function renderTrash() {
        els.trashLoading.classList.add('hidden');
        els.trashCountBadge.textContent = trashedExpenses.length.toLocaleString();

        if (trashedExpenses.length === 0) {
            els.trashList.innerHTML = '';
            els.trashEmpty.classList.remove('hidden');
            els.emptyTrash.disabled = true;
        } else {
            els.trashEmpty.classList.add('hidden');
            els.emptyTrash.disabled = false;
            els.trashList.innerHTML = trashedExpenses.map(trashRowHtml).join('');
        }
        window.lucide?.createIcons();
    }

    /* ---------------- ARM-CONFIRM (delete forever) ---------------- */
    function resetPurgeButton(button) {
        button.setAttribute('data-armed', 'false');
        button.className = PURGE_IDLE_CLASSES;
        button.innerHTML = '<i data-lucide="trash-2" class="h-3.5 w-3.5"></i><span>Delete</span>';
    }

    function disarmAllPurgeButtons() {
        if (armTimer) {
            clearTimeout(armTimer);
            armTimer = null;
        }
        document.querySelectorAll('button[data-purge-id]').forEach(resetPurgeButton);
        els.emptyTrash.setAttribute('data-armed', 'false');
        const span = els.emptyTrash.querySelector('span');
        if (span) span.textContent = 'Empty trash';
        window.lucide?.createIcons();
    }

    function armPurgeButton(button) {
        disarmAllPurgeButtons();
        button.setAttribute('data-armed', 'true');
        button.className = PURGE_ARMED_CLASSES;
        button.textContent = 'Confirm?';
        startArmTimer();
    }

    function armEmptyTrash() {
        disarmAllPurgeButtons();
        els.emptyTrash.setAttribute('data-armed', 'true');
        const span = els.emptyTrash.querySelector('span');
        if (span) span.textContent = 'Confirm?';
        startArmTimer();
    }

    function startArmTimer() {
        armTimer = setTimeout(() => {
            disarmAllPurgeButtons();
        }, DELETE_ARM_TIMEOUT_MS);
    }

    /* ---------------- TRASH ACTIONS ---------------- */
    async function restoreExpense(id) {
        const index = trashedExpenses.findIndex((e) => e.id === id);
        if (index === -1) return;
        const row = trashedExpenses[index];
        try {
            const { error } = await sb
                .from(EXPENSES_TABLE)
                .update({ deleted_at: null })
                .eq('id', id);
            if (error) throw error;
            trashedExpenses.splice(index, 1);
            activeExpenses.push({ ...row, deleted_at: null });
            renderAll();
            showToast('Expense restored from trash.', 'success');
        } catch (error) {
            const hint = String(error.message || '').includes('deleted_at')
                ? ' Run the v5 migration in schema.sql (Supabase SQL Editor) first.'
                : '';
            showToast(`Failed to restore expense: ${error.message}.${hint}`, 'error');
        }
    }

    async function purgeExpense(id) {
        const index = trashedExpenses.findIndex((e) => e.id === id);
        if (index === -1) return;
        const removed = trashedExpenses[index];

        trashedExpenses.splice(index, 1);
        renderTrash();
        renderStats();

        try {
            const { error } = await sb.from(EXPENSES_TABLE).delete().eq('id', id);
            if (error) throw error;
            showToast('Expense deleted forever.', 'success');
        } catch (error) {
            trashedExpenses.splice(Math.min(index, trashedExpenses.length), 0, removed);
            renderTrash();
            renderStats();
            showToast(`Failed to delete expense: ${error.message}`, 'error');
        }
    }

    async function emptyTrash() {
        if (trashedExpenses.length === 0) return;
        const ids = trashedExpenses.map((e) => e.id);
        const backup = trashedExpenses.slice();

        trashedExpenses = [];
        renderTrash();
        renderStats();

        try {
            const { error } = await sb.from(EXPENSES_TABLE).delete().in('id', ids);
            if (error) throw error;
            showToast(`Emptied trash — deleted ${ids.length} expense${ids.length === 1 ? '' : 's'}.`, 'success');
        } catch (error) {
            trashedExpenses = backup;
            renderTrash();
            renderStats();
            showToast(`Failed to empty trash: ${error.message}`, 'error');
        }
    }

    /* ---------------- RENDER + DATA ---------------- */
    function renderAll() {
        renderStats();
        renderMonths();
        renderPdfList();
        renderTrash();
    }

    async function loadData() {
        els.monthsLoading.classList.remove('hidden');
        els.monthsEmpty.classList.add('hidden');
        els.trashLoading.classList.remove('hidden');
        if (typeof pmInitClient === 'function') pmInitClient();
        if (!sb) throw new Error('Supabase is not ready');

        const { data, error } = await sb
            .from(EXPENSES_TABLE)
            .select('*')
            .order('expense_date', { ascending: false })
            .order('created_at', { ascending: false });
        if (error) throw error;

        const rows = data ?? [];
        activeExpenses = rows.filter((e) => !e.deleted_at);
        trashedExpenses = rows
            .filter((e) => e.deleted_at)
            .sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at)));

        renderAll();
    }

    async function refresh() {
        els.refresh.disabled = true;
        try {
            await loadData();
            showToast('Archive refreshed.', 'success');
        } catch (error) {
            els.monthsLoading.classList.add('hidden');
            els.trashLoading.classList.add('hidden');
            els.monthsEmpty.classList.remove('hidden');
            showToast(`Could not load archive: ${error.message}`, 'error');
        } finally {
            els.refresh.disabled = false;
        }
    }

    /* ---------------- EVENTS + INIT ---------------- */
    function wireEvents() {
        els.refresh?.addEventListener('click', refresh);
        els.fullPdf?.addEventListener('click', exportFullPdf);

        els.monthsList.addEventListener('click', (event) => {
            const pdfButton = event.target.closest('[data-month-pdf]');
            if (pdfButton) {
                event.stopPropagation();
                exportMonthPdf(pdfButton.getAttribute('data-month-pdf'));
                return;
            }
            const toggle = event.target.closest('[data-month]');
            if (toggle) toggleMonth(toggle.getAttribute('data-month'));
        });

        els.pdfList.addEventListener('click', (event) => {
            const pdfButton = event.target.closest('[data-month-pdf]');
            if (pdfButton) exportMonthPdf(pdfButton.getAttribute('data-month-pdf'));
        });

        els.trashList.addEventListener('click', (event) => {
            const restore = event.target.closest('[data-restore-id]');
            if (restore) {
                restoreExpense(restore.getAttribute('data-restore-id'));
                return;
            }
            const purge = event.target.closest('[data-purge-id]');
            if (!purge) return;
            if (purge.getAttribute('data-armed') === 'true') {
                const id = purge.getAttribute('data-purge-id');
                disarmAllPurgeButtons();
                purgeExpense(id);
            } else {
                armPurgeButton(purge);
            }
        });

        els.emptyTrash?.addEventListener('click', () => {
            if (els.emptyTrash.getAttribute('data-armed') === 'true') {
                disarmAllPurgeButtons();
                emptyTrash();
            } else {
                armEmptyTrash();
            }
        });
    }

    async function init() {
        if (typeof pmInitClient === 'function') pmInitClient();
        if (!sb) {
            showToast('Missing Supabase credentials in js/config.js.', 'error');
            return;
        }
        const session = await requireAuth();
        if (!session) return;

        currentUser = session.user;
        monthlyBudget = budgetFromUser(currentUser) || loadBudget(currentUser.id);

        wireEvents();

        try {
            await loadData();
        } catch (error) {
            els.monthsLoading.classList.add('hidden');
            els.trashLoading.classList.add('hidden');
            els.monthsEmpty.classList.remove('hidden');
            showToast(`Could not load archive: ${error.message}`, 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
