-- Private healthcare candidate applications and admin-only review access.
-- Run in Supabase SQL Editor. Then invite an admin under Authentication > Users,
-- copy that user's UUID, and add it to public.admin_users (see DATABASE_SETUP.md).

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
drop policy if exists "Admins can confirm their own membership" on public.admin_users;
create policy "Admins can confirm their own membership"
  on public.admin_users for select to authenticated using (user_id = auth.uid());

create table if not exists public.candidate_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  legal_first_name text not null,
  legal_middle_name text not null default '',
  legal_last_name text not null,
  email text not null,
  phone text not null,
  contact_preference text not null check (contact_preference in ('email','phone','text')),
  address jsonb not null default '{}'::jsonb,
  profession text not null,
  desired_role text not null,
  work_eligibility text not null check (work_eligibility in ('yes','no','unsure')),
  education jsonb not null default '[]'::jsonb,
  employment_history jsonb not null default '[]'::jsonb,
  credentials jsonb not null default '[]'::jsonb,
  disciplinary_action boolean not null default false,
  disciplinary_explanation text not null default '',
  professional_references jsonb not null default '[]'::jsonb,
  availability jsonb not null default '{}'::jsonb,
  background_check_consent boolean not null,
  exclusion_screening_consent boolean not null,
  health_verification_acknowledged boolean not null,
  reference_contact_consent boolean not null,
  privacy_consent boolean not null,
  declaration_accepted boolean not null,
  electronic_signature text not null,
  signed_at timestamptz not null default now(),
  cv_text text not null default '',
  cv_file_path text,
  cv_file_name text,
  status text not null default 'new' check (status in ('new','in_review','shortlisted','closed')),
  constraint candidate_email_length check (char_length(email) between 3 and 254),
  constraint candidate_cv_present check (char_length(trim(cv_text)) > 0 or cv_file_path is not null)
);

alter table public.candidate_applications enable row level security;
revoke all on public.candidate_applications from anon, authenticated;
grant select on public.candidate_applications to authenticated;
grant update (status) on public.candidate_applications to authenticated;
grant all on public.candidate_applications to service_role;
drop policy if exists "Admins can view candidate applications" on public.candidate_applications;
create policy "Admins can view candidate applications"
  on public.candidate_applications for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));
drop policy if exists "Admins can update application status" on public.candidate_applications;
create policy "Admins can update application status"
  on public.candidate_applications for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('candidate-cvs', 'candidate-cvs', false, 8388608,
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = 8388608,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can view candidate CVs" on storage.objects;
create policy "Admins can view candidate CVs"
  on storage.objects for select to authenticated
  using (bucket_id = 'candidate-cvs' and exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  ));
