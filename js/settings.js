/* =============================================================
   Pocket Manager — js/settings.js
   Settings page (settings.html). Requires a signed-in user.
   ============================================================= */

'use strict';

(function settingsPage() {
    const accountEmailEl = document.getElementById('accountEmail');
    const accountNicknameEl = document.getElementById('accountNickname');
    const accountAvatarEl = document.getElementById('accountAvatar');

    const nicknameInput = document.getElementById('nicknameInput');
    const saveNicknameButton = document.getElementById('saveNicknameButton');
    const saveNicknameText = document.getElementById('saveNicknameText');

    const settingsBudgetInput = document.getElementById('settingsBudgetInput');
    const saveBudgetButton = document.getElementById('saveBudgetButton');

    const passwordForm = document.getElementById('passwordForm');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmNewPasswordInput = document.getElementById('confirmNewPassword');
    const passwordErrorEl = document.getElementById('passwordError');
    const passwordSubmit = document.getElementById('passwordSubmit');
    const passwordSubmitText = document.getElementById('passwordSubmitText');

    const exportCsvButton = document.getElementById('exportCsvButton');
    const exportPngButton = document.getElementById('exportPngButton');
    const signOutButton = document.getElementById('signOutButton');

    function showPasswordError(message) {
        passwordErrorEl.textContent = message;
        passwordErrorEl.classList.remove('hidden');
    }

    function hidePasswordError() {
        passwordErrorEl.textContent = '';
        passwordErrorEl.classList.add('hidden');
    }

    function csvEscape(value) {
        const str = String(value ?? '');
        return /[",\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
    }

    function applyAccountDisplay(user) {
        const email = user.email ?? 'unknown';
        const nickname = String(user.user_metadata?.nickname ?? '').trim();
        accountEmailEl.textContent = email;
        accountNicknameEl.textContent = nickname || email;
        accountAvatarEl.textContent = (nickname || email)[0]?.toUpperCase() || '?';
        if (nicknameInput && document.activeElement !== nicknameInput) {
            nicknameInput.value = nickname;
        }
    }

    async function saveNickname() {
        const nickname = nicknameInput.value.trim();
        saveNicknameButton.disabled = true;
        saveNicknameText.textContent = 'Saving…';
        try {
            const { error } = await sb.auth.updateUser({ data: { nickname } });
            if (error) throw error;
            showToast(nickname ? 'Nickname saved.' : 'Nickname cleared.', 'success');
            const session = await getSession();
            if (session) {
                applyAccountDisplay(session.user);
                renderNavbar(session);
            }
        } catch (error) {
            showToast(`Could not save nickname: ${error.message}`, 'error');
        } finally {
            saveNicknameButton.disabled = false;
            saveNicknameText.textContent = 'Save nickname';
        }
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

    function xmlEscape(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;');
    }

    function truncate(value, max) {
        const str = String(value ?? '');
        return str.length > max ? str.slice(0, max - 1) + '…' : str;
    }

    /* Renders all expenses as a styled report card and downloads
       it as a PNG (SVG -> canvas -> PNG, no dependencies). */
    async function exportPng() {
        exportPngButton.disabled = true;
        try {
            const { data, error } = await sb
                .from(EXPENSES_TABLE)
                .select('*')
                .order('expense_date', { ascending: false });
            if (error) throw error;

            const rows = data ?? [];
            if (rows.length === 0) {
                showToast('No expenses to export yet.', 'info');
                return;
            }

            const rootStyles = getComputedStyle(document.documentElement);
            const accent = rootStyles.getPropertyValue('--pm-accent').trim() || '#4f46e5';
            const accentTo = rootStyles.getPropertyValue('--pm-accent-to').trim() || '#8b5cf6';

            const W = 1000;
            const padX = 48;
            const rowH = 36;
            const tableTop = 196;
            const maxRows = 150;
            const shown = rows.slice(0, maxRows);
            const total = rows.reduce((sum, e) => sum + Number(e.amount), 0);

            const colDate = padX;
            const colDesc = padX + 110;
            const colCat = W - padX - 320;
            const colAmount = W - padX;
            const FONT = 'Arial, Helvetica, sans-serif';

            let y = tableTop + 44;
            const bodyParts = [];

            shown.forEach((expense, index) => {
                if (index % 2 === 0) {
                    bodyParts.push(
                        `<rect x="${padX - 12}" y="${y - 22}" width="${W - padX * 2 + 24}" height="${rowH}" fill="#f8fafc" rx="8"/>`
                    );
                }
                const people = Array.isArray(expense.participants)
                    ? expense.participants.map((p) => p.name).join(', ')
                    : '';
                let desc = truncate(expense.description, 52);
                if (people) desc += `  ·  ${truncate(people, 24)}`;
                const type = expense.utility_type ? ` (${expense.utility_type})` : '';

                bodyParts.push(
                    `<text x="${colDate}" y="${y}" font-family="${FONT}" font-size="13" fill="#94a3b8">${xmlEscape(formatDate(expense.expense_date))}</text>` +
                    `<text x="${colDesc}" y="${y}" font-family="${FONT}" font-size="14" fill="#0f172a">${xmlEscape(desc)}</text>` +
                    `<text x="${colCat}" y="${y}" font-family="${FONT}" font-size="13" fill="#64748b">${xmlEscape(truncate(expense.category + type, 22))}</text>` +
                    `<text x="${colAmount}" y="${y}" font-family="${FONT}" font-size="14" font-weight="600" fill="#0f172a" text-anchor="end">${xmlEscape(formatCurrency(expense.amount))}</text>`
                );
                y += rowH;
            });

            if (rows.length > maxRows) {
                bodyParts.push(
                    `<text x="${colDesc}" y="${y + 6}" font-family="${FONT}" font-size="13" fill="#94a3b8" font-style="italic">…and ${rows.length - maxRows} more expenses</text>`
                );
                y += 30;
            }

            const H = y + 110;

            const svg =
                `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
                `<defs><linearGradient id="hdr" x1="0" y1="0" x2="1" y2="1">` +
                `<stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${accentTo}"/>` +
                `</linearGradient></defs>` +
                `<rect width="${W}" height="${H}" fill="#ffffff"/>` +
                `<rect width="${W}" height="128" fill="url(#hdr)"/>` +
                `<text x="${padX}" y="58" font-family="${FONT}" font-size="26" font-weight="800" fill="#ffffff">Pocket Manager</text>` +
                `<text x="${padX}" y="86" font-family="${FONT}" font-size="15" fill="#ffffff" opacity="0.9">Expense Report · Generated ${xmlEscape(formatDate(todayLocalISO()))}</text>` +
                `<text x="${padX}" y="108" font-family="${FONT}" font-size="13" fill="#ffffff" opacity="0.75">${xmlEscape(accountEmailEl.textContent)} · ${shown.length} of ${rows.length} transactions</text>` +
                `<text x="${colDate}" y="${tableTop}" font-family="${FONT}" font-size="12" font-weight="700" fill="#94a3b8" letter-spacing="1">DATE</text>` +
                `<text x="${colDesc}" y="${tableTop}" font-family="${FONT}" font-size="12" font-weight="700" fill="#94a3b8" letter-spacing="1">DESCRIPTION</text>` +
                `<text x="${colCat}" y="${tableTop}" font-family="${FONT}" font-size="12" font-weight="700" fill="#94a3b8" letter-spacing="1">CATEGORY</text>` +
                `<text x="${colAmount}" y="${tableTop}" font-family="${FONT}" font-size="12" font-weight="700" fill="#94a3b8" letter-spacing="1" text-anchor="end">AMOUNT</text>` +
                `<line x1="${padX - 12}" y1="${tableTop + 12}" x2="${W - padX + 12}" y2="${tableTop + 12}" stroke="#e2e8f0" stroke-width="2"/>` +
                bodyParts.join('') +
                `<line x1="${padX - 12}" y1="${y + 6}" x2="${W - padX + 12}" y2="${y + 6}" stroke="#e2e8f0" stroke-width="2"/>` +
                `<text x="${colDesc}" y="${y + 46}" font-family="${FONT}" font-size="16" font-weight="700" fill="#0f172a">Total</text>` +
                `<text x="${colAmount}" y="${y + 46}" font-family="${FONT}" font-size="20" font-weight="800" fill="${accent}" text-anchor="end">${xmlEscape(formatCurrency(total))}</text>` +
                `<text x="${padX}" y="${H - 20}" font-family="${FONT}" font-size="11" fill="#cbd5e1">Generated by Pocket Manager — pocket-manager app</text>` +
                `</svg>`;

            const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error('Could not render the report image.'));
                img.src = svgUrl;
            });

            const scale = 2;
            const canvas = document.createElement('canvas');
            canvas.width = W * scale;
            canvas.height = H * scale;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(svgUrl);

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        showToast('PNG export failed.', 'error');
                        return;
                    }
                    downloadBlob(blob, `pocket-manager-report-${todayLocalISO()}.png`);
                    showToast(`Exported ${rows.length} expenses as PNG.`, 'success');
                },
                'image/png'
            );
        } catch (error) {
            showToast(`Export failed: ${error.message}`, 'error');
        } finally {
            exportPngButton.disabled = false;
        }
    }

    async function exportCsv() {
        exportCsvButton.disabled = true;
        try {
            const { data, error } = await sb
                .from(EXPENSES_TABLE)
                .select('expense_date, description, category, utility_type, amount, participants, created_at')
                .order('expense_date', { ascending: false });

            if (error) throw error;

            const header = 'Date,Description,Category,Utility Type,Amount,People,Added At';
            const rows = (data ?? []).map((e) => {
                const people = Array.isArray(e.participants)
                    ? e.participants.map((p) => `${p.name}: ${p.amount}`).join('; ')
                    : '';
                return [
                    csvEscape(e.expense_date),
                    csvEscape(e.description),
                    csvEscape(e.category),
                    csvEscape(e.utility_type ?? ''),
                    csvEscape(e.amount),
                    csvEscape(people),
                    csvEscape(e.created_at)
                ].join(',');
            });
            const csv = [header, ...rows].join('\n');

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `pocket-manager-expenses-${todayLocalISO()}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);

            showToast(`Exported ${data?.length ?? 0} expenses to CSV.`, 'success');
        } catch (error) {
            showToast(`Export failed: ${error.message}`, 'error');
        } finally {
            exportCsvButton.disabled = false;
        }
    }

    async function updatePassword(event) {
        event.preventDefault();
        hidePasswordError();

        const password = newPasswordInput.value;
        if (password.length < 6) {
            showPasswordError('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirmNewPasswordInput.value) {
            showPasswordError('Passwords do not match.');
            return;
        }

        passwordSubmit.disabled = true;
        passwordSubmitText.textContent = 'Updating…';
        try {
            const { error } = await sb.auth.updateUser({ password });
            if (error) throw error;
            passwordForm.reset();
            showToast('Password updated successfully.', 'success');
        } catch (error) {
            showPasswordError(error.message);
        } finally {
            passwordSubmit.disabled = false;
            passwordSubmitText.textContent = 'Update password';
        }
    }

    function saveBudget() {
        const value = Number(settingsBudgetInput.value);
        if (!Number.isFinite(value) || value <= 0) {
            settingsBudgetInput.value = loadBudget();
            showToast('Budget must be a positive number.', 'error');
            return;
        }
        localStorage.setItem(BUDGET_STORAGE_KEY, String(value));
        showToast('Budget saved.', 'success');
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (!sb) {
            showToast('Missing Supabase credentials in js/config.js.', 'error');
            return;
        }

        const session = await requireAuth();
        if (!session) return;

        const email = session.user.email ?? 'unknown';
        applyAccountDisplay(session.user);

        saveNicknameButton.addEventListener('click', saveNickname);
        nicknameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveNickname();
        });

        settingsBudgetInput.value = loadBudget();
        saveBudgetButton.addEventListener('click', saveBudget);
        settingsBudgetInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveBudget();
        });

        passwordForm.addEventListener('submit', updatePassword);
        exportCsvButton.addEventListener('click', exportCsv);
        exportPngButton.addEventListener('click', exportPng);
        signOutButton.addEventListener('click', signOutAndRedirect);
    });
})();
