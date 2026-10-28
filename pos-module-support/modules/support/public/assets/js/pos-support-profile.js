// Notification switches (07 §3): each switch is a real form; with JS it
// saves in place, flips at once and flips back if the save fails.
(function () {
  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-support-switch-form]');
    if (!form) return;
    event.preventDefault();

    const button = form.querySelector('[role="switch"]');
    const valueInput = form.querySelector('input[name="value"]');
    const wasOn = button.getAttribute('aria-checked') === 'true';
    button.setAttribute('aria-checked', String(!wasOn));
    button.disabled = true;

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
        credentials: 'same-origin'
      });
      if (!response.ok) throw new Error('save failed');
      valueInput.value = String(wasOn);
    } catch (error) {
      button.setAttribute('aria-checked', String(wasOn));
      if (window.pos && window.pos.modules && window.pos.modules.toast) {
        new window.pos.modules.toast('error', document.documentElement.dataset.supportSaveError || 'Not saved. Try again.');
      } else {
        alert('Not saved. Try again.');
      }
    } finally {
      button.disabled = false;
    }
  });
})();
