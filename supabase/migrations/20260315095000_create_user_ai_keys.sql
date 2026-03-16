create table if not exists public.user_ai_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('claude', 'gemini', 'openai')),
  encrypted_key text not null,
  iv text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.user_ai_keys enable row level security;

drop policy if exists "user_ai_keys_select_own" on public.user_ai_keys;
create policy "user_ai_keys_select_own"
on public.user_ai_keys
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_ai_keys_insert_own" on public.user_ai_keys;
create policy "user_ai_keys_insert_own"
on public.user_ai_keys
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_ai_keys_update_own" on public.user_ai_keys;
create policy "user_ai_keys_update_own"
on public.user_ai_keys
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_ai_keys_delete_own" on public.user_ai_keys;
create policy "user_ai_keys_delete_own"
on public.user_ai_keys
for delete
to authenticated
using (auth.uid() = user_id);
