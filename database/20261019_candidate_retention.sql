-- Retention controls for applications and contact inquiries. Apply once in the
-- Supabase SQL Editor after the base tables and candidate-cvs bucket exist.

alter table public.candidate_applications
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz,
  add column if not exists retention_due_at timestamptz,
  add column if not exists legal_hold boolean not null default false,
  add column if not exists future_opportunities_consent_at timestamptz,
  add column if not exists future_opportunities_expires_at timestamptz;

alter table public.contact_inquiries
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz,
  add column if not exists retention_due_at timestamptz,
  add column if not exists legal_hold boolean not null default false;

alter table public.candidate_applications enable row level security;
alter table public.contact_inquiries enable row level security;

-- Start the schedule for records already marked closed from the migration date.
update public.candidate_applications
set closed_at = coalesce(closed_at, now()),
    retention_due_at = coalesce(retention_due_at, now() + interval '12 months')
where status = 'closed';

update public.contact_inquiries
set closed_at = coalesce(closed_at, now()),
    retention_due_at = coalesce(retention_due_at, now() + interval '12 months')
where status = 'closed';

create or replace function public.manage_candidate_application_retention()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.last_activity_at := coalesce(new.last_activity_at, now());
    if new.status = 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
      new.retention_due_at := coalesce(new.retention_due_at, new.closed_at + interval '12 months');
    end if;
    if new.future_opportunities_consent_at is not null then
      new.future_opportunities_expires_at := new.future_opportunities_consent_at + interval '12 months';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    new.last_activity_at := now();
    if new.status = 'closed' then
      new.closed_at := now();
      new.retention_due_at := now() + interval '12 months';
    elsif old.status = 'closed' then
      new.closed_at := null;
      new.retention_due_at := null;
    end if;
  elsif new.last_activity_at is distinct from old.last_activity_at then
    new.last_activity_at := now();
  end if;

  if new.future_opportunities_consent_at is distinct from old.future_opportunities_consent_at then
    if new.future_opportunities_consent_at is null then
      new.future_opportunities_expires_at := null;
    else
      new.future_opportunities_expires_at := new.future_opportunities_consent_at + interval '12 months';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists candidate_application_retention on public.candidate_applications;
create trigger candidate_application_retention
before insert or update on public.candidate_applications
for each row execute function public.manage_candidate_application_retention();

create or replace function public.manage_contact_inquiry_retention()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.last_activity_at := coalesce(new.last_activity_at, now());
    if new.status = 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
      new.retention_due_at := coalesce(new.retention_due_at, new.closed_at + interval '12 months');
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    new.last_activity_at := now();
    if new.status = 'closed' then
      new.closed_at := now();
      new.retention_due_at := now() + interval '12 months';
    elsif old.status = 'closed' then
      new.closed_at := null;
      new.retention_due_at := null;
    end if;
  elsif new.last_activity_at is distinct from old.last_activity_at then
    new.last_activity_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists contact_inquiry_retention on public.contact_inquiries;
create trigger contact_inquiry_retention
before insert or update on public.contact_inquiries
for each row execute function public.manage_contact_inquiry_retention();

-- Applicant requests to leave the candidate pool must be recorded by an admin.
create or replace function public.withdraw_candidate_pool_consent(application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;
  update public.candidate_applications
  set future_opportunities_consent_at = null, status = 'closed'
  where id = application_id and future_opportunities_consent_at is not null;
end;
$$;
revoke all on function public.withdraw_candidate_pool_consent(uuid) from public, anon;
grant execute on function public.withdraw_candidate_pool_consent(uuid) to authenticated;

-- Retention dates and consent timestamps are server-managed. Admins may change
-- status, activity (through the admin page), and legal hold only.
revoke update on public.candidate_applications from authenticated;
grant update (status, last_activity_at, legal_hold) on public.candidate_applications to authenticated;

revoke all on public.contact_inquiries from anon, authenticated;
grant select on public.contact_inquiries to authenticated;
grant update (status, last_activity_at, legal_hold) on public.contact_inquiries to authenticated;
grant delete on public.contact_inquiries to authenticated;
drop policy if exists "Admins can view contact inquiries" on public.contact_inquiries;
create policy "Admins can view contact inquiries"
  on public.contact_inquiries for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));
drop policy if exists "Admins can update contact inquiry retention controls" on public.contact_inquiries;
create policy "Admins can update contact inquiry retention controls"
  on public.contact_inquiries for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));
drop policy if exists "Admins can delete contact inquiries" on public.contact_inquiries;
create policy "Admins can delete contact inquiries"
  on public.contact_inquiries for delete to authenticated
  using (legal_hold = false and exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "Admins can update application status" on public.candidate_applications;
drop policy if exists "Admins can update application retention controls" on public.candidate_applications;
create policy "Admins can update application retention controls"
  on public.candidate_applications for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "Admins can delete candidate applications" on public.candidate_applications;
create policy "Admins can delete candidate applications"
  on public.candidate_applications for delete to authenticated
  using (legal_hold = false and exists (select 1 from public.admin_users a where a.user_id = auth.uid()));
grant delete on public.candidate_applications to authenticated;

drop policy if exists "Admins can delete candidate CVs" on storage.objects;
create policy "Admins can delete candidate CVs"
  on storage.objects for delete to authenticated
  using (bucket_id = 'candidate-cvs' and exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  ) and not exists (
    select 1 from public.candidate_applications app
    where app.id::text = split_part(storage.objects.name, '/', 1)
      and app.legal_hold = true
  ));
