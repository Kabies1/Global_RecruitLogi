(() => {
  const form = document.querySelector('#candidate-application-form');
  if (!form) return;
  const config = window.SITE_CONFIG || {};
  const status = document.querySelector('#application-status');
  const submit = form.querySelector('button[type="submit"]');
  const availableStartDate = form.elements.namedItem('start_date');
  const localToday = () => { const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); return now.toISOString().slice(0, 10); };
  availableStartDate.min = localToday();
  const limits = { education: 8, employment: 8, credential: 10, reference: 4 };
  const definitions = {
    education: ['Institution / school|institution','Degree or qualification|degree','Field of study|field','Country|country','Completion year|completion_year'],
    employment: ['Facility name|facility','Facility type|facility_type','Position / title|title','Start date|start_date|date','End date|end_date|date','Specialties or unit|specialties','Responsibilities|responsibilities|textarea','Reason for leaving|reason_for_leaving'],
    credential: ['License / certification type|credential_type','License or registration number|number','Issuing state / authority|issuer','Expiration date|expiration_date|date','CPR / BLS / ACLS status (optional)|cpr_status'],
    reference: ['Full name|name','Title / role|title','Facility|facility','Phone|phone|tel','Email|email|email','Relationship|relationship']
  };
  const containers = { education: '#education-rows', employment: '#employment-rows', credential: '#credential-rows', reference: '#reference-rows' };
  function addRow(type, values = {}) {
    const container = document.querySelector(containers[type]);
    if (container.children.length >= limits[type]) return;
    const row = document.createElement('div'); row.className = `repeat-row ${type}-row`;
    const grid = document.createElement('div'); grid.className = 'form-grid';
    for (const definition of definitions[type]) {
      const [label, name, kind = 'text'] = definition.split('|');
      const wrap = document.createElement('label'); wrap.textContent = label;
      const control = kind === 'textarea' ? document.createElement('textarea') : document.createElement('input');
      control.name = `${type}_${name}[]`; control.dataset.field = name;
      if (kind !== 'textarea') control.type = kind;
      if (kind === 'textarea') control.rows = 2;
      control.maxLength = 1200;
      if (values[name]) control.value = values[name];
      wrap.append(control); grid.append(wrap);
    }
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-row'; remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${type} entry`); remove.addEventListener('click', () => row.remove());
    row.append(grid, remove); container.append(row);
  }
  function rows(type) {
    return [...document.querySelector(containers[type]).children].map(row => Object.fromEntries(
      [...row.querySelectorAll('[data-field]')].map(input => [input.dataset.field, input.value.trim()])
    )).filter(item => Object.values(item).some(Boolean));
  }
  document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => addRow(button.dataset.add)));
  addRow('education'); addRow('employment'); addRow('credential'); addRow('reference'); addRow('reference');
  const disciplineSelect = form.elements.namedItem('disciplinary_action');
  const disciplineWrap = document.querySelector('[data-discipline-wrap]');
  const disciplineExplanation = form.elements.namedItem('disciplinary_explanation');
  disciplineSelect.addEventListener('change', () => {
    const visible = disciplineSelect.value === 'yes';
    disciplineWrap.hidden = !visible; disciplineExplanation.required = visible;
    if (!visible) disciplineExplanation.value = '';
  });
  disciplineWrap.hidden = true;

  availableStartDate.addEventListener('input', () => availableStartDate.setCustomValidity(''));

  form.addEventListener('submit', async event => {
    event.preventDefault(); status.textContent = '';
    const today = localToday();
    availableStartDate.min = today;
    availableStartDate.setCustomValidity(availableStartDate.value && availableStartDate.value < today ? 'Choose today or a future date.' : '');
    if (!form.reportValidity()) return;
    if (!form.querySelector('[name="shifts"]:checked')) { status.textContent = 'Please choose at least one preferred shift.'; form.querySelector('[name="shifts"]').focus(); return; }
    const file = form.elements.namedItem('cv_file').files[0];
    const cvText = form.elements.namedItem('cv_text').value.trim();
    if ((!file && !cvText) || (file && cvText)) {
      status.textContent = 'Please provide either a CV file or pasted CV text, but not both.'; return;
    }
    if (file && file.size > 8 * 1024 * 1024) { status.textContent = 'Your CV file must be 8 MB or smaller.'; return; }
    if (rows('education').length < 1 || rows('education').some(item => !item.institution || !item.degree)) {
      status.textContent = 'Add at least one education entry with its school and qualification.'; return;
    }
    if (rows('reference').length < 2 || rows('reference').slice(0, 2).some(item => !item.name || !item.phone || !item.email)) {
      status.textContent = 'Please complete at least two references, including their name, phone and email.'; return;
    }
    if (!config.supabaseUrl || !config.supabasePublishableKey) {
      status.textContent = 'The application service is not connected. Please contact our team.'; return;
    }
    const data = new FormData(form);
    const value = name => form.elements.namedItem(name).value;
    const checked = name => form.elements.namedItem(name).checked;
    const payload = {
      legal_first_name: value('legal_first_name'), legal_middle_name: value('legal_middle_name'), legal_last_name: value('legal_last_name'),
      email: value('email'), phone: value('phone'), contact_preference: value('contact_preference'),
      address: { street: value('street'), unit: value('unit'), city: value('city'), state: value('state'), postal_code: value('postal_code'), country: value('country') },
      profession: value('profession'), desired_role: value('desired_role'), work_eligibility: value('eligible_to_work'),
      education: rows('education'), employment_history: rows('employment'), credentials: rows('credential'),
      disciplinary_action: value('disciplinary_action') === 'yes', disciplinary_explanation: value('disciplinary_explanation'),
      references: rows('reference'), availability: {
        employment_status: value('employment_status'), shifts: [...form.querySelectorAll('[name="shifts"]:checked')].map(input => input.value),
        travel: checked('travel'), on_call: checked('on_call'), start_date: value('start_date')
      },
      background_check_consent: checked('background_check_consent'), exclusion_screening_consent: checked('exclusion_screening_consent'),
      health_verification_acknowledged: checked('health_verification_acknowledged'), reference_contact_consent: checked('reference_contact_consent'),
      future_opportunities_consent: checked('future_opportunities_consent'),
      privacy_consent: checked('privacy_consent'), declaration_accepted: checked('declaration_accepted'), electronic_signature: value('electronic_signature')
    };
    data.set('application', JSON.stringify(payload));
    if (!file) data.delete('cv_file');
    data.set('cv_text', cvText);
    submit.disabled = true; submit.textContent = 'Submitting…'; status.textContent = 'Submitting your application securely…';
    try {
      const response = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/submit-application`, {
        method: 'POST', headers: { apikey: config.supabasePublishableKey }, body: data
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.saved) throw new Error(result.error || 'Application submission failed');
      form.reset(); document.querySelectorAll('.repeat-list').forEach(container => container.replaceChildren());
      addRow('education'); addRow('employment'); addRow('credential'); addRow('reference'); addRow('reference');
      disciplineWrap.hidden = true;
      status.textContent = result.notified
        ? 'Thank you. Your application was received and our recruiting team was notified.'
        : 'Your application was safely received. The team notification is delayed; our recruiting team can review it in the admin portal.';
      status.classList.add('success-message');
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'We could not submit the application. Please try again or contact our team.';
      status.classList.remove('success-message');
    } finally { submit.disabled = false; submit.innerHTML = 'Submit application <span>↗</span>'; }
  });
})();
