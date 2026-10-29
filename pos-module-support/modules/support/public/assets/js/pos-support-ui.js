// Desk-wide behaviour: confirmation before destructive actions
// (data-support-confirm on a button or form) and the mobile navigation drawer.
(function () {
  document.addEventListener('submit', (event) => {
    const button = event.submitter;
    const message = (button && button.dataset.supportConfirm) || event.target.dataset.supportConfirm;
    if (!message) return;
    const count = event.target.querySelectorAll('.pos-support-select:checked').length;
    if (!window.confirm(message.replace('%{count}', count))) event.preventDefault();
  });

  const toggle = document.querySelector('[data-support-nav-toggle]');
  if (!toggle) return;
  const rail = document.getElementById('pos-support-rail');
  const sync = () => toggle.setAttribute('aria-expanded', toggle.checked ? 'true' : 'false');
  sync();
  toggle.addEventListener('change', () => {
    sync();
    if (toggle.checked && rail) {
      const first = rail.querySelector('a');
      if (first) first.focus();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.checked) {
      toggle.checked = false;
      sync();
      toggle.focus();
    }
  });
})();
