// Queue keyboard shortcuts (05 §3): j/k move, x select, enter open, / search.
// Ignored while typing in a form field.
(function () {
  const rows = () => Array.from(document.querySelectorAll('.pos-support-row'));
  let index = -1;

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
        if (box) box.checked = !box.checked;
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
