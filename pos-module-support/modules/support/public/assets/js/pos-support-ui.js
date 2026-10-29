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

  // ticket page: j / k open the next / previous ticket of the queue it came from
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const link = event.key === 'j' ? document.querySelector('[data-support-next]') : event.key === 'k' ? document.querySelector('[data-support-prev]') : null;
    if (link) link.click();
  });

  // ticket properties save as soon as a choice changes; with a reply draft
  // open they save in the background so the draft is kept
  document.querySelectorAll('[data-support-autosave]').forEach((form) => {
    form.addEventListener('change', async (event) => {
      if (!event.target.matches('select, input[type="radio"]')) return;
      const draft = document.querySelector('[data-support-composer] textarea[name="body"]');
      if (!draft || draft.value.trim() === '') {
        form.requestSubmit();
        return;
      }
      const response = await fetch(form.action, { method: 'POST', body: new FormData(form), credentials: 'same-origin' }).catch(() => null);
      const ok = response && response.ok;
      if (window.pos && window.pos.modules && window.pos.modules.toast) {
        new window.pos.modules.toast(ok ? 'success' : 'error', ok ? form.dataset.saved : form.dataset.failed);
      }
    });
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
