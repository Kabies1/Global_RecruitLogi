-- Contact and employer inquiries for Global Recruitment and Logistics LLC.
-- Apply this in the Supabase SQL Editor before deploying the Edge Function.

create table if not exists public.contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(trim(name)) between 1 and 150),
  email text not null check (char_length(trim(email)) between 3 and 254),
  inquiry_type text not null check (inquiry_type in ('career', 'employer', 'general')),
  organization text check (organization is null or char_length(organization) <= 200),
  message text not null check (char_length(trim(message)) between 1 and 4000),
  consent_at timestamptz not null,
  status text not null default 'new' check (status in ('new', 'in_review', 'closed'))
);

alter table public.contact_inquiries enable row level security;

-- The public website cannot access this table. The server-side Edge Function
-- uses the Supabase secret key and inserts records without exposing that key.
revoke all on table public.contact_inquiries from anon, authenticated;
grant insert (name, email, inquiry_type, organization, message, consent_at)
  on table public.contact_inquiries to service_role;
