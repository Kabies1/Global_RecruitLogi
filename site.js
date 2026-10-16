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
if (form) form.addEventListener('submit', event => {
  event.preventDefault();
  const status = form.querySelector('[role="status"]');
  status.textContent = 'Thanks for reaching out. This form needs to be connected to your email or CRM before it can send messages.';
});
