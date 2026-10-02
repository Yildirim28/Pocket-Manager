/* =============================================================
   Pocket Manager — js/pdf.js
   Shared PDF export used by history.html and archive.html.

   The PDF is generated locally (no dependencies): each page is
   rendered as an SVG table, rasterised to JPEG, then embedded as
   an image XObject in a hand-written PDF file.

   Exposed API: pmPdf.exportRows(rows, options)
   ============================================================= */

'use strict';

window.pmPdf = (function pdfModule() {
    const PDF_ROWS_PER_PAGE = 28;

    /* ---------------- LOCAL HELPERS ---------------- */
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

    /* ---------------- SVG PAGE ---------------- */
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
        parts.push(`<text x="${padX}" y="66" font-family="${FONT}" font-size="34" font-weight="800" fill="#ffffff">${xmlEscape(info.title || 'Transaction History')}</text>`);
        parts.push(
            `<text x="${padX}" y="102" font-family="${FONT}" font-size="15" fill="#ffffff" opacity="0.9">` +
            `Pocket Manager · Generated ${xmlEscape(formatDate(todayLocalISO()))}${info.range ? ` · ${xmlEscape(info.range)}` : ''}${info.filtered ? ' · Filtered view' : ''}</text>`
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

    /* ---------------- RASTERISE ---------------- */
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


    /* ---------------- ASSEMBLE PDF ---------------- */
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

        pushStr('%PDF-1.4\n%âãÏÓ\n');

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

    /* ---------------- PUBLIC: render rows as a multi-page PDF ----------------
       options: { title, range, filtered, filename,
                  button, buttonText, idleLabel, emptyMessage } */
    async function exportRows(rows, options = {}) {
        const {
            title = 'Transaction History',
            range = '',
            filtered = false,
            filename = `pocket-manager-history-${todayLocalISO()}.pdf`,
            button = null,
            buttonText = null,
            idleLabel = '',
            emptyMessage = 'No expenses to export yet.'
        } = options;

        if (!rows || rows.length === 0) {
            showToast(emptyMessage, 'info');
            return;
        }

        const total = rows.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const pageCount = Math.max(1, Math.ceil(rows.length / PDF_ROWS_PER_PAGE));

        if (button) button.disabled = true;
        if (buttonText) buttonText.textContent = 'Preparing…';
        try {
            const pages = [];
            for (let i = 0; i < rows.length; i += PDF_ROWS_PER_PAGE) {
                const chunk = rows.slice(i, i + PDF_ROWS_PER_PAGE);
                const svg = pdfPageSvg(chunk, {
                    title,
                    range,
                    page: pages.length + 1,
                    pageCount,
                    count: rows.length,
                    total,
                    last: i + PDF_ROWS_PER_PAGE >= rows.length,
                    filtered
                });
                pages.push(await svgToJpegPage(svg));
                if (buttonText) buttonText.textContent = `Preparing ${pages.length}/${pageCount}…`;
            }

            downloadBlob(buildPdf(pages), filename);
            showToast(`Exported ${rows.length} transactions as PDF.`, 'success');
        } catch (error) {
            showToast(`PDF export failed: ${error.message}`, 'error');
        } finally {
            if (button) button.disabled = false;
            if (buttonText) buttonText.textContent = idleLabel;
        }
    }

    return { exportRows };
})();

