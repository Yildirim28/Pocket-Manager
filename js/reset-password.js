/* =============================================================
   Pocket Manager — js/reset-password.js
   Password recovery flow (reset-password.html).

   Step 1: user enters email -> Supabase sends a reset link.
   Step 2: user clicks the link in their inbox -> lands back on
   this page with a recovery session -> sets a new password.
   ============================================================= */

'use strict';

(function resetPasswordPage() {
    const requestCard = document.getElementById('requestCard');
    const requestForm = document.getElementById('requestForm');
    const requestEmailInput = document.getElementById('resetEmail');
    const requestErrorEl = document.getElementById('requestError');
    const requestNoticeEl = document.getElementById('requestNotice');
    const requestSubmit = document.getElementById('requestSubmit');
    const requestSubmitText = document.getElementById('requestSubmitText');

    const newPasswordCard = document.getElementById('newPasswordCard');
    const newPasswordForm = document.getElementById('newPasswordForm');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmNewPasswordInput = document.getElementById('confirmNewPassword');
    const newPasswordErrorEl = document.getElementById('newPasswordError');
    const newPasswordNoticeEl = document.getElementById('newPasswordNotice');
    const newPasswordSubmit = document.getElementById('newPasswordSubmit');
    const newPasswordSubmitText = document.getElementById('newPasswordSubmitText');

    const invalidCard = document.getElementById('invalidCard');

    function show(element) {
        element?.classList.remove('hidden');
    }

    function hide(element) {
        element?.classList.add('hidden');
    }

    async function sendResetLink(event) {
        event.preventDefault();
        hide(requestErrorEl);
        hide(requestNoticeEl);

        const email = requestEmailInput.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            requestErrorEl.textContent = 'Please enter a valid email address.';
            show(requestErrorEl);
            return;
        }

        requestSubmit.disabled = true;
        requestSubmitText.textContent = 'Sending…';
        try {
            const { error } = await sb.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}${window.location.pathname}`
            });
            if (error) throw error;
            requestNoticeEl.textContent = `Reset link sent! Check your inbox at ${email} (and spam folder). The link expires in 1 hour.`;
            show(requestNoticeEl);
        } catch (error) {
            requestErrorEl.textContent = error.message;
            show(requestErrorEl);
        } finally {
            requestSubmit.disabled = false;
            requestSubmitText.textContent = 'Send reset link';
        }
    }

    async function saveNewPassword(event) {
        event.preventDefault();
        hide(newPasswordErrorEl);
        hide(newPasswordNoticeEl);

        const password = newPasswordInput.value;
        if (password.length < 6) {
            newPasswordErrorEl.textContent = 'Password must be at least 6 characters.';
            show(newPasswordErrorEl);
            return;
        }
        if (password !== confirmNewPasswordInput.value) {
            newPasswordErrorEl.textContent = 'Passwords do not match.';
            show(newPasswordErrorEl);
            return;
        }

        newPasswordSubmit.disabled = true;
        newPasswordSubmitText.textContent = 'Updating…';
        try {
            const { error } = await sb.auth.updateUser({ password });
            if (error) throw error;
            newPasswordNoticeEl.textContent = 'Password updated! Redirecting you to sign in…';
            show(newPasswordNoticeEl);
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } catch (error) {
            newPasswordErrorEl.textContent = error.message;
            show(newPasswordErrorEl);
            newPasswordSubmit.disabled = false;
            newPasswordSubmitText.textContent = 'Update password';
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (!sb) return;

        // Pre-fill email when arriving from the login page.
        const presetEmail = new URLSearchParams(window.location.search).get('email');
        if (presetEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(presetEmail)) {
            requestEmailInput.value = presetEmail;
        }

        requestForm.addEventListener('submit', sendResetLink);
        newPasswordForm.addEventListener('submit', saveNewPassword);

        // If the user arrived from a recovery email link, Supabase
        // exchanges the token automatically and fires PASSWORD_RECOVERY.
        const { data } = await sb.auth.getSession();
        if (data?.session) {
            hide(requestCard);
            show(newPasswordCard);
        } else {
            // Check hash for a recovery error (expired/invalid token).
            const hash = window.location.hash || '';
            if (hash.includes('error_description=')) {
                hide(requestCard);
                show(invalidCard);
            }
        }

        sb.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                hide(requestCard);
                hide(invalidCard);
                show(newPasswordCard);
                newPasswordInput?.focus();
            }
        });
    });
})();
