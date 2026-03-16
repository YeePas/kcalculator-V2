create table if not exists public.issue_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid null references auth.users(id) on delete set null,
  context text not null,
  message text not null,
  status text not null default 'open',
  severity text not null default 'medium',
  details jsonb not null default '{}'::jsonb,
  page_path text null,
  report_date text null,
  meal text null,
  created_at_client text null,
  user_agent text null,
  user_email_hint text null,
  resolved_at timestamptz null,
  resolved_by uuid null references auth.users(id) on delete set null
);

alter table public.issue_reports
  add constraint issue_reports_severity_check
  check (severity in ('low', 'medium', 'high', 'critical'));

alter table public.issue_reports
  add constraint issue_reports_status_check
  check (status in ('open', 'triaged', 'resolved'));

create index if not exists idx_issue_reports_created_at on public.issue_reports (created_at desc);
create index if not exists idx_issue_reports_severity on public.issue_reports (severity);
create index if not exists idx_issue_reports_status on public.issue_reports (status);
create index if not exists idx_issue_reports_context on public.issue_reports (context);
create index if not exists idx_issue_reports_user_id on public.issue_reports (user_id);

alter table public.issue_reports enable row level security;

-- Keep table private by default; inserts happen via Edge Function using service role.
drop policy if exists "issue_reports_select_own" on public.issue_reports;
create policy "issue_reports_select_own"
  on public.issue_reports
  for select
  to authenticated
  using (auth.uid() = user_id);
