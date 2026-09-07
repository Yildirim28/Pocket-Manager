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
            // 1. Archive the message in the database (backup record
            //    the owner can browse in Supabase -> Table Editor).
            if (sb) {
                const session = await getSession();
                const { error } = await sb.from(CONTACT_TABLE).insert({
                    name,
                    email,
                    subject,
                    message,
                    sender_id: session?.user?.id ?? null
                });
                if (error) throw error;
            }

            // 2. Deliver instantly: open WhatsApp with the message
            //    prefilled to the owner's number.
            window.open(whatsappUrl(name, email, subject, message), '_blank', 'noopener');

            form.reset();
            showToast('Message sent! The owner will get back to you soon. 💌', 'success');
        } catch (error) {
            // Delivery fallback: still let the user reach the owner
            // via WhatsApp even if the database write failed.
            showError(
                `Could not archive your message (${error.message}) — opening WhatsApp instead so it still gets delivered.`
            );
            window.open(whatsappUrl(name, email, subject, message), '_blank', 'noopener');
        } finally {
            setSubmitting(false);
        }
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
    });
})();
