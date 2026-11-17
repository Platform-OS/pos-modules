// Ticket composer (05 §3): reply/note switch, saved replies, attachments,
// sending state, Ctrl/⌘+Enter and the unsaved-draft warning.
// Files are read in the browser and posted as base64 (decision-9: outbound
// attachments, option A), capped at 10 MB in total.
(function () {
  const form = document.querySelector('[data-support-composer]');
  if (!form) return;

  const MAX_BYTES = 10 * 1024 * 1024;
  const body = form.querySelector('textarea[name="body"]');
  const replyOnly = form.querySelectorAll('[data-support-reply-only]');
  const send = form.querySelector('[data-support-send]');
  const sendLabel = form.querySelector('[data-support-send-label]');
  let reading = Promise.resolve();
  let submitting = false;

  const syncMode = () => {
    const note = form.querySelector('input[name="mode"]:checked').value === 'note';
    form.classList.toggle('pos-support-composer-note', note);
    replyOnly.forEach((el) => { el.hidden = note; });
    if (sendLabel && !submitting) sendLabel.textContent = note ? form.dataset.noteLabel : form.dataset.sendLabel;
  };
  form.querySelectorAll('input[name="mode"]').forEach((input) => input.addEventListener('change', syncMode));
  syncMode();

  // a draft kept across the reload after a department change
  const draftKey = `pos-support-draft:${window.location.pathname}`;
  try {
    const draft = window.sessionStorage.getItem(draftKey);
    if (draft && body.value.trim() === '') body.value = draft;
    window.sessionStorage.removeItem(draftKey);
  } catch (error) { /* storage unavailable */ }

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
  const list = form.querySelector('[data-support-files-list]');
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
  // keep in step with lib/helpers/filesize.liquid, which labels the same
  // files once they are on the ticket
  const filesize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    const wholeKb = Math.round(kb);
    if (wholeKb < 1024) return `${wholeKb} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };
  const chip = (file) => {
    const item = document.createElement('span');
    item.className = 'pos-support-chip';
    item.textContent = `${file.name} · ${filesize(file.size)}`;
    return item;
  };

  // Every file chosen so far: choosing again adds to the list instead of
  // replacing it, and each chip has its own remove button. The posted fields
  // are rebuilt from this list.
  let attached = [];
  const renderAttached = () => {
    holder.textContent = '';
    if (list) list.textContent = '';
    attached.forEach((entry) => {
      holder.append(hidden('attachments[][filename]', entry.file.name));
      holder.append(hidden('attachments[][content_type]', entry.file.type || 'application/octet-stream'));
      holder.append(hidden('attachments[][content_base64]', entry.content));
      if (!list) return;
      const item = chip(entry.file);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'pos-support-chip-remove';
      remove.setAttribute('aria-label', `${form.dataset.removeFile || 'Remove'} ${entry.file.name}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        attached = attached.filter((other) => other !== entry);
        renderAttached();
        files.focus();
      });
      item.append(remove);
      list.append(item);
    });
  };

  // A refused or unreadable choice is explained at the file field; files
  // already attached stay. The message is shown once and not kept as a
  // validity error, so it never blocks sending the reply.
  const refuseFiles = (message) => {
    files.value = '';
    // the desk's inline message (pos-support-ui.js), not a browser bubble
    const fieldError = window.pos && window.pos.supportFieldError;
    if (fieldError) fieldError.show(files, message);
  };
  let readFailed = false;

  if (files) {
    files.addEventListener('change', () => {
      if (window.pos && window.pos.supportFieldError) window.pos.supportFieldError.clear(files);
      readFailed = false;
      const same = (a, b) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
      const chosen = Array.from(files.files).filter((file) => !attached.some((entry) => same(entry.file, file)));
      // the same file can be chosen again after it was removed
      files.value = '';
      const total = attached.concat(chosen.map((file) => ({ file }))).reduce((sum, entry) => sum + entry.file.size, 0);
      if (total > MAX_BYTES) {
        refuseFiles(form.dataset.tooLarge || 'Attachments are limited to 10 MB in total.');
        return;
      }
      reading = reading.then(async () => {
        for (const file of chosen) {
          const content = await readFile(file);
          attached.push({ file, content });
        }
        renderAttached();
      }).catch(() => {
        readFailed = true;
        renderAttached();
      });
    });
  }

  // one submission only; wait until the attachments are read
  form.addEventListener('submit', async (event) => {
    if (submitting) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    submitting = true;
    send.setAttribute('aria-busy', 'true');
    send.disabled = true;
    if (sendLabel) sendLabel.textContent = form.dataset.preparing || sendLabel.textContent;
    await reading;
    // a file that cannot be read is never dropped silently: nothing is sent
    // until the agent chooses the files again or removes them
    if (readFailed) {
      readFailed = false;
      submitting = false;
      send.removeAttribute('aria-busy');
      send.disabled = false;
      syncMode();
      refuseFiles(form.dataset.unreadable || 'A file could not be read. Choose it again.');
      return;
    }
    if (sendLabel) sendLabel.textContent = form.dataset.sending || sendLabel.textContent;
    window.removeEventListener('beforeunload', warn);
    HTMLFormElement.prototype.submit.call(form);
  });

  // @mentions in an internal note: typing "@" and the start of a name lists
  // the colleagues who can see this ticket; choosing one writes their full
  // name, which is what the server matches (queries/notes/mentioned_ids).
  const mentions = form.querySelector('[data-support-mentions]');
  if (mentions) {
    const options = Array.from(mentions.querySelectorAll('[role="option"]'));
    let shown = [];
    let active = -1;
    let start = -1;
    body.setAttribute('aria-autocomplete', 'list');
    body.setAttribute('aria-controls', mentions.id);
    const isNote = () => form.querySelector('input[name="mode"]:checked').value === 'note';
    const close = () => {
      mentions.hidden = true;
      body.removeAttribute('aria-activedescendant');
      body.setAttribute('aria-expanded', 'false');
      shown = [];
      active = -1;
      start = -1;
    };
    const highlight = (index) => {
      active = index;
      shown.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
      if (shown[index]) {
        body.setAttribute('aria-activedescendant', shown[index].id);
        shown[index].scrollIntoView({ block: 'nearest' });
      }
    };
    const choose = (option) => {
      const name = option.dataset.name;
      const before = body.value.slice(0, start);
      const after = body.value.slice(body.selectionStart);
      body.value = `${before}@${name} ${after.replace(/^\S*/, '')}`;
      const caret = before.length + name.length + 2;
      body.setSelectionRange(caret, caret);
      close();
      body.focus();
    };
    const update = () => {
      if (!isNote()) return close();
      const upto = body.value.slice(0, body.selectionStart);
      const match = upto.match(/(?:^|\s)@([\p{L}\p{N}.'-]*(?: [\p{L}\p{N}.'-]*)?)$/u);
      if (!match) return close();
      const typed = match[1].toLowerCase();
      start = upto.length - match[1].length - 1;
      shown = options.filter((option) => {
        const name = option.dataset.name.toLowerCase();
        const matches = name.startsWith(typed) || name.split(' ').some((part) => part.startsWith(typed));
        option.hidden = !matches;
        return matches;
      });
      if (shown.length === 0) return close();
      mentions.hidden = false;
      body.setAttribute('aria-expanded', 'true');
      highlight(0);
    };
    body.addEventListener('input', update);
    body.addEventListener('blur', () => window.setTimeout(close, 150));
    form.querySelectorAll('input[name="mode"]').forEach((input) => input.addEventListener('change', close));
    options.forEach((option) => {
      // mousedown keeps the focus in the textarea
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
        choose(option);
      });
    });
    body.addEventListener('keydown', (event) => {
      if (mentions.hidden || shown.length === 0) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        highlight((active + step + shown.length) % shown.length);
      } else if ((event.key === 'Enter' || event.key === 'Tab') && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        choose(shown[active]);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    });
  }

  body.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      form.requestSubmit(send);
    }
  });

  const warn = (event) => {
    if (body.value.trim() === '' || form.dataset.draftKept === 'true') return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', warn);
})();
