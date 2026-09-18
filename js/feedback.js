/* =============================================================
   Pocket Manager — js/feedback.js
   Shared feedback board (feedback.html).

   Every signed-in user can post feedback / bug reports and see
   ALL posts from every account. Users can delete only their own.

   Database: public.feedback
     type   -> 'feedback' | 'bug'
     status -> 'open' | 'resolved' (owner marks resolved in Supabase)
   ============================================================= */

'use strict';

const FEEDBACK_TABLE = 'feedback';

(function feedbackPage() {
    const form = document.getElementById('feedbackForm');
    const titleInput = document.getElementById('fbTitle');
    const messageInput = document.getElementById('fbMessage');
    const counterEl = document.getElementById('fbCounter');
    const errorEl = document.getElementById('fbError');
    const submitButton = document.getElementById('fbSubmit');
    const submitButtonText = document.getElementById('fbSubmitText');

    const listEl = document.getElementById('fbList');
    const countEl = document.getElementById('fbCount');
    const loadingEl = document.getElementById('fbLoading');
    const emptyEl = document.getElementById('fbEmpty');
    const refreshButton = document.getElementById('fbRefresh');
    const filtersEl = document.getElementById('fbFilters');

    let posts = [];
    let activeFilter = 'all';
    let currentUser = null;
    let armTimer = null;

    const TYPE_META = {
        feedback: { label: 'Feedback', icon: 'lightbulb', chip: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300' },
        bug: { label: 'Bug', icon: 'bug', chip: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300' }
    };

    const AVATAR_GRADIENTS = [
        'from-rose-400 to-pink-500',
        'from-violet-400 to-purple-500',
        'from-sky-400 to-blue-500',
        'from-amber-400 to-orange-500',
        'from-emerald-400 to-teal-500',
        'from-cyan-400 to-sky-500'
    ];

    function gradientFor(name) {
        let hash = 0;
        const text = String(name || '?');
        for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
        return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
    }

    function authorLabel(post) {
        if (currentUser && post.user_id === currentUser.id) return 'You';
        return post.author_name || 'Pocket Manager user';
    }

    function timeAgo(iso) {
        const then = new Date(iso).getTime();
        if (Number.isNaN(then)) return '';
        const seconds = Math.floor((Date.now() - then) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        return formatDate(iso);
    }

    function showError(message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    function hideError() {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }

    /* Animated character avatar if the author chose one, otherwise
       a colored initial derived from their name. */
    function avatarMarkup(post, name) {
        const chosen = AVATARS.find((a) => a.id === post.author_avatar);
        if (chosen) {
            return (
                '<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">' +
                `<span class="text-lg ${chosen.anim}" role="img" aria-label="${chosen.label}">${chosen.emoji}</span></span>`
            );
        }
        return (
            `<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradientFor(name)} text-base font-extrabold text-white shadow-md">${escapeHTML((name[0] || '?').toUpperCase())}</span>`
        );
    }

    function postHtml(post) {
        const meta = TYPE_META[post.type] || TYPE_META.feedback;
        const mine = currentUser && post.user_id === currentUser.id;
        const name = authorLabel(post);
        const resolved = post.status === 'resolved';

        return (
            `<li class="pm-card pm-card-hover p-5" data-post-id="${post.id}">` +
            '<div class="flex items-start gap-3">' +
            avatarMarkup(post, name) +
            '<div class="min-w-0 flex-1">' +
            '<div class="flex flex-wrap items-center gap-2">' +
            `<span class="text-sm font-bold text-slate-900 dark:text-slate-100">${escapeHTML(name)}</span>` +
            `<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${meta.chip}"><i data-lucide="${meta.icon}" class="h-3 w-3"></i> ${meta.label}</span>` +
            (resolved
                ? '<span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">✓ Resolved</span>'
                : '') +
            `<span class="text-[11px] text-slate-400 dark:text-slate-500">${escapeHTML(timeAgo(post.created_at))}</span>` +
            '</div>' +
            `<h3 class="mt-2 text-base font-semibold text-slate-800 dark:text-slate-200">${escapeHTML(post.title)}</h3>` +
            `<p class="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600 dark:text-slate-300">${escapeHTML(post.message)}</p>` +
            (mine
                ? '<div class="mt-3 flex justify-end"><button type="button" data-delete-post="' + post.id + '" data-armed="false" ' +
                  'class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">' +
                  '<i data-lucide="trash-2" class="h-3.5 w-3.5"></i> Delete</button></div>'
                : '') +
            '</div></div></li>'
        );
    }

    function renderBoard() {
        const visible = activeFilter === 'all' ? posts : posts.filter((p) => p.type === activeFilter);
        countEl.textContent = String(posts.length);

        const hasAny = posts.length > 0;
        const hasVisible = visible.length > 0;
        emptyEl.classList.toggle('hidden', hasVisible);
        if (!hasVisible && hasAny) {
            emptyEl.querySelector('p').textContent = `No ${activeFilter === 'bug' ? 'bug reports' : 'feedback'} yet`;
            emptyEl.querySelectorAll('p')[1].textContent = 'Try another filter or be the first to post.';
        }

        listEl.innerHTML = visible.map(postHtml).join('');
        window.lucide?.createIcons();
    }

    async function loadPosts() {
        loadingEl.classList.remove('hidden');
        try {
            const { data, error } = await sb
                .from(FEEDBACK_TABLE)
                .select('*')
                .order('created_at', { ascending: false })
                .limit(200);

            if (error) throw error;
            posts = data ?? [];
            renderBoard();
        } catch (error) {
            showToast(`Could not load posts: ${error.message}`, 'error');
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    async function submitPost(event) {
        event.preventDefault();
        hideError();

        const type = form.querySelector('input[name="fbType"]:checked')?.value || 'feedback';
        const title = titleInput.value.trim();
        const message = messageInput.value.trim();

        if (title.length < 3) {
            showError('Please enter a title (at least 3 characters).');
            return;
        }
        if (message.length < 5) {
            showError('Please describe your feedback in a little more detail.');
            return;
        }

        submitButton.disabled = true;
        submitButtonText.textContent = 'Posting…';
        try {
            const nickname = String(currentUser?.user_metadata?.nickname ?? '').trim();
            const email = currentUser?.email ?? '';
            const authorName = nickname || (email ? email.split('@')[0] : 'Pocket Manager user');

            const { data, error } = await sb
                .from(FEEDBACK_TABLE)
                .insert({
                    type,
                    title,
                    message,
                    author_name: authorName,
                    author_avatar: avatarFor(currentUser).id
                })
                .select()
                .single();

            if (error) throw error;

            posts.unshift(data);
            renderBoard();
            form.reset();
            counterEl.textContent = '0';
            showToast(type === 'bug' ? 'Bug report posted 🐞 Thank you!' : 'Feedback posted 💡 Thank you!', 'success');
        } catch (error) {
            showError(`Could not post: ${error.message}`);
        } finally {
            submitButton.disabled = false;
            submitButtonText.textContent = 'Post publicly';
        }
    }

    async function deletePost(id) {
        const index = posts.findIndex((p) => p.id === id);
        if (index === -1) return;
        const removed = posts[index];

        posts.splice(index, 1);
        renderBoard();

        try {
            const { error } = await sb.from(FEEDBACK_TABLE).delete().eq('id', id);
            if (error) throw error;
            showToast('Post deleted.', 'success');
        } catch (error) {
            posts.splice(index, 0, removed);
            renderBoard();
            showToast(`Could not delete: ${error.message}`, 'error');
        }
    }

    function setFilter(filter) {
        activeFilter = filter;
        filtersEl.querySelectorAll('.fb-filter').forEach((btn) => {
            const on = btn.getAttribute('data-filter') === filter;
            btn.className = on
                ? 'fb-filter rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white'
                : 'fb-filter rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300';
        });
        renderBoard();
    }

    document.addEventListener('DOMContentLoaded', async () => {
        if (!sb) {
            showError('Feedback is unavailable: missing Supabase credentials in js/config.js.');
            submitButton.disabled = true;
            return;
        }

        const session = await requireAuth();
        if (!session) return;

        currentUser = session.user;
        try {
            const { data } = await sb.auth.getUser();
            if (data?.user) currentUser = data.user;
        } catch (error) {
            // Offline: keep the session copy.
        }

        form.addEventListener('submit', submitPost);
        messageInput.addEventListener('input', () => {
            counterEl.textContent = String(messageInput.value.length);
        });
        refreshButton.addEventListener('click', loadPosts);

        filtersEl.addEventListener('click', (event) => {
            const btn = event.target.closest('.fb-filter');
            if (btn) setFilter(btn.getAttribute('data-filter'));
        });

        // Two-stage delete (arm, then confirm) like the expense list.
        listEl.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-delete-post]');
            if (!button) return;

            if (button.getAttribute('data-armed') === 'true') {
                if (armTimer) clearTimeout(armTimer);
                deletePost(button.getAttribute('data-delete-post'));
                return;
            }

            listEl.querySelectorAll('button[data-armed="true"]').forEach((b) => {
                b.setAttribute('data-armed', 'false');
                b.innerHTML = '<i data-lucide="trash-2" class="h-3.5 w-3.5"></i> Delete';
            });
            window.lucide?.createIcons();

            button.setAttribute('data-armed', 'true');
            button.textContent = 'Confirm delete?';
            armTimer = setTimeout(() => {
                button.setAttribute('data-armed', 'false');
                button.innerHTML = '<i data-lucide="trash-2" class="h-3.5 w-3.5"></i> Delete';
                window.lucide?.createIcons();
                armTimer = null;
            }, DELETE_ARM_TIMEOUT_MS);
        });

        await loadPosts();
    });
})();
