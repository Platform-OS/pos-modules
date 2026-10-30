// Notification switches (07 §3): each switch is a real form; with JS it
// saves in place, flips at once and flips back if the save fails.
(function () {
  const failed = () => {
    if (window.pos && window.pos.modules && window.pos.modules.toast) {
      new window.pos.modules.toast('error', document.documentElement.dataset.supportSaveError || 'Not saved. Try again.');
    }
  };

  // Availability: the pressed button changes at once, and back if the save fails.
  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-support-availability-form]');
    if (!form) return;
    event.preventDefault();
    const group = form.closest('[role="group"]');
    const buttons = Array.from(group.querySelectorAll('button'));
    const before = buttons.map((b) => b.getAttribute('aria-pressed'));
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.form === form)));
    const data = new FormData(form);
    data.set('respond', 'json');
    try {
      const response = await fetch(form.action, { method: 'POST', body: data, credentials: 'same-origin' });
      if (!response.ok) throw new Error('save failed');
      const state = form.elements.value.value;
      const label = form.querySelector('button').textContent.trim();
      document.querySelectorAll('.pos-support-rail-user .pos-support-presence-dot').forEach((dot) => {
        dot.className = `pos-support-presence-dot pos-support-presence-${state}`;
        if (dot.nextSibling) dot.nextSibling.textContent = ` ${label}`;
      });
    } catch (error) {
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', before[i]));
      failed();
    }
  });

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
      const data = new FormData(form);
      data.set('respond', 'json');
      const response = await fetch(form.action, {
        method: 'POST',
        body: data,
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
