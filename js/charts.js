/* =============================================================
   Pocket Manager — js/charts.js
   Dependency-free SVG charts shared by the dashboard and the
   history page:

     pmRenderAreaChart(mount, series, options)  — expense dynamics
     pmRenderOrbitChart(mount, items, options)  — category orbit

   Both read the accent from CSS custom properties, so they follow
   the active theme without any extra wiring.
   ============================================================= */

'use strict';

let pmChartSeq = 0;

/* Catmull-Rom through the points, converted to cubic beziers, so the
   trend line curves like the reference design instead of zig-zagging. */
function pmSmoothPath(points) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;

        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = p2.y - (p3.y - p1.y) / 6;

        d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return d;
}

function pmEscape(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function pmMoney(value) {
    return typeof formatCurrency === 'function' ? formatCurrency(value) : String(Math.round(value));
}

/* -------------------------------------------------------------
   AREA TREND — "Expense dynamics"
   series: [{ label: 'Apr', value: 841.9 }, ...]
------------------------------------------------------------- */
function pmRenderAreaChart(mount, series, options = {}) {
    if (!mount) return;

    const data = Array.isArray(series) ? series : [];
    if (data.length === 0) {
        mount.innerHTML = '<p class="pm-faint py-8 text-center text-xs">Not enough data yet</p>';
        return;
    }

    const W = 600;
    const H = options.height || 170;
    const padL = 10;
    const padR = 10;
    const padT = 18;
    const padB = 26;

    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const values = data.map((d) => Number(d.value) || 0);
    const maxValue = Math.max(...values);
    const scaleMax = maxValue > 0 ? maxValue * 1.15 : 1;

    const step = data.length > 1 ? innerW / (data.length - 1) : 0;
    const points = data.map((d, i) => ({
        x: padL + step * i,
        y: padT + innerH - (Number(d.value) || 0) / scaleMax * innerH,
        label: d.label,
        value: Number(d.value) || 0
    }));

    const id = `pmArea${++pmChartSeq}`;
    const linePath = pmSmoothPath(points);
    const areaPath =
        `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${padT + innerH} ` +
        `L ${points[0].x.toFixed(2)} ${padT + innerH} Z`;

    const gridLines = [0.25, 0.5, 0.75]
        .map((f) => {
            const y = padT + innerH * f;
            return `<line class="pm-area-grid" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"></line>`;
        })
        .join('');

    const maxIndex = values.indexOf(maxValue);

    const dots = points
        .map((p, i) => {
            const isMax = i === maxIndex && maxValue > 0;
            return (
                `<circle class="${isMax ? 'pm-area-dot-max' : 'pm-area-dot'}" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${isMax ? 4.5 : 3}">` +
                `<title>${pmEscape(p.label)} · ${pmEscape(pmMoney(p.value))}</title></circle>`
            );
        })
        .join('');

    const labels = points
        .map(
            (p) =>
                `<text class="pm-area-label" x="${p.x.toFixed(2)}" y="${H - 6}" text-anchor="middle">${pmEscape(p.label)}</text>`
        )
        .join('');

    const peakLabel =
        maxValue > 0
            ? `<text class="pm-area-value" x="${points[maxIndex].x.toFixed(2)}" y="${Math.max(padT - 6, points[maxIndex].y - 12).toFixed(2)}" text-anchor="middle">${pmEscape(pmMoney(maxValue))}</text>`
            : '';

    mount.innerHTML =
        `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Expense trend">` +
        '<defs>' +
        `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">` +
        '<stop offset="0%" style="stop-color:var(--pm-accent-to);stop-opacity:.45"></stop>' +
        '<stop offset="100%" style="stop-color:var(--pm-accent);stop-opacity:0"></stop>' +
        '</linearGradient>' +
        '</defs>' +
        gridLines +
        `<path class="pm-area-fill" d="${areaPath}" fill="url(#${id})"></path>` +
        `<path class="pm-area-line pm-area-draw" d="${linePath}"></path>` +
        dots +
        labels +
        peakLabel +
        '</svg>';

    // Kick off the draw-in animation with the real path length.
    const line = mount.querySelector('.pm-area-line');
    if (line && typeof line.getTotalLength === 'function') {
        try {
            const len = Math.ceil(line.getTotalLength()) || 1200;
            line.style.setProperty('--pm-len', String(len));
        } catch {
            /* getTotalLength can throw on detached nodes — animation still runs */
        }
    }
}

/* -------------------------------------------------------------
   CATEGORY ORBIT — icons around a spider core
   items: [{ label, value, percent, icon }]
------------------------------------------------------------- */
const PM_CATEGORY_ICONS = {
    Food: 'utensils',
    Groceries: 'shopping-basket',
    Grocery: 'shopping-basket',
    Transport: 'bus-front',
    Taxi: 'car-taxi-front',
    Bills: 'receipt-text',
    Utilities: 'plug-zap',
    Internet: 'globe',
    Rent: 'house',
    Entertainment: 'ferris-wheel',
    Sport: 'dumbbell',
    Restaurants: 'utensils-crossed',
    Clothes: 'shirt',
    Shopping: 'shopping-bag',
    Alcohol: 'martini',
    Other: 'shapes',
    General: 'circle-dot'
};

function pmCategoryIcon(label) {
    return PM_CATEGORY_ICONS[label] || 'circle-dot';
}

function pmRenderOrbitChart(mount, items, options = {}) {
    if (!mount) return;

    const data = (Array.isArray(items) ? items : []).filter((d) => Number(d.value) > 0);
    if (data.length === 0) {
        mount.innerHTML =
            '<p class="pm-faint absolute inset-0 flex items-center justify-center text-center text-xs">No categories to chart yet</p>';
        return;
    }

    const total = data.reduce((sum, d) => sum + Number(d.value), 0) || 1;
    const maxValue = Math.max(...data.map((d) => Number(d.value)));

    const cx = 50;
    const cy = 50;
    const coreMin = 9;
    const coreMax = 30;
    const spokeR = 34;

    const angleFor = (index) => (-90 + (360 / data.length) * index) * (Math.PI / 180);

    const corePoints = data
        .map((d, i) => {
            const ratio = maxValue > 0 ? Number(d.value) / maxValue : 0;
            const r = coreMin + (coreMax - coreMin) * ratio;
            const a = angleFor(i);
            return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
        })
        .join(' ');

    const spokes = data
        .map((_, i) => {
            const a = angleFor(i);
            return (
                `<line class="pm-orbit-spoke" x1="${cx}" y1="${cy}" ` +
                `x2="${(cx + spokeR * Math.cos(a)).toFixed(2)}" y2="${(cy + spokeR * Math.sin(a)).toFixed(2)}"></line>`
            );
        })
        .join('');

    const rings = [14, 22, 30]
        .map((r) => `<circle class="pm-orbit-ring" cx="${cx}" cy="${cy}" r="${r}"></circle>`)
        .join('');

    const svg =
        `<svg viewBox="0 0 100 100" role="img" aria-label="Spending by category">` +
        rings +
        spokes +
        `<polygon class="pm-orbit-core" points="${corePoints}"></polygon>` +
        '</svg>';

    // Nodes are HTML so Lucide can render real line icons.
    const nodeRadius = options.nodeRadius || 43;
    const nodes = data
        .map((d, i) => {
            const a = angleFor(i);
            const left = 50 + nodeRadius * Math.cos(a);
            const top = 50 + nodeRadius * Math.sin(a);
            const percent = Math.round((Number(d.value) / total) * 100);
            return (
                `<div class="pm-orbit-node" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%" ` +
                `title="${pmEscape(d.label)} · ${pmEscape(pmMoney(d.value))}">` +
                `<span class="pm-orbit-icon"><i data-lucide="${pmCategoryIcon(d.label)}" class="h-5 w-5"></i></span>` +
                `<span class="pm-orbit-pct">${percent}%</span>` +
                `<span class="pm-orbit-name">${pmEscape(d.label)}</span>` +
                '</div>'
            );
        })
        .join('');

    mount.innerHTML = svg + nodes;
    window.lucide?.createIcons();
}

/* -------------------------------------------------------------
   SERIES HELPERS
------------------------------------------------------------- */

/* Totals for the last `months` calendar months, oldest first. */
function pmMonthlySeries(expenses, months = 6) {
    const now = new Date();
    const series = [];

    for (let i = months - 1; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const total = expenses
            .filter((e) => String(e.expense_date).slice(0, 7) === key)
            .reduce((sum, e) => sum + Number(e.amount || 0), 0);

        series.push({
            key,
            label: date.toLocaleDateString('en-US', { month: 'short' }),
            value: total
        });
    }
    return series;
}

/* Category totals for a set of expenses, largest first. */
function pmCategoryTotals(expenses, limit = 8) {
    const totals = {};
    expenses.forEach((e) => {
        const key = e.category || 'General';
        totals[key] = (totals[key] || 0) + Number(e.amount || 0);
    });

    return Object.entries(totals)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
}
