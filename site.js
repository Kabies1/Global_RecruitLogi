const menu = document.querySelector('.menu');
const nav = document.querySelector('nav');
if (menu && nav) {
  menu.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', open);
    menu.textContent = open ? '×' : '☰';
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open');
    menu.setAttribute('aria-expanded', 'false');
    menu.textContent = '☰';
  }));
}
const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

const form = document.querySelector('[data-contact-form]');
if (form) form.addEventListener('submit', async event => {
  event.preventDefault();
  const status = form.querySelector('[role="status"]');
  const button = form.querySelector('button[type="submit"]');
  const config = window.SITE_CONFIG || {};

  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    status.textContent = 'The inquiry form is not connected yet. Please use one of the company email links on this page.';
    return;
  }

  const payload = {
    name: form.elements.namedItem('name').value.trim(),
    email: form.elements.namedItem('email').value.trim(),
    inquiry_type: form.elements.namedItem('inquiry_type').value,
    organization: form.elements.namedItem('organization').value.trim(),
    message: form.elements.namedItem('message').value.trim(),
    consent: form.elements.namedItem('consent').checked,
    website: form.elements.namedItem('company_website').value
  };

  button.disabled = true;
  status.textContent = 'Sending your inquiry…';
  try {
    const baseUrl = config.supabaseUrl.replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/functions/v1/submit-inquiry`, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (result.saved && !result.notified) {
      form.reset();
      status.textContent = 'Your inquiry was saved, but the email notification could not be delivered. Please call the company.';
      return;
    }
    if (!response.ok || !result.notified) throw new Error('Inquiry submission failed');
    form.reset();
    status.textContent = 'Thank you. Your inquiry was sent to our team.';
  } catch {
    status.textContent = 'We could not send your inquiry. Please try again later or use one of the company email links on this page.';
  } finally {
    button.disabled = false;
  }
});
