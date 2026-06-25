-- Supabase queue locking migration for Excerpt workers.
-- Run this in the Supabase SQL editor for the project used by SUPABASE_URL.

alter table public.jobs
  add column if not exists locked_by text,
  add column if not exists locked_at timestamptz,
  add column if not exists failed_reason text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists progress integer default 0,
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_jobs_queue_claim
  on public.jobs (status, created_at)
  where status in ('queued', 'retrying');

create index if not exists idx_jobs_locked_at
  on public.jobs (locked_at)
  where locked_at is not null;

create or replace function public.claim_next_job(worker_id_text text)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with next_job as (
    select id
    from public.jobs
    where status = 'queued'
      and (
        payload->'retry'->>'next_retry_at' is null
        or (payload->'retry'->>'next_retry_at')::timestamptz <= now()
      )
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.jobs jobs
  set
    status = 'processing',
    locked_by = worker_id_text,
    locked_at = now(),
    updated_at = now()
  from next_job
  where jobs.id = next_job.id
  returning jobs.*;
end;
$$;

grant execute on function public.claim_next_job(text) to service_role;
