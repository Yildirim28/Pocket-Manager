/* =============================================================
   Pocket Manager — js/settings.js
   Settings page (settings.html). Requires a signed-in user.
   ============================================================= */

'use strict';

(function settingsPage() {
    const accountEmailEl = document.getElementById('accountEmail');
    const accountAvatarEl = document.getElementById('accountAvatar');

    const settingsBudgetInput = document.getElementById('settingsBudgetInput');
    const saveBudgetButton = document.getElementById('saveBudgetButton');

    const passwordForm = document.getElementById('passwordForm');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmNewPasswordInput = document.getElementById('confirmNewPassword');
    const passwordErrorEl = document.getElementById('passwordError');
    const passwordSubmit = document.getElementById('passwordSubmit');
    const passwordSubmitText = document.getElementById('passwordSubmitText');

    const exportCsvButton = document.getElementById('exportCsvButton');
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

    async function exportCsv() {
        exportCsvButton.disabled = true;
        try {
            const { data, error } = await sb
                .from(EXPENSES_TABLE)
                .select('expense_date, description, category, amount, created_at')
                .order('expense_date', { ascending: false });

            if (error) throw error;

            const header = 'Date,Description,Category,Amount,Added At';
            const rows = (data ?? []).map((e) =>
                [
                    csvEscape(e.expense_date),
                    csvEscape(e.description),
                    csvEscape(e.category),
                    csvEscape(e.amount),
                    csvEscape(e.created_at)
                ].join(',')
            );
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
        accountEmailEl.textContent = email;
        accountAvatarEl.textContent = (email[0] || '?').toUpperCase();

        settingsBudgetInput.value = loadBudget();
        saveBudgetButton.addEventListener('click', saveBudget);
        settingsBudgetInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveBudget();
        });

        passwordForm.addEventListener('submit', updatePassword);
        exportCsvButton.addEventListener('click', exportCsv);
        signOutButton.addEventListener('click', signOutAndRedirect);
    });
})();
