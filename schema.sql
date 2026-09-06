-- =============================================================
-- Pocket Manager — Supabase / PostgreSQL Setup Script (v2)
-- Run in: Supabase Dashboard -> SQL Editor -> New Query -> Run
--
-- v2 adds: per-user data (Supabase Auth), contact messages.
-- Safe to run on a project that already ran the v1 script.
-- =============================================================

-- -------------------------------------------------------------
-- 1. EXPENSES TABLE (per-user)
-- -------------------------------------------------------------
create table if not exists public.expenses (
    id           uuid primary key default gen_random_uuid(),
    created_at   timestamptz not null default now(),
    description  text not null,
    amount       numeric(10, 2) not null check (amount > 0),
    category     text not null default 'General',
    expense_date date not null default current_date,
    user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade
);

-- Migration for projects that ran the v1 script (no user_id then):
alter table public.expenses
    add column if not exists user_id uuid default auth.uid() references auth.users (id) on delete cascade;

-- v3: optional per-person cost breakdown for an expense.
-- Stored as a JSON array of {name, amount} shares, e.g.
-- [{"name":"Alice","amount":30},{"name":"Bob","amount":30}]
alter table public.expenses
    add column if not exists participants jsonb default null;

comment on column public.expenses.participants
    is 'Optional per-person shares: JSON array of {name, amount}';

-- NOTE: rows created under the old permissive v1 setup have no
-- owner (user_id null) and become invisible to every account.
-- They were public test data; uncomment to remove them:
-- delete from public.expenses where user_id is null;

create index if not exists expenses_expense_date_idx
    on public.expenses (expense_date desc);
create index if not exists expenses_user_id_idx
    on public.expenses (user_id);

comment on table public.expenses is 'Pocket Manager: per-user manual expense records';

-- -------------------------------------------------------------
-- 2. ROW LEVEL SECURITY — expenses (per-user, authenticated only)
-- -------------------------------------------------------------
alter table public.expenses enable row level security;

-- Remove the v1 development policies if present.
drop policy if exists "dev_allow_public_select" on public.expenses;
drop policy if exists "dev_allow_public_insert" on public.expenses;
drop policy if exists "dev_allow_public_update" on public.expenses;
drop policy if exists "dev_allow_public_delete" on public.expenses;

create policy "users_select_own_expenses"
    on public.expenses
    for select
    to authenticated
    using (auth.uid() = user_id);

create policy "users_insert_own_expenses"
    on public.expenses
    for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "users_update_own_expenses"
    on public.expenses
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "users_delete_own_expenses"
    on public.expenses
    for delete
    to authenticated
    using (auth.uid() = user_id);

-- -------------------------------------------------------------
-- 3. CONTACT MESSAGES
-- -------------------------------------------------------------
-- Visitors can send messages to the owner from the Contact page.
-- Only INSERT is allowed via the API; the owner reads messages in
-- Supabase Dashboard -> Table Editor -> contact_messages.
create table if not exists public.contact_messages (
    id         uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    sender_id  uuid references auth.users (id) on delete set null,
    name       text not null,
    email      text not null,
    subject    text not null,
    message    text not null
);

alter table public.contact_messages enable row level security;

create policy "anyone_insert_contact_messages"
    on public.contact_messages
    for insert
    to anon, authenticated
    with check (true);
