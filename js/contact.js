/* =============================================================
   Pocket Manager — js/contact.js
   Contact page (contact.html). The form saves the message to
   contact_messages (owner can review all messages in Supabase
   Dashboard -> Table Editor) AND delivers it instantly to the
   owner's WhatsApp via a prefilled wa.me link.
   ============================================================= */

'use strict';

(function contactPage() {
    const ownerNameEl = document.getElementById('ownerName');
    const ownerEmailLink = document.getElementById('ownerEmailLink');
    const ownerEmailText = document.getElementById('ownerEmailText');
    const ownerWhatsappLink = document.getElementById('ownerWhatsappLink');

    const form = document.getElementById('contactForm');
    const nameInput = document.getElementById('contactName');
    const emailInput = document.getElementById('contactEmail');
    const subjectInput = document.getElementById('contactSubject');
    const messageInput = document.getElementById('contactMessage');
    const errorEl = document.getElementById('contactError');
    const submitButton = document.getElementById('contactSubmit');
    const submitButtonText = document.getElementById('contactSubmitText');
    const emailSubmitButton = document.getElementById('contactEmailSubmit');
    const emailSubmitButtonText = document.getElementById('contactEmailSubmitText');

    function showError(message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    function hideError() {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }

    /* Build a wa.me link with the message prefilled so it lands
       directly in the owner's WhatsApp chat. */
    function whatsappUrl(name, email, subject, message) {
        const text =
            `💬 New message from Pocket Manager\n\n` +
            `👤 Name: ${name}\n` +
            `✉️ Email: ${email}\n` +
            `📌 Subject: ${subject}\n\n` +
            `${message}`;
        return `https://wa.me/${OWNER_WHATSAPP}?text=${encodeURIComponent(text)}`;
    }

    /* Build a mailto: link that opens the user's email app with
       everything prefilled, ready to send. */
    function mailtoUrl(name, email, subject, message) {
        const body =
            `Hi,\n\n${message}\n\n—\nSent from Pocket Manager contact form\n` +
            `👤 ${name} · ✉️ ${email}`;
        return `mailto:${OWNER_EMAIL}?subject=${encodeURIComponent(
            '[Pocket Manager] ' + subject
        )}&body=${encodeURIComponent(body)}`;
    }

    function validateForm() {
        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const subject = subjectInput.value.trim();
        const message = messageInput.value.trim();

        if (!name || !subject || !message) {
            showError('Please fill in all fields.');
            return null;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showError('Please enter a valid email address.');
            return null;
        }
        return { name, email, subject, message };
    }

    async function deliver(channel) {
        const data = validateForm();
        if (!data) return;

        const setBusy = (busy) => {
            if (channel === 'email') {
                emailSubmitButton.disabled = busy;
                emailSubmitButtonText.textContent = busy ? 'Opening…' : 'Send via Email';
            } else {
                submitButton.disabled = busy;
                submitButtonText.textContent = busy ? 'Opening…' : 'Send via WhatsApp';
            }
        };

        setBusy(true);
        try {
            // Archive the message in the database (backup record
            // the owner can browse in Supabase -> Table Editor).
            if (sb) {
                const session = await getSession();
                const { error } = await sb.from(CONTACT_TABLE).insert({
                    name: data.name,
                    email: data.email,
                    subject: data.subject,
                    message: data.message,
                    sender_id: session?.user?.id ?? null
                });
                if (error) throw error;
            }

            if (channel === 'email') {
                window.location.href = mailtoUrl(data.name, data.email, data.subject, data.message);
                showToast('Opening your email app with the message ready to send ✉️', 'success');
            } else {
                window.open(whatsappUrl(data.name, data.email, data.subject, data.message), '_blank', 'noopener');
                showToast('Opening WhatsApp with your message ready to send 📲', 'success');
            }
            form.reset();
        } catch (error) {
            // Delivery fallback: still open the chosen channel even
            // if the database write failed.
            if (channel === 'email') {
                window.location.href = mailtoUrl(data.name, data.email, data.subject, data.message);
            } else {
                window.open(whatsappUrl(data.name, data.email, data.subject, data.message), '_blank', 'noopener');
            }
            showError(`Could not archive your message (${error.message}) — opened ${channel === 'email' ? 'your email app' : 'WhatsApp'} instead so it still gets delivered.`);
        } finally {
            setBusy(false);
        }
    }

    async function submitMessage(event) {
        event.preventDefault();
        hideError();
        await deliver('whatsapp');
    }

    async function submitViaEmail() {
        hideError();
        await deliver('email');
    }

    document.addEventListener('DOMContentLoaded', async () => {
        ownerNameEl.textContent = OWNER_NAME;
        ownerEmailText.textContent = OWNER_EMAIL;
        ownerEmailLink.href = `mailto:${OWNER_EMAIL}`;
        ownerWhatsappLink.href = `https://wa.me/${OWNER_WHATSAPP}?text=${encodeURIComponent(
            'Hi! I have a question about Pocket Manager 💜'
        )}`;

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
        emailSubmitButton.addEventListener('click', submitViaEmail);
    });
})();
