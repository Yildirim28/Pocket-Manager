-- =============================================================
-- Pocket Manager — Supabase / PostgreSQL Setup Script
-- Run in: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- =============================================================

-- -------------------------------------------------------------
-- 1. EXPENSES TABLE
-- -------------------------------------------------------------
create table if not exists public.expenses (
    id           uuid primary key default gen_random_uuid(),
    created_at   timestamptz not null default now(),
    description  text not null,
    amount       numeric(10, 2) not null check (amount > 0),
    category     text not null default 'General',
    expense_date date not null default current_date
);

-- Supporting index for the primary read pattern:
-- "list expenses, newest first" (expense_date DESC)
create index if not exists expenses_expense_date_idx
    on public.expenses (expense_date desc);

comment on table public.expenses is 'Pocket Manager: manual expense records';
comment on column public.expenses.amount is 'Positive expense amount in USD, max 99,999,999.99';

-- -------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- -------------------------------------------------------------
-- RLS is enabled, with intentionally PERMISSIVE policies so the
-- anon key can perform full CRUD during development.
alter table public.expenses enable row level security;

-- NOTE: In Supabase, RLS is deny-by-default. With no policies,
-- nothing is readable/writable. The policies below open full
-- access to the anon + authenticated roles FOR DEVELOPMENT ONLY.

create policy "dev_allow_public_select"
    on public.expenses
    for select
    to anon, authenticated
    using (true);

create policy "dev_allow_public_insert"
    on public.expenses
    for insert
    to anon, authenticated
    with check (true);

create policy "dev_allow_public_update"
    on public.expenses
    for update
    to anon, authenticated
    using (true)
    with check (true);

create policy "dev_allow_public_delete"
    on public.expenses
    for delete
    to anon, authenticated
    using (true);

-- -------------------------------------------------------------
-- 3. PRODUCTION HARDENING (READ BEFORE DEPLOYING)
-- -------------------------------------------------------------
-- The policies above let ANYONE with the anon key read, modify,
-- and delete ALL rows. Before exposing Pocket Manager publicly:
--
-- Step 1 — Drop the dev policies:
--     drop policy "dev_allow_public_select" on public.expenses;
--     drop policy "dev_allow_public_insert" on public.expenses;
--     drop policy "dev_allow_public_update" on public.expenses;
--     drop policy "dev_allow_public_delete" on public.expenses;
--
-- Step 2 — Track ownership per user:
--     alter table public.expenses
--         add column user_id uuid not null default auth.uid()
--         references auth.users (id) on delete cascade;
--     create index expenses_user_id_idx on public.expenses (user_id);
--
-- Step 3 — Create scoped, authenticated-only policies:
--     create policy "Users read own expenses"
--         on public.expenses for select
--         to authenticated
--         using (auth.uid() = user_id);
--
--     create policy "Users insert own expenses"
--         on public.expenses for insert
--         to authenticated
--         with check (auth.uid() = user_id);
--
--     create policy "Users update own expenses"
--         on public.expenses for update
--         to authenticated
--         using (auth.uid() = user_id)
--         with check (auth.uid() = user_id);
--
--     create policy "Users delete own expenses"
--         on public.expenses for delete
--         to authenticated
--         using (auth.uid() = user_id);
--
-- Step 4 — Enable email/social auth in Supabase Dashboard ->
--     Authentication, then integrate supabase.auth.signIn/signUp
--     in app.js. Consider a real-time budget trigger or a
--     monthly_budget table keyed on user_id.
-- =============================================================
