/* =============================================================
   Pocket Manager — js/auth.js
   Shared logic for login.html and signup.html.
   ============================================================= */

'use strict';

(function authPage() {
    const isSignup = document.body.dataset.page === 'signup';

    const form = document.getElementById('authForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const errorEl = document.getElementById('authError');
    const noticeEl = document.getElementById('authNotice');
    const submitButton = document.getElementById('authSubmit');
    const submitButtonText = document.getElementById('authSubmitText');
    const googleButton = document.getElementById('googleButton');
    const googleButtonText = document.getElementById('googleButtonText');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');

    function showError(message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    function clearMessages() {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
        noticeEl.textContent = '';
        noticeEl.classList.add('hidden');
    }

    function setSubmitting(submitting) {
        submitButton.disabled = submitting;
        submitButtonText.textContent = submitting
            ? isSignup ? 'Creating account…' : 'Signing in…'
            : isSignup ? 'Create account' : 'Sign in';
    }

    async function handleLogin(email, password) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
            showError(
                error.message === 'Invalid login credentials'
                    ? 'Wrong email or password. Please try again.'
                    : error.message
            );
            return;
        }
        if (data.session) {
            window.location.href = 'app.html';
        } else {
            noticeEl.textContent = 'Signed in. Redirecting…';
            noticeEl.classList.remove('hidden');
        }
    }

    async function handleSignup(email, password) {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) {
            if (
                error.message.toLowerCase().includes('already registered') ||
                error.message.toLowerCase().includes('already been registered')
            ) {
                showError(
                    'An account with this email already exists. Try signing in instead — ' +
                    'or use "Forgot your password?" if you forgot it.'
                );
            } else {
                showError(error.message);
            }
            return;
        }
        if (data.session) {
            // Email confirmation disabled — signed up and signed in.
            window.location.href = 'app.html';
        } else {
            // Email confirmation enabled — account created, needs verification.
            noticeEl.textContent =
                'Account created! Please check your inbox at ' + email +
                ' and click the confirmation link, then sign in.';
            noticeEl.classList.remove('hidden');
            form.reset();
        }
    }

    async function handleGoogleSignIn() {
        googleButton.disabled = true;
        googleButtonText.textContent = 'Redirecting to Google…';
        try {
            const { error } = await sb.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}app.html`
                }
            });
            if (error) throw error;
            // Supabase redirects to Google; nothing else to do here.
        } catch (error) {
            showError(`Google sign-in failed: ${error.message}`);
            googleButton.disabled = false;
            googleButtonText.textContent = 'Continue with Google';
        }
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!sb) {
            showError('App is not configured. Missing Supabase credentials in js/config.js.');
            return;
        }

        clearMessages();

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showError('Please enter a valid email address.');
            return;
        }
        if (password.length < 6) {
            showError('Password must be at least 6 characters.');
            return;
        }
        if (isSignup && password !== confirmPasswordInput.value) {
            showError('Passwords do not match.');
            return;
        }

        setSubmitting(true);
        try {
            if (isSignup) await handleSignup(email, password);
            else await handleLogin(email, password);
        } catch (err) {
            showError(`Something went wrong: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    });

    // Already signed in? Go straight to the dashboard.
    // (Ignore the PASSWORD_RECOVERY event — that belongs to the
    // reset-password page, not this one.)
    document.addEventListener('DOMContentLoaded', async () => {
        googleButton?.addEventListener('click', handleGoogleSignIn);

        forgotPasswordLink?.addEventListener('click', (event) => {
            event.preventDefault();
            const email = emailInput.value.trim();
            window.location.href =
                'reset-password.html' + (email ? `?email=${encodeURIComponent(email)}` : '');
        });

        const session = await getSession();
        if (session) window.location.replace('app.html');
    });
})();
