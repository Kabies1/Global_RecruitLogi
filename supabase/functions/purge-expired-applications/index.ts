import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BATCH_SIZE = 50;
const TOKEN_HEADER = 'x-retention-token';

function sixMonthsAgo(from: Date) {
  const cutoff = new Date(from);
  const day = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 6);
  const finalDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(day, finalDay));
  return cutoff;
}

function getServerKey() {
  const packed = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (packed) {
    try {
      const parsed = JSON.parse(packed);
      if (typeof parsed.default === 'string') return parsed.default;
    } catch { /* use legacy fallback */ }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const expectedToken = Deno.env.get('RETENTION_PURGE_TOKEN') ?? '';
  const suppliedToken = request.headers.get(TOKEN_HEADER) ?? '';
  // This endpoint has JWT verification disabled for the scheduled caller, so
  // require a separate secret header before accessing service-role credentials.
  if (!expectedToken || suppliedToken !== expectedToken) return new Response('Unauthorized', { status: 401 });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = getServerKey();
  if (!url || !key) return new Response('Retention service is not configured', { status: 503 });
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  let applicationsClosed = 0;
  let inquiriesClosed = 0;
  let applicationsDeleted = 0;
  let inquiriesDeleted = 0;
  let failed = 0;

  // Close stale or expired candidate-pool records first. The database trigger
  // starts the 12-month post-closure period using the database clock.
  const inactivityCutoff = sixMonthsAgo(new Date(now));
  const closeIds = new Set<string>();
  const { data: stale, error: staleError } = await supabase
    .from('candidate_applications').select('id')
    .neq('status', 'closed').lte('last_activity_at', inactivityCutoff.toISOString())
    .limit(BATCH_SIZE);
  if (staleError) {
    console.error('Retention inactivity scan failed', { code: staleError.code });
    return Response.json({ error: 'Inactivity scan failed' }, { status: 500 });
  }
  for (const row of stale ?? []) closeIds.add(row.id);

  const { data: expiredConsent, error: consentError } = await supabase
    .from('candidate_applications').select('id')
    .neq('status', 'closed').not('future_opportunities_expires_at', 'is', null)
    .lte('future_opportunities_expires_at', now).limit(BATCH_SIZE);
  if (consentError) {
    console.error('Candidate-pool expiry scan failed', { code: consentError.code });
    return Response.json({ error: 'Consent expiry scan failed' }, { status: 500 });
  }
  for (const row of expiredConsent ?? []) closeIds.add(row.id);
  for (const id of closeIds) {
    const { error } = await supabase.from('candidate_applications').update({ status: 'closed' }).eq('id', id).neq('status', 'closed');
    if (error) failed++;
    else applicationsClosed++;
  }

  const { data: oldInquiries, error: inquiryCloseError } = await supabase
    .from('contact_inquiries').select('id')
    .neq('status', 'closed').lte('last_activity_at', inactivityCutoff.toISOString())
    .limit(BATCH_SIZE);
  if (inquiryCloseError) {
    console.error('Inquiry inactivity scan failed', { code: inquiryCloseError.code });
    return Response.json({ error: 'Inquiry inactivity scan failed', applicationsClosed, failed: failed + 1 }, { status: 500 });
  }
  for (const row of oldInquiries ?? []) {
    const { error } = await supabase.from('contact_inquiries').update({ status: 'closed' }).eq('id', row.id).neq('status', 'closed');
    if (error) failed++;
    else inquiriesClosed++;
  }

  const { data: due, error: dueError } = await supabase
    .from('candidate_applications').select('id, cv_file_path')
    .not('retention_due_at', 'is', null).lte('retention_due_at', now).eq('legal_hold', false)
    .limit(BATCH_SIZE);
  if (dueError) {
    console.error('Retention due scan failed', { code: dueError.code });
    return Response.json({ error: 'Application retention scan failed', applicationsClosed, inquiriesClosed, failed: failed + 1 }, { status: 500 });
  }

  for (const row of due ?? []) {
    if (row.cv_file_path) {
      const { error } = await supabase.storage.from('candidate-cvs').remove([row.cv_file_path]);
      if (error) {
        // If the object is already missing, retrying row cleanup is still safe.
        const { data: existing, error: lookupError } = await supabase.storage.from('candidate-cvs').list(row.id, { limit: 1 });
        if (lookupError || existing?.some(file => file.name === row.cv_file_path.split('/').pop())) {
          failed++;
          continue;
        }
      }
    }
    const { error } = await supabase.from('candidate_applications').delete().eq('id', row.id).eq('legal_hold', false).lte('retention_due_at', now);
    if (error) failed++;
    else applicationsDeleted++;
  }

  const { data: inquiryDue, error: inquiryDueError } = await supabase
    .from('contact_inquiries').select('id')
    .not('retention_due_at', 'is', null).lte('retention_due_at', now).eq('legal_hold', false)
    .limit(BATCH_SIZE);
  if (inquiryDueError) {
    console.error('Inquiry retention scan failed', { code: inquiryDueError.code });
    return Response.json({ error: 'Inquiry retention scan failed', applicationsClosed, inquiriesClosed, applicationsDeleted, failed: failed + 1 }, { status: 500 });
  }
  for (const row of inquiryDue ?? []) {
    const { error } = await supabase.from('contact_inquiries').delete().eq('id', row.id).eq('legal_hold', false).lte('retention_due_at', now);
    if (error) failed++;
    else inquiriesDeleted++;
  }

  console.log('Retention run completed', { applicationsClosed, inquiriesClosed, applicationsDeleted, inquiriesDeleted, failed });
  return Response.json({ applicationsClosed, inquiriesClosed, applicationsDeleted, inquiriesDeleted, failed });
});
