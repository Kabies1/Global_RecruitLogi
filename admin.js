import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const config = window.SITE_CONFIG || {};
const loginPanel = document.querySelector('#admin-login-panel');
const loginForm = document.querySelector('#admin-login-form');
const dashboard = document.querySelector('#admin-dashboard');
const passwordPanel = document.querySelector('#admin-password-panel');
const resetForm = document.querySelector('#admin-reset-form');
const passwordForm = document.querySelector('#admin-password-form');
const resetStatus = document.querySelector('#admin-reset-status');
const passwordStatus = document.querySelector('#admin-password-status');
const authStatus = document.querySelector('#admin-auth-status');
const loadStatus = document.querySelector('#application-load-status');
const tbody = document.querySelector('#application-list');
const count = document.querySelector('#admin-count');
const inquiryBody = document.querySelector('#inquiry-list');
const inquiryCount = document.querySelector('#inquiry-count');
let applications = [];
let inquiries = [];
// Supabase may consume the recovery URL and clean its tokens before the auth
// state callback runs, so capture recovery intent before creating the client.
const urlParams = new URLSearchParams(location.search);
const hashParams = new URLSearchParams(location.hash.slice(1));
const credentialLinkAtLoad = /[?&]code=/.test(location.search) ||
  ['invite', 'recovery'].includes(urlParams.get('type')) ||
  ['invite', 'recovery'].includes(hashParams.get('type'));
let passwordRecoveryPending = credentialLinkAtLoad;
let client;
if (config.supabaseUrl && config.supabasePublishableKey) {
  client = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
} else authStatus.textContent = 'Admin access is not configured.';

