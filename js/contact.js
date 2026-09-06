/* =============================================================
   Pocket Manager — js/contact.js
   Contact page (contact.html). Anyone can send a message;
   messages are stored in the contact_messages table and read
   by the owner in Supabase Dashboard -> Table Editor.
   ============================================================= */

'use strict';

(function contactPage() {
    const ownerNameEl = document.getElementById('ownerName');
    const ownerEmailLink = document.getElementById('ownerEmailLink');
    const ownerEmailText = document.getElementById('ownerEmailText');

    const form = document.getElementById('contactForm');
    const nameInput = document.getElementById('contactName');
    const emailInput = document.getElementById('contactEmail');
    const subjectInput = document.getElementById('contactSubject');
    const messageInput = document.getElementById('contactMessage');
    const errorEl = document.getElementById('contactError');
    const submitButton = document.getElementById('contactSubmit');
    const submitButtonText = document.getElementById('contactSubmitText');

    function showError(message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    function hideError() {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }

    function setSubmitting(submitting) {
        submitButton.disabled = submitting;
        submitButtonText.textContent = submitting ? 'Sending…' : 'Send message';
    }

    async function submitMessage(event) {
        event.preventDefault();
        hideError();

        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const subject = subjectInput.value.trim();
        const message = messageInput.value.trim();

        if (!name || !subject || !message) {
            showError('Please fill in all fields.');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showError('Please enter a valid email address.');
            return;
        }

        setSubmitting(true);
        try {
            const session = await getSession();
            const payload = {
                name,
                email,
                subject,
                message,
                sender_id: session?.user?.id ?? null
            };

            const { error } = await sb.from(CONTACT_TABLE).insert(payload);
            if (error) throw error;

            form.reset();
            showToast('Message sent! The owner will get back to you soon.', 'success');
        } catch (error) {
            showError(`Could not send your message: ${error.message}`);
        } finally {
            setSubmitting(false);
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        ownerNameEl.textContent = OWNER_NAME;
        ownerEmailText.textContent = OWNER_EMAIL;
        ownerEmailLink.href = `mailto:${OWNER_EMAIL}`;

        if (!sb) {
            showError('Contact form is unavailable: missing Supabase credentials in js/config.js.');
            submitButton.disabled = true;
            return;
        }

        // Pre-fill email for signed-in users.
        const session = await getSession();
        if (session?.user?.email) {
            emailInput.value = session.user.email;
            if (session.user.email.includes('@')) {
                nameInput.value = nameInput.value || session.user.email.split('@')[0];
            }
        }

        form.addEventListener('submit', submitMessage);
    });
})();
