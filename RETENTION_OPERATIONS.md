# Candidate application retention setup

The website copy, admin controls, database migration, and cleanup function are prepared locally. They have **not** been applied to Supabase or published to Hostinger. The same schedule applies to contact inquiries; they are visible in the admin page and included in the cleanup job.

## Approved application schedule

- Six months with no recorded status update, recorded contact/review activity, or renewed candidate-pool permission closes an application.
- Close starts a 12-month retention period. An administrator can reopen an application and record activity.
- Optional candidate-pool consent is separate from application submission and expires 12 months after consent.
- Contact inquiries use the same six-month inactivity closure and 12-month post-closure retention period.
- Legal holds block both scheduled and admin deletion.
- After the retention date, the scheduled function deletes the CV through the Storage API and then deletes the row. A failed CV removal leaves the row for retry.
- Manual deletion follows the same CV-first order. Deletion from active systems does not guarantee immediate removal from provider backups, logs, or company mailboxes.
- New contact notification emails contain only an inquiry ID, so inquiry details remain in the admin-only database. Older notification emails may contain inquiry details; remove them from company mailboxes and use provider deletion controls where available. Otherwise, provider logs expire under the provider’s own schedule.

## Release steps

1. Confirm that the privacy wording and periods fit the company’s locations, contracts, and recordkeeping obligations. The site notice describes a U.S.-focused workflow; applicable rules can require longer retention.
2. Apply `database/20261019_candidate_retention.sql` in the Supabase SQL Editor. It adds retention fields and admin-only policies for `candidate_applications`, `contact_inquiries`, and `candidate-cvs` Storage. It does not delete existing rows.
3. Deploy the purge function:

   ```sh
   npx supabase functions deploy purge-expired-applications --project-ref fxvlsnxhhrzebvtgxjan
   ```

4. Generate a long random token locally, then set the function secret. Do not commit the token:

   ```sh
   openssl rand -hex 32
   npx supabase secrets set RETENTION_PURGE_TOKEN=PASTE_GENERATED_TOKEN --project-ref fxvlsnxhhrzebvtgxjan
   ```

5. In Supabase SQL Editor, enable Vault, `pg_cron`, and `pg_net` if needed. In `database/schedule_candidate_retention.sql`, replace the publishable-key placeholder with the website’s Supabase publishable key and the token placeholder with the same generated token. Run the script once. It calls the function daily at 06:30 UTC.
6. Publish the website files (`privacy.html`, `candidate_applications.html`, `candidate-application.js`, `admin.js`) to Hostinger.
7. Before enabling the daily job, validate using dummy applications and inquiries: no activity for six months is closed; candidate-pool consent expires at 12 months; legal-hold records are skipped until their due date; an expired application removes its CV and row; expired inquiries are removed; manual deletion is restricted to admins; and a failed Storage removal preserves the application row.
8. Keep an internal process for removing notification copies from Resend and company mailboxes. Confirm provider backup/log periods before making more specific deletion promises.

The migration and deployment commands above are instructions only; they have not been run.
