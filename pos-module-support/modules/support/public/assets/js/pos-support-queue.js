// Queue keyboard shortcuts (05 §3): j/k move, x select, enter open, / search.
// Ignored while typing in a form field. Also shows the bulk bar only while
// tickets are selected and applies a filter as soon as a select changes.
(function () {
  const rows = () => Array.from(document.querySelectorAll('.pos-support-row:not([hidden])'));

  // swim lanes open and close; the choice is remembered per lane in this browser
  const STORE = 'pos-support-closed-lanes';
  const readClosed = () => { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch (e) { return []; } };
  const writeClosed = (list) => { try { localStorage.setItem(STORE, JSON.stringify(list)); } catch (e) { /* storage unavailable */ } };
  const setLane = (lane, open) => {
    const toggle = lane.querySelector('[data-support-lane-toggle]');
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    lane.querySelectorAll('tr:not(.pos-support-lane-head)').forEach((tr) => { tr.hidden = !open; });
    lane.classList.toggle('pos-support-lane-closed', !open);
  };
  const closed = readClosed();
  document.querySelectorAll('.pos-support-lane').forEach((lane) => {
    if (closed.includes(lane.dataset.lane)) setLane(lane, false);
  });
  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-support-lane-toggle]');
    if (!toggle) return;
    const lane = toggle.closest('.pos-support-lane');
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setLane(lane, open);
    const list = readClosed().filter((key) => key !== lane.dataset.lane);
    if (!open) list.push(lane.dataset.lane);
    writeClosed(list);
  });
  let index = -1;

  const bar = document.querySelector('[data-support-bulk-bar]');
  const countLabel = document.querySelector('[data-support-bulk-count]');
  const selectedText = (n) => (bar && bar.closest('form').dataset.selectedTemplate || '{count} selected').replace('{count}', n);

  const updateBulk = () => {
    if (!bar) return;
    const n = document.querySelectorAll('.pos-support-select:checked').length;
    bar.classList.toggle('pos-support-bulk-active', n > 0);
    if (countLabel) countLabel.textContent = n > 0 ? selectedText(n) : '';
  };

  // Bulk changes run in the background on the server: post the form without
  // leaving the page, so the live channel can report the result here.
  const bulkForm = bar && bar.closest('form');
  const notify = (kind, message) => {
    if (window.pos && window.pos.modules && window.pos.modules.toast) new window.pos.modules.toast(kind, message);
  };
  if (bulkForm && window.fetch) {
    document.addEventListener('submit', async (event) => {
      if (event.target !== bulkForm || event.defaultPrevented) return;
      event.preventDefault();
      const data = new FormData(bulkForm, event.submitter);
      data.set('respond', 'json');
      const buttons = bulkForm.querySelectorAll('button');
      buttons.forEach((button) => { button.disabled = true; });
      try {
        const response = await fetch(bulkForm.action, { method: 'POST', body: data, credentials: 'same-origin' });
        const body = await response.json();
        if (!body.ok) {
          notify('error', body.error || bulkForm.dataset.failedText);
          return;
        }
        notify('info', bulkForm.dataset.startedText);
        document.querySelectorAll('.pos-support-select:checked').forEach((box) => { box.checked = false; });
        bulkForm.querySelectorAll('select').forEach((select) => { select.selectedIndex = 0; });
        updateBulk();
      } catch (error) {
        notify('error', bulkForm.dataset.failedText);
      } finally {
        buttons.forEach((button) => { button.disabled = false; });
      }
    });
  }

  document.addEventListener('change', (event) => {
    if (event.target.matches('.pos-support-select')) updateBulk();
    if (event.target.matches('[data-support-autosubmit] select, [data-support-autosubmit] input[type="checkbox"]')) event.target.form.requestSubmit();
  });
  updateBulk();

  const focusRow = (next) => {
    const list = rows();
    if (list.length === 0) return;
    index = Math.max(0, Math.min(list.length - 1, next));
    list.forEach((row) => row.classList.remove('pos-support-row-focused'));
    const row = list[index];
    row.classList.add('pos-support-row-focused');
    const link = row.querySelector('.pos-support-subject a');
    if (link) link.focus();
  };

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;

    const list = rows();
    switch (event.key) {
      case 'j':
        focusRow(index + 1);
        break;
      case 'k':
        focusRow(index - 1);
        break;
      case 'x': {
        const row = list[index];
        const box = row && row.querySelector('.pos-support-select');
        if (box) {
          box.checked = !box.checked;
          updateBulk();
        }
        break;
      }
      case '/': {
        const search = document.querySelector('[data-support-search]');
        if (search) {
          event.preventDefault();
          search.focus();
        }
        break;
      }
      default:
        return;
    }
  });
})();
