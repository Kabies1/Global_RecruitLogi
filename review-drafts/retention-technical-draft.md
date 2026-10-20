# REVIEW DRAFT — Retention and Deletion Technical Changes

**Status:** Original review draft, superseded by the approved local implementation in `../database/20261019_candidate_retention.sql`, `../supabase/functions/purge-expired-applications/`, `../admin.js`, and `../RETENTION_OPERATIONS.md`. No migration or deployment has been run.

## Scope

This proposal covers `public.candidate_applications` and the private `candidate-cvs` Storage bucket. The contact form also stores personal information in `public.contact_inquiries`; its retention period must be approved separately before a purge is enabled for that table.

## Current implementation gaps

- The candidate table has no closure, retention-due, or legal-hold fields.
- The admin page can view records, change status, and create a short-lived CV link, but cannot delete an application.
- No scheduled cleanup removes expired application rows or CV objects.
- The privacy notice does not yet state an approved period. It currently labels itself a starting point.
- The application notification email includes limited applicant metadata. Mailbox and Resend log retention must be included in the operating procedure.

## Proposed data and UI changes

1. Add `last_activity_at`, `closed_at`, `retention_due_at`, and `legal_hold` to candidate records. Initialize activity time at submission. Add an admin action to record applicant contact or review activity so the inactivity rule has a consistent meaning.
2. When an application is closed, set `closed_at` and calculate `retention_due_at` from the approved schedule. If no activity is recorded for six months, a scheduled process may close the application and start the approved retention period.
3. If future-opportunity consideration is approved, add separate opt-in capture plus `future_opportunities_consent_at` and `future_opportunities_expires_at`. Do not infer this permission from the existing application privacy checkbox.
4. Add an admin-only legal-hold control. Held records must be skipped by automated cleanup until an authorized person releases the hold.
5. Add an admin-only delete action with a clear confirmation showing the applicant and warning that both the application and CV will be removed. Enforce authorization in Supabase RLS or a server-side function; never put a service-role key in browser code.

## Proposed deletion behavior

- An authorized manual deletion and the scheduled cleanup must remove the CV object and application row as one managed operation.
- Delete the CV first. If storage deletion fails, keep the database row and report a retryable error. If the row deletion fails after the file is removed, report the partial failure so an admin can retry safely.
- Scheduled cleanup runs once per day, selects only records whose approved `retention_due_at` has passed and whose `legal_hold` is false, and processes records idempotently in small batches.
- Write operational logs with counts, result, and time only. Do not log names, emails, CV contents, addresses, or reference details.
- Document how administrators remove related notification emails from company mailboxes and review/delete provider log copies where supported. Confirm Supabase backup expiration before describing backup deletion to applicants.
- Keep contact inquiries out of the purge job until a separate retention rule for that data is approved.

## Access-control requirements

- Preserve the existing RLS protections for candidate records and private CV storage.
- Deletion must require a current authenticated session and membership in `public.admin_users` (or an equivalently protected server-side check).
- Do not grant delete access to `anon` or ordinary authenticated users. Restrict any new delete policy to authorized administrators.
- Keep server-only Supabase keys and email-provider keys in Supabase secrets, never in `site-config.js` or browser JavaScript.

## Review and release sequence

1. Approve the retention periods, inactive-closure rule, future-opportunity opt-in, contact-inquiry schedule, and legal-hold owner.
2. Confirm applicable employment-record rules with counsel and confirm Supabase, Resend, and company-mailbox retention behavior.
3. Prepare a reviewed SQL migration, admin changes, and scheduled cleanup implementation. Do not run the migration or deploy the cleanup before approval.
4. Validate with dummy records: active record is kept; inactive record closes on schedule; legal hold prevents deletion; due record removes both row and CV; failures are retryable; unauthorized sessions cannot delete.
5. Publish the finalized privacy notice and release the reviewed code. Keep an internal procedure for handling requests and recording completed deletions.
