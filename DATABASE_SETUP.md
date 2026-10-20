# Inquiry database and email setup

The contact form submits to a Supabase Edge Function. The function saves each inquiry in Postgres and sends an email to `admin1@glblogistics.org` and `mkabeireho@glblogistics.org` through Resend.

## Project values

- Supabase project URL: `https://fxvlsnxhhrzebvtgxjan.supabase.co`
- Supabase project reference: `fxvlsnxhhrzebvtgxjan`
- Website origin: `https://glblogistics.org` (confirmed reachable over HTTPS)
- Resend sending domain: `glblogistics.org` (reported verified)

The project URL and publishable key you supplied are saved in `site-config.js`. The publishable key is browser-safe. Never add a Supabase secret/service-role key, database password, or Resend API key to website files.

## 1. Create the database table

In the Supabase Dashboard, open **SQL Editor**, paste and run `database/schema.sql`. Row Level Security is enabled and public roles have no table access. Only the server-side Edge Function can insert inquiries.

## 2. Set Edge Function secrets

In Supabase Dashboard, open **Edge Functions → Secrets** and add:

- `RESEND_API_KEY` — a Resend sending API key. Enter it only in Supabase; do not send it in chat or store it in the website folder.
- `EMAIL_FROM` — `Global Recruitment and Logistics <admin1@glblogistics.org>`
- `SITE_ORIGIN` — `https://glblogistics.org`

Supabase supplies the project URL and server-only secret key to the Edge Function. The function uses that key only on the server to save inquiries.

## 3. Deploy the Edge Function

From this project folder, authenticate and deploy with the Supabase CLI. Node.js and `npx` are available; the CLI is not installed globally.

```sh
npx supabase login
npx supabase link --project-ref fxvlsnxhhrzebvtgxjan
npx supabase functions deploy submit-inquiry
```

The `link` command may ask for the database password you set when creating the project. Enter it in the terminal prompt only; do not put it in a file or share it.

## 4. Publish the updated website

Upload the updated website files from this project to Hostinger, including `site-config.js`, `site.js`, and `contact.html`. The inquiry form will not reach the backend until the Edge Function has been deployed and the updated front-end files are live.

## 5. Verify

Submit a test inquiry you control, then confirm it appears in `contact_inquiries` and arrives at both company addresses. The function currently has exact-origin validation and a honeypot. Add server-side CAPTCHA and rate limiting before broad production use. Confirm the company privacy notice, authorized staff access, and retention/deletion rules before collecting submissions.

The form collects contact details and messages only. It does not accept document uploads. Do not ask people to submit medical, financial, passport, or immigration documents through this form.

## Candidate applications, private CV storage, and admin access

The candidate application uses a separate private table and private Storage bucket. It is not accessible to the public site. Admins sign in at `admin.html`; only Supabase Auth users whose UUID is listed in `public.admin_users` can see application records or create short-lived CV links.

1. In Supabase **SQL Editor**, run `database/candidate_applications.sql`.
2. In **Authentication → Users**, invite/create the company admin account. Copy its user UUID.
3. In SQL Editor, grant that account access (replace the placeholder with the UUID):

   ```sql
   insert into public.admin_users (user_id)
   values ('PASTE-AUTH-USER-UUID-HERE')
   on conflict (user_id) do nothing;
   ```

4. Deploy the new function from the project folder:

   ```sh
   npx supabase functions deploy submit-application --project-ref fxvlsnxhhrzebvtgxjan
   ```

   The contact notification now contains only an inquiry ID; deploy its updated function too:

   ```sh
   npx supabase functions deploy submit-inquiry --project-ref fxvlsnxhhrzebvtgxjan
   ```

5. In **Edge Functions → Secrets**, confirm these already-configured secrets remain available to the new function: `SITE_ORIGIN` (`https://glblogistics.org`), `RESEND_API_KEY`, and `EMAIL_FROM`. The function also reads Supabase's server-side secret key from `SUPABASE_SECRET_KEYS` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`). Never put server keys in `site-config.js`.
6. Upload `candidate_applications.html`, `candidate-application.js`, `contact.html`, `admin.html`, `admin.js`, `privacy.html`, the updated `site.css`, `site-config.js`, and the edited existing HTML pages to Hostinger. Keep the `supabase/` folder and SQL migration in your local project; deploy functions with the CLI and run SQL in Supabase instead of uploading those files to the website host.
7. In Supabase **Authentication → URL Configuration → Redirect URLs**, add `https://glblogistics.org/admin.html`. Open the invite email on your device and follow its link; if it returns to the homepage, navigate to `https://glblogistics.org/admin.html` and set your password there. The admin page also has a **Set or reset password** link. Then sign in and confirm you can view applications. Applications and CVs remain private; CV links expire after one minute.

Candidate files are limited to PDF, DOC, or DOCX up to 8 MB. Applications can instead include pasted CV text. The form deliberately does not collect medical details, IDs, passports, or immigration documents. Review `RETENTION_OPERATIONS.md` for the approved application-retention setup. Confirm applicable recordkeeping obligations and provider retention periods before enabling automated deletion.

## Candidate retention deployment

The approved local implementation is in `database/20261019_candidate_retention.sql`, `supabase/functions/purge-expired-applications/`, and `RETENTION_OPERATIONS.md`. Apply the migration, deploy the cleanup function, set its private token, and configure the Vault-backed daily schedule using the instructions in that operations guide. Do not upload SQL or function files to Hostinger.
