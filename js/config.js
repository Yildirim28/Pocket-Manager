/* =============================================================
   Pocket Manager — js/config.js
   Shared configuration and Supabase client. Loaded after the
   Supabase UMD SDK on every page.
   ============================================================= */

'use strict';

const SUPABASE_URL = 'https://nsxfulzwojdyyppypmcw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CQW-N2r5gzZTQRE5Fq2y1A_q69IbKNN';

const EXPENSES_TABLE = 'expenses';
const CONTACT_TABLE = 'contact_messages';
const BUDGET_STORAGE_KEY = 'pocket-manager:monthly-budget';
const DEFAULT_MONTHLY_BUDGET = 2000;
const DELETE_ARM_TIMEOUT_MS = 3000;

/* Owner contact info shown on the Contact page. */
const OWNER_NAME = 'Md. Shamim Osman Chowdhury';
const OWNER_EMAIL = 'shamimosman344@gmail.com';
const OWNER_WHATSAPP = '8801639815290';

function pmIsConfigured() {
    return (
        typeof SUPABASE_URL === 'string' &&
        SUPABASE_URL.startsWith('https://') &&
        !SUPABASE_URL.includes('YOUR_') &&
        typeof SUPABASE_ANON_KEY === 'string' &&
        SUPABASE_ANON_KEY.length > 20 &&
        !SUPABASE_ANON_KEY.includes('YOUR_')
    );
}

/* Create the Supabase client if the SDK is available. When the
   primary CDN failed, an onerror fallback loads the SDK from
   unpkg — page init functions retry pmInitClient() until it
   succeeds (see site.js / page scripts). */
let sb = null;
let _pmClientTries = 0;

function pmInitClient() {
    if (sb) return sb;
    if (pmIsConfigured() && window.supabase?.createClient) {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return sb;
}

pmInitClient();