function element(tag, text = '') { const node = document.createElement(tag); if (text !== undefined) node.textContent = String(text); return node; }
function line(parent, label, value) {
  const wrapper = element('div'); wrapper.className = 'admin-detail-line';
  wrapper.append(element('strong', `${label}: `), element('span', value ?? '—')); parent.append(wrapper); return wrapper;
}
function section(parent, title) { const box = element('section'); box.className = 'admin-detail-section'; box.append(element('h4', title)); parent.append(box); return box; }
function rowsAsList(parent, values, fields) {
  if (!Array.isArray(values) || !values.length) { parent.append(element('p', 'None provided.')); return; }
  const list = element('div'); list.className = 'admin-detail-grid';
  values.forEach((item, index) => { const card = element('article'); card.className = 'admin-data-card'; card.append(element('b', `${index + 1}. ${fields.map(field => item?.[field]).find(Boolean) || 'Entry'}`));
    for (const field of fields.slice(1)) if (item?.[field]) line(card, field.replaceAll('_', ' '), item[field]); list.append(card); }); parent.append(list);
}
function renderDetails(app, holder) {
  const detail = element('div'); detail.className = 'application-detail';
  const personal = section(detail, 'Personal and contact');
  line(personal, 'Legal name', [app.legal_first_name, app.legal_middle_name, app.legal_last_name].filter(Boolean).join(' '));
  line(personal, 'Email', app.email); line(personal, 'Phone', app.phone); line(personal, 'Preferred contact', app.contact_preference);
  const addr = app.address || {}; line(personal, 'Address', [addr.street, addr.unit, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean).join(', '));
  line(personal, 'Profession', app.profession); line(personal, 'Desired role', app.desired_role); line(personal, 'Work eligibility', app.work_eligibility);
  rowsAsList(section(detail, 'Education'), app.education, ['institution','degree','field','country','completion_year']);
  rowsAsList(section(detail, 'Employment history'), app.employment_history, ['facility','facility_type','title','start_date','end_date','specialties','responsibilities','reason_for_leaving']);
  rowsAsList(section(detail, 'Licenses and credentials'), app.credentials, ['credential_type','number','issuer','expiration_date','cpr_status']);
  line(section(detail, 'License history'), 'Disciplinary action', app.disciplinary_action ? (app.disciplinary_explanation || 'Yes') : 'No');
  rowsAsList(section(detail, 'Professional references'), app.professional_references, ['name','title','facility','phone','email','relationship']);
  const availability = app.availability || {}; const av = section(detail, 'Availability');
  line(av, 'Employment status', availability.employment_status); line(av, 'Preferred shifts', (availability.shifts || []).join(', '));
  line(av, 'Available start date', availability.start_date); line(av, 'Travel', availability.travel ? 'Yes' : 'No'); line(av, 'On call', availability.on_call ? 'Yes' : 'No');
  const checks = section(detail, 'Consents and declaration');
  line(checks, 'Background check consent', app.background_check_consent ? 'Yes' : 'No');
  line(checks, 'OIG / SAM screening consent', app.exclusion_screening_consent ? 'Yes' : 'No');
  line(checks, 'Health verification acknowledgement', app.health_verification_acknowledged ? 'Yes' : 'No');
  line(checks, 'Reference contact consent', app.reference_contact_consent ? 'Yes' : 'No');
  line(checks, 'Applicant declaration', `${app.electronic_signature || ''} · ${app.signed_at ? new Date(app.signed_at).toLocaleString() : ''}`);
  const cv = section(detail, 'Resume / CV');
  if (app.cv_file_path) {
    const button = element('button', 'Create secure CV download link'); button.type = 'button'; button.className = 'btn btn-light';
    const info = element('p', app.cv_file_name || 'CV attachment'); info.className = 'field-help'; cv.append(info, button);
    button.addEventListener('click', async () => {
      button.disabled = true; button.textContent = 'Preparing secure link…';
      const { data, error } = await client.storage.from('candidate-cvs').createSignedUrl(app.cv_file_path, 60);
      if (error) { button.textContent = 'Unable to open CV'; info.textContent = error.message; return; }
      const link = element('a', 'Download CV (link expires in 60 seconds)'); link.href = data.signedUrl; link.target = '_blank'; link.rel = 'noopener'; link.className = 'text-link'; cv.append(link); button.textContent = 'Secure link ready';
    });
  }
  if (app.cv_text) { const pre = element('pre', app.cv_text); pre.className = 'cv-text'; cv.append(pre); }
  const retention = section(detail, 'Retention and deletion');
  line(retention, 'Last recorded activity', app.last_activity_at ? new Date(app.last_activity_at).toLocaleString() : 'Not recorded');
  line(retention, 'Closed', app.closed_at ? new Date(app.closed_at).toLocaleString() : 'No');
  line(retention, 'Scheduled deletion', app.retention_due_at ? new Date(app.retention_due_at).toLocaleDateString() : 'Not scheduled');
  line(retention, 'Candidate-pool consent expires', app.future_opportunities_expires_at ? new Date(app.future_opportunities_expires_at).toLocaleDateString() : 'No active consent');
  if (app.future_opportunities_consent_at) {
    const withdraw = element('button', 'Record applicant request to withdraw candidate-pool consent');
    withdraw.type = 'button'; withdraw.className = 'btn btn-light'; retention.append(withdraw);
    withdraw.addEventListener('click', async () => {
      if (!confirm('Confirm that the applicant requested removal from the candidate pool? This will close the application and start its 12-month retention period.')) return;
      withdraw.disabled = true; withdraw.textContent = 'Recording request…';
      const { error } = await client.rpc('withdraw_candidate_pool_consent', { application_id: app.id });
      if (error) {
        withdraw.disabled = false; withdraw.textContent = 'Record applicant request to withdraw candidate-pool consent';
        loadStatus.textContent = `Could not record the request: ${error.message}`;
        return;
      }
      loadStatus.textContent = 'Candidate-pool consent withdrawn and application closed.';
      await loadApplications();
    });
  }
  const holdLabel = element('label', ' Legal hold (prevents scheduled deletion)');
  const hold = element('input'); hold.type = 'checkbox'; hold.checked = app.legal_hold === true;
  hold.setAttribute('aria-label', `Legal hold for ${app.legal_first_name} ${app.legal_last_name}`);
  holdLabel.prepend(hold); retention.append(holdLabel);
  const remove = element('button', 'Delete application and CV');
  remove.type = 'button'; remove.className = 'btn btn-light'; remove.disabled = app.legal_hold === true; retention.append(remove);
  hold.addEventListener('change', async () => {
    hold.disabled = true;
    const { data, error } = await client.from('candidate_applications').update({ legal_hold: hold.checked })
      .eq('id', app.id).select('legal_hold').single();
    if (error) { loadStatus.textContent = `Could not update legal hold: ${error.message}`; hold.checked = app.legal_hold === true; }
    else {
      app.legal_hold = data.legal_hold; remove.disabled = app.legal_hold;
      loadStatus.textContent = app.legal_hold ? 'Legal hold enabled; manual and scheduled deletion are blocked.' : 'Legal hold released.';
    }
    hold.disabled = false;
  });
  const activity = element('button', app.status === 'closed' ? 'Reopen and record activity' : 'Record applicant contact or review activity');
  activity.type = 'button'; activity.className = 'btn btn-light'; retention.append(activity);
  activity.addEventListener('click', async () => {
    activity.disabled = true; activity.textContent = 'Recording activity…';
    const update = { last_activity_at: new Date().toISOString() };
    if (app.status === 'closed') update.status = 'in_review';
    const { data, error } = await client.from('candidate_applications').update(update)
      .eq('id', app.id).select('status,last_activity_at,closed_at,retention_due_at').single();
    if (error) { loadStatus.textContent = `Could not record activity: ${error.message}`; activity.textContent = 'Record applicant contact or review activity'; }
    else {
      Object.assign(app, data);
      if (app.status === 'in_review') {
        const statusSelect = holder.closest('tr')?.querySelector('select');
        if (statusSelect) statusSelect.value = 'in_review';
      }
      loadStatus.textContent = app.status === 'in_review' ? 'Application reopened and activity recorded.' : 'Activity recorded. The inactivity period has restarted.';
      activity.textContent = 'Activity recorded';
      holder.replaceChildren(); renderDetails(app, holder);
    }
    activity.disabled = false;
  });
  remove.addEventListener('click', async () => {
    const name = [app.legal_first_name, app.legal_last_name].filter(Boolean).join(' ');
    if (!confirm(`Permanently delete ${name}'s application and any uploaded CV? This cannot be undone.`)) return;
    remove.disabled = true; remove.textContent = 'Deleting…';
    if (app.cv_file_path) {
      const { error } = await client.storage.from('candidate-cvs').remove([app.cv_file_path]);
      if (error) {
        remove.disabled = false; remove.textContent = 'Delete application and CV';
        loadStatus.textContent = `CV deletion failed; the application was kept. Retry after checking Storage: ${error.message}`;
        return;
      }
    }
    const { error } = await client.from('candidate_applications').delete().eq('id', app.id);
    if (error) {
      remove.disabled = false; remove.textContent = 'Delete application and CV';
      loadStatus.textContent = `Application row deletion failed. The CV may already be removed; retry is safe: ${error.message}`;
      return;
    }
    applications = applications.filter(item => item.id !== app.id); render();
    loadStatus.textContent = 'Application and uploaded CV deleted from active systems.';
  });
  holder.append(detail);
}
function render() {
  const filter = document.querySelector('#application-filter').value;
  const shown = filter === 'all' ? applications : applications.filter(app => app.status === filter);
  tbody.replaceChildren(); count.textContent = `${shown.length} of ${applications.length} application${applications.length === 1 ? '' : 's'}`;
  if (!shown.length) { const row = element('tr'); const cell = element('td', 'No applications in this view.'); cell.colSpan = 5; row.append(cell); tbody.append(row); return; }
  shown.forEach(app => {
    const row = element('tr'); row.append(element('td', new Date(app.created_at).toLocaleString()));
    row.append(element('td', `${app.legal_first_name} ${app.legal_last_name}`));
    row.append(element('td', `${app.profession} · ${app.desired_role}`));
    const statusCell = element('td'); const select = element('select'); select.setAttribute('aria-label', `Status for ${app.legal_first_name} ${app.legal_last_name}`);
    [['new','New'],['in_review','In review'],['shortlisted','Shortlisted'],['closed','Closed']].forEach(([value,label]) => { const option = element('option', label); option.value = value; option.selected = app.status === value; select.append(option); });
    select.addEventListener('change', async () => {
      select.disabled = true;
      const { data, error } = await client.from('candidate_applications').update({ status: select.value }).eq('id', app.id)
        .select('status,last_activity_at,closed_at,retention_due_at').single();
      if (error) { loadStatus.textContent = `Could not update status: ${error.message}`; select.value = app.status; }
      else {
        Object.assign(app, data);
        loadStatus.textContent = app.status === 'closed' ? 'Application closed; 12-month retention period started.' : 'Application status updated.';
        if (holder.firstChild) { holder.replaceChildren(); if (!holder.hidden) renderDetails(app, holder); }
      }
      select.disabled = false;
    });
    statusCell.append(select); row.append(statusCell);
    const detailCell = element('td'); const toggle = element('button', 'View'); toggle.type = 'button'; toggle.className = 'btn btn-light'; const holder = element('div'); holder.hidden = true;
    toggle.addEventListener('click', () => { holder.hidden = !holder.hidden; toggle.textContent = holder.hidden ? 'View' : 'Hide'; if (!holder.firstChild) renderDetails(app, holder); });
    detailCell.append(toggle, holder); row.append(detailCell); tbody.append(row);
  });
}
function renderInquiries() {
  const filter = document.querySelector('#inquiry-filter').value;
  const shown = filter === 'all' ? inquiries : inquiries.filter(inquiry => inquiry.status === filter);
  inquiryBody.replaceChildren();
  inquiryCount.textContent = `${shown.length} of ${inquiries.length} ${inquiries.length === 1 ? 'inquiry' : 'inquiries'}`;
  if (!shown.length) { const row = element('tr'); const cell = element('td', 'No inquiries in this view.'); cell.colSpan = 5; row.append(cell); inquiryBody.append(row); return; }
  shown.forEach(inquiry => {
    const row = element('tr'); row.append(element('td', new Date(inquiry.created_at).toLocaleString()));
    row.append(element('td', inquiry.name));
    row.append(element('td', `${inquiry.inquiry_type}${inquiry.organization ? ` · ${inquiry.organization}` : ''}`));
    const statusCell = element('td'); const select = element('select');
    select.setAttribute('aria-label', `Status for inquiry from ${inquiry.name}`);
    [['new','New'],['in_review','In review'],['closed','Closed']].forEach(([value,label]) => { const option = element('option', label); option.value = value; option.selected = inquiry.status === value; select.append(option); });
    select.addEventListener('change', async () => {
      select.disabled = true;
      const { data, error } = await client.from('contact_inquiries').update({ status: select.value }).eq('id', inquiry.id)
        .select('status,last_activity_at,closed_at,retention_due_at').single();
      if (error) { loadStatus.textContent = `Could not update inquiry status: ${error.message}`; select.value = inquiry.status; }
      else { Object.assign(inquiry, data); loadStatus.textContent = inquiry.status === 'closed' ? 'Inquiry closed; 12-month retention period started.' : 'Inquiry status updated.'; }
      select.disabled = false;
    });
    statusCell.append(select); row.append(statusCell);
    const detailsCell = element('td'); const toggle = element('button', 'View'); toggle.type = 'button'; toggle.className = 'btn btn-light';
    const holder = element('div'); holder.hidden = true;
    toggle.addEventListener('click', () => {
      holder.hidden = !holder.hidden; toggle.textContent = holder.hidden ? 'View' : 'Hide';
      if (holder.firstChild) return;
      const detail = element('div'); detail.className = 'application-detail';
      const contact = section(detail, 'Inquiry details');
      line(contact, 'Inquiry ID', inquiry.id); line(contact, 'Name', inquiry.name); line(contact, 'Type', inquiry.inquiry_type);
      line(contact, 'Organization', inquiry.organization); line(contact, 'Received', new Date(inquiry.created_at).toLocaleString());
      const emailLine = element('div'); emailLine.className = 'admin-detail-line'; emailLine.append(element('strong', 'Email: '));
      const emailLink = element('a', inquiry.email); emailLink.href = `mailto:${encodeURIComponent(inquiry.email)}`; emailLink.className = 'text-link'; emailLine.append(emailLink); contact.append(emailLine);
      line(contact, 'Message', inquiry.message);
      const retention = section(detail, 'Retention and deletion');
      line(retention, 'Last recorded activity', new Date(inquiry.last_activity_at).toLocaleString());
      line(retention, 'Closed', inquiry.closed_at ? new Date(inquiry.closed_at).toLocaleString() : 'No');
      line(retention, 'Scheduled deletion', inquiry.retention_due_at ? new Date(inquiry.retention_due_at).toLocaleDateString() : 'Not scheduled');
      const holdLabel = element('label', ' Legal hold (prevents deletion)'); const hold = element('input');
      hold.type = 'checkbox'; hold.checked = inquiry.legal_hold === true; holdLabel.prepend(hold); retention.append(holdLabel);
      const remove = element('button', 'Delete inquiry'); remove.type = 'button'; remove.className = 'btn btn-light';
      remove.disabled = inquiry.legal_hold === true; retention.append(remove);
      hold.addEventListener('change', async () => {
        hold.disabled = true;
        const { data, error } = await client.from('contact_inquiries').update({ legal_hold: hold.checked }).eq('id', inquiry.id).select('legal_hold').single();
        if (error) { loadStatus.textContent = `Could not update inquiry legal hold: ${error.message}`; hold.checked = inquiry.legal_hold === true; }
        else { inquiry.legal_hold = data.legal_hold; remove.disabled = inquiry.legal_hold; loadStatus.textContent = inquiry.legal_hold ? 'Inquiry legal hold enabled.' : 'Inquiry legal hold released.'; }
        hold.disabled = false;
      });
      const activity = element('button', inquiry.status === 'closed' ? 'Reopen and record activity' : 'Record contact or review activity');
      activity.type = 'button'; activity.className = 'btn btn-light'; retention.append(activity);
      activity.addEventListener('click', async () => {
        activity.disabled = true;
        const changes = { last_activity_at: new Date().toISOString() };
        if (inquiry.status === 'closed') changes.status = 'in_review';
        const { data, error } = await client.from('contact_inquiries').update(changes).eq('id', inquiry.id)
          .select('status,last_activity_at,closed_at,retention_due_at').single();
        if (error) { loadStatus.textContent = `Could not record inquiry activity: ${error.message}`; activity.disabled = false; return; }
        Object.assign(inquiry, data); loadStatus.textContent = inquiry.status === 'in_review' ? 'Inquiry reopened and activity recorded.' : 'Inquiry activity recorded.';
        select.value = inquiry.status; holder.replaceChildren(); renderInquiries();
      });
      remove.addEventListener('click', async () => {
        if (!confirm(`Permanently delete the inquiry from ${inquiry.name}? This cannot be undone.`)) return;
        remove.disabled = true; remove.textContent = 'Deleting…';
        const { error } = await client.from('contact_inquiries').delete().eq('id', inquiry.id);
        if (error) { remove.disabled = false; remove.textContent = 'Delete inquiry'; loadStatus.textContent = `Could not delete inquiry: ${error.message}`; return; }
        inquiries = inquiries.filter(item => item.id !== inquiry.id); renderInquiries(); loadStatus.textContent = 'Inquiry deleted from the active database.';
      });
      holder.append(detail);
    });
    detailsCell.append(toggle, holder); row.append(detailsCell); inquiryBody.append(row);
  });
}
async function loadApplications() {
  loadStatus.textContent = 'Loading applications and inquiries…';
  const [applicationResult, inquiryResult] = await Promise.all([
    client.from('candidate_applications').select('*').order('created_at', { ascending: false }),
    client.from('contact_inquiries').select('*').order('created_at', { ascending: false })
  ]);
  if (applicationResult.error || inquiryResult.error) {
    const error = applicationResult.error || inquiryResult.error;
    loadStatus.textContent = `Unable to load admin records: ${error.message}`; return;
  }
  applications = applicationResult.data || []; inquiries = inquiryResult.data || [];
  loadStatus.textContent = ''; render(); renderInquiries();
}
function credentialFlow() { return passwordRecoveryPending; }
async function setSession(session) {
  if (!session) { loginPanel.hidden = false; dashboard.hidden = true; passwordPanel.hidden = true; return; }
  if (credentialFlow()) { loginPanel.hidden = true; dashboard.hidden = true; passwordPanel.hidden = false; return; }
  const { data, error } = await client.from('admin_users').select('user_id').eq('user_id', session.user.id).maybeSingle();
  if (error || !data) { await client.auth.signOut(); loginPanel.hidden = false; dashboard.hidden = true; authStatus.textContent = 'This account is not authorized for the admin portal. Ask an administrator to grant access.'; return; }
  authStatus.textContent = ''; loginPanel.hidden = true; dashboard.hidden = false; await loadApplications();
}
if (client) {
  document.querySelector('#show-password-reset').addEventListener('click', () => { loginForm.hidden = true; resetForm.hidden = false; resetStatus.textContent = ''; });
  document.querySelector('#hide-password-reset').addEventListener('click', () => { resetForm.hidden = true; loginForm.hidden = false; });
  resetForm.addEventListener('submit', async event => {
    event.preventDefault(); resetStatus.textContent = 'Sending a secure password link…';
    const email = new FormData(resetForm).get('email');
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${location.pathname}` });
    resetStatus.textContent = error ? 'Could not send the link. Confirm this URL is allowed in Supabase Auth URL Configuration, then try again.' : 'If this email belongs to an account, Supabase will send a password link. Open it on this device, then return to this admin page to set your password.';
  });
  passwordForm.addEventListener('submit', async event => {
    event.preventDefault(); passwordStatus.textContent = '';
    const values = new FormData(passwordForm); const password = values.get('password');
    if (password !== values.get('confirm_password')) { passwordStatus.textContent = 'The passwords do not match.'; return; }
    passwordStatus.textContent = 'Saving password…';
    const { error } = await client.auth.updateUser({ password });
    if (error) { passwordStatus.textContent = `Could not set the password: ${error.message}`; return; }
    passwordRecoveryPending = false;
    history.replaceState({}, document.title, location.pathname);
    passwordStatus.textContent = 'Password saved. Opening the admin dashboard…';
    const { data } = await client.auth.getSession(); await setSession(data.session);
  });
  loginForm.addEventListener('submit', async event => {
    event.preventDefault(); authStatus.textContent = 'Signing in…';
    const data = new FormData(loginForm);
    const { data: result, error } = await client.auth.signInWithPassword({ email: data.get('email'), password: data.get('password') });
    if (error) { authStatus.textContent = 'Sign in failed. Check your email and password.'; return; }
    await setSession(result.session);
  });
  client.auth.getSession().then(({ data }) => setSession(data.session));
  client.auth.onAuthStateChange((event, session) => {
    // Supabase emits PASSWORD_RECOVERY after validating a recovery link. Use
    // this signal as well as URL markers, which may be removed during parsing.
    if (event === 'PASSWORD_RECOVERY') passwordRecoveryPending = true;
    setTimeout(() => setSession(session), 0);
  });
  document.querySelector('#admin-signout').addEventListener('click', () => client.auth.signOut());
  document.querySelector('#admin-refresh').addEventListener('click', loadApplications);
  document.querySelector('#application-filter').addEventListener('change', render);
  document.querySelector('#inquiry-filter').addEventListener('change', renderInquiries);
}
