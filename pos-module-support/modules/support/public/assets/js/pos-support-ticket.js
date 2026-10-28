// Ticket composer (05 §3): reply/note switch, saved replies, attachments.
// Files are read in the browser and posted as base64 (decision-9: outbound
// attachments, option A), capped at 10 MB in total.
(function () {
  const form = document.querySelector('[data-support-composer]');
  if (!form) return;

  const MAX_BYTES = 10 * 1024 * 1024;
  const body = form.querySelector('textarea[name="body"]');
  const replyOnly = form.querySelectorAll('[data-support-reply-only]');

  const syncMode = () => {
    const note = form.querySelector('input[name="mode"]:checked').value === 'note';
    form.classList.toggle('pos-support-composer-note', note);
    replyOnly.forEach((el) => { el.hidden = note; });
  };
  form.querySelectorAll('input[name="mode"]').forEach((input) => input.addEventListener('change', syncMode));
  syncMode();

  const saved = form.querySelector('[data-support-saved]');
  if (saved) {
    saved.addEventListener('change', () => {
      const option = saved.selectedOptions[0];
      if (option && option.dataset.text) {
        body.value = body.value ? body.value + '\n\n' + option.dataset.text : option.dataset.text;
        body.focus();
      }
      saved.value = '';
    });
  }

  const files = form.querySelector('[data-support-files]');
  const holder = form.querySelector('[data-support-files-fields]');
  const readFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const hidden = (name, value) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    return input;
  };

  if (files) {
    files.addEventListener('change', async () => {
      holder.textContent = '';
      const list = Array.from(files.files);
      const total = list.reduce((sum, file) => sum + file.size, 0);
      if (total > MAX_BYTES) {
        files.value = '';
        files.setCustomValidity(files.dataset.tooLarge || 'Attachments are limited to 10 MB in total.');
        files.reportValidity();
        return;
      }
      files.setCustomValidity('');
      for (const file of list) {
        const content = await readFile(file);
        holder.append(hidden('attachments[][filename]', file.name));
        holder.append(hidden('attachments[][content_type]', file.type || 'application/octet-stream'));
        holder.append(hidden('attachments[][content_base64]', content));
      }
    });
  }
})();
